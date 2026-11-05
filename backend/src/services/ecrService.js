const { execFile } = require('child_process');

/** Environment variables required for the GitHub → ECR pipeline. */
const REQUIRED_ECR_ENV = [
  'AWS_REGION',
  'AWS_ACCOUNT_ID',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'ECR_REPOSITORY'
];

/**
 * Returns the list of required ECR environment variables that are missing/empty.
 * Values are never exposed — only the variable names.
 * @returns {string[]}
 */
function getMissingEcrEnv() {
  return REQUIRED_ECR_ENV.filter((name) => !process.env[name] || !process.env[name].trim());
}

/**
 * Removes any configured AWS credential values from a string before it is
 * logged or returned in an API response. Credentials must never be exposed.
 * @param {string} text
 * @returns {string}
 */
function redactSecrets(text) {
  if (!text) return '';
  let out = String(text);
  for (const key of ['AWS_SECRET_ACCESS_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SESSION_TOKEN']) {
    const value = process.env[key];
    if (value && value.trim().length > 3) {
      out = out.split(value).join('***REDACTED***');
    }
  }
  return out;
}

/**
 * Normalizes ECR_REPOSITORY to a bare repository name.
 * Accepts either "my-repo" or a full URI like
 * "123456789012.dkr.ecr.us-east-1.amazonaws.com/my-repo".
 * @param {string} raw
 * @returns {string}
 */
function normalizeEcrRepository(raw) {
  let repo = String(raw || '').trim();
  const uriMatch = repo.match(/\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\/(.+)$/i);
  if (uriMatch) repo = uriMatch[1];
  repo = repo.replace(/^\/+/, '').replace(/\/+$/, '');
  return repo;
}

/**
 * Executes a command, falling back to alternative executable names when the
 * primary one is not found (e.g. "aws" → "aws.exe" / "aws.cmd" on Windows).
 *
 * @param {string[]} candidates - Executable names to try in order
 * @param {string[]} args
 * @param {object} options - child_process execFile options (env, timeout, ...)
 * @returns {Promise<{ success: boolean, stdout: string, stderr: string, error?: Error }>}
 */
function runCommand(candidates, args, options = {}) {
  return new Promise((resolve) => {
    const attempt = (index, lastError) => {
      if (index >= candidates.length) {
        return resolve({
          success: false,
          stdout: '',
          stderr: redactSecrets(lastError ? lastError.message : 'Command not found'),
          error: lastError
        });
      }
      execFile(candidates[index], args, options, (error, stdout = '', stderr = '') => {
        if (error && error.code === 'ENOENT') {
          return attempt(index + 1, error);
        }
        if (error) {
          return resolve({
            success: false,
            stdout: String(stdout),
            stderr: redactSecrets(stderr || error.message),
            error
          });
        }
        resolve({ success: true, stdout: String(stdout), stderr: String(stderr) });
      });
    };
    attempt(0, null);
  });
}

/**
 * Constructs the ECR registry URL and full image URI.
 * Registry format: {AWS_ACCOUNT_ID}.dkr.ecr.{AWS_REGION}.amazonaws.com
 * Image URI:      {registry}/{ECR_REPOSITORY}:{tag}
 *
 * @param {string} deploymentId - Unique deployment ID used for the image tag
 * @returns {{ registry: string, ecrRepo: string, tag: string, imageUri: string }}
 */
function buildEcrImageUri(deploymentId) {
  const region = process.env.AWS_REGION;
  const accountId = process.env.AWS_ACCOUNT_ID;
  const ecrRepo = normalizeEcrRepository(process.env.ECR_REPOSITORY);

  if (!region || !accountId || !ecrRepo) {
    throw new Error(
      'Missing ECR configuration. Ensure AWS_REGION, AWS_ACCOUNT_ID, and ECR_REPOSITORY are set in .env'
    );
  }

  const registry = `${accountId}.dkr.ecr.${region}.amazonaws.com`;
  // Unique, Docker/ECR-safe tag derived from the deployment ID
  const rawTag = deploymentId ? `deploy-${deploymentId}` : 'latest';
  const tag = rawTag.replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 128);
  const imageUri = `${registry}/${ecrRepo}:${tag}`;

  return { registry, ecrRepo, tag, imageUri };
}

/**
 * Authenticates Docker to Amazon ECR using the AWS CLI.
 * Credentials are read from environment variables and only passed to the
 * child process environment — they are never logged or returned.
 *
 * @returns {Promise<{ success: boolean, registry?: string, error?: string }>}
 */
async function authenticateEcr() {
  const region = process.env.AWS_REGION;
  const accountId = process.env.AWS_ACCOUNT_ID;

  if (!region || !accountId) {
    return { success: false, error: 'AWS_REGION and AWS_ACCOUNT_ID must be set in .env' };
  }

  const registry = `${accountId}.dkr.ecr.${region}.amazonaws.com`;

  const awsEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: region,
    AWS_DEFAULT_REGION: region,
    AWS_PAGER: '' // prevent the AWS CLI pager from blocking
  };

  // Step 1: Get ECR login password via AWS CLI (never logged)
  const login = await runCommand(
    ['aws', 'aws.exe', 'aws.cmd'],
    ['ecr', 'get-login-password', '--region', region],
    { env: awsEnv, timeout: 30000, windowsHide: true }
  );

  if (!login.success) {
    return {
      success: false,
      error: `AWS CLI authentication failed: ${login.stderr || 'unknown error'}`
    };
  }

  const loginPassword = login.stdout.trim();
  if (!loginPassword) {
    return { success: false, error: 'AWS CLI returned empty login password. Check credentials.' };
  }

  // Step 2: Pipe the login password into `docker login` via stdin
  return new Promise((resolve) => {
    const dockerCandidates = ['docker', 'docker.exe'];
    const attempt = (index) => {
      if (index >= dockerCandidates.length) {
        return resolve({ success: false, error: 'Docker CLI not found. Is Docker installed and running?' });
      }

      const child = execFile(
        dockerCandidates[index],
        ['login', '--username', 'AWS', '--password-stdin', registry],
        { timeout: 30000, windowsHide: true },
        (error, _stdout, stderr) => {
          if (error && error.code === 'ENOENT') {
            return attempt(index + 1);
          }
          if (error) {
            return resolve({
              success: false,
              error: `Docker login to ECR failed: ${redactSecrets(stderr || error.message)}`
            });
          }
          resolve({ success: true, registry });
        }
      );

      // Write the login password to docker login stdin (never logged)
      if (child.stdin) {
        child.stdin.on('error', () => {}); // ignore EPIPE if the process failed to start
        try {
          child.stdin.write(loginPassword);
          child.stdin.end();
        } catch (_) {
          // stdin closed prematurely — the callback reports the failure
        }
      }
    };
    attempt(0);
  });
}

/**
 * Tags an existing local Docker image with the ECR image URI.
 *
 * @param {string} localImageName - Local image name (e.g. "my-app:latest")
 * @param {string} ecrImageUri    - Full ECR image URI to tag with
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
function tagImageForEcr(localImageName, ecrImageUri) {
  const localFullTag = localImageName.includes(':') ? localImageName : `${localImageName}:latest`;

  return runCommand(['docker', 'docker.exe'], ['tag', localFullTag, ecrImageUri], {
    timeout: 30000,
    windowsHide: true
  }).then((result) =>
    result.success
      ? { success: true }
      : { success: false, error: `Docker tag failed: ${result.stderr}` }
  );
}

/**
 * Pushes a tagged Docker image to Amazon ECR.
 *
 * @param {string} ecrImageUri - Full ECR image URI to push
 * @returns {Promise<{ success: boolean, output?: string, error?: string }>}
 */
async function pushImageToEcr(ecrImageUri) {
  // 10 minutes — large images can be slow
  const result = await runCommand(
    ['docker', 'docker.exe'],
    ['push', ecrImageUri],
    { timeout: 600000, windowsHide: true }
  );

  const output = redactSecrets(((result.stdout || '') + '\n' + (result.stderr || '')).trim());

  if (!result.success) {
    return {
      success: false,
      error: `Docker push to ECR failed: ${result.stderr}`,
      output
    };
  }

  return { success: true, output };
}

/**
 * Full ECR pipeline: validate config → authenticate → tag → push.
 *
 * @param {object} options
 * @param {string} options.localImageName - Local Docker image name (built during /api/build)
 * @param {string} options.deploymentId   - Unique deployment ID for the ECR image tag
 * @returns {Promise<{ success: boolean, imageUri?: string, tag?: string, registry?: string,
 *                     output?: string, error?: string, step?: string }>}
 */
async function pushToEcr({ localImageName, deploymentId }) {
  // Step 0: Validate ECR environment configuration
  const missing = getMissingEcrEnv();
  if (missing.length > 0) {
    return {
      success: false,
      error: `Missing required environment variables: ${missing.join(', ')}. Add them to your .env file.`,
      step: 'config'
    };
  }

  // Build the ECR URI (throws if env vars are invalid)
  let ecrInfo;
  try {
    ecrInfo = buildEcrImageUri(deploymentId);
  } catch (err) {
    return { success: false, error: err.message, step: 'config' };
  }

  const { registry, tag, imageUri } = ecrInfo;

  // Step 1: Authenticate to ECR
  const authResult = await authenticateEcr();
  if (!authResult.success) {
    return { success: false, error: authResult.error, step: 'auth', registry };
  }

  // Step 2: Tag local image with the deployment-tagged ECR URI
  const tagResult = await tagImageForEcr(localImageName, imageUri);
  if (!tagResult.success) {
    return { success: false, error: tagResult.error, step: 'tag', registry, imageUri, tag };
  }

  // Step 3: Push to ECR
  const pushResult = await pushImageToEcr(imageUri);
  if (!pushResult.success) {
    return {
      success: false,
      error: redactSecrets(pushResult.error),
      output: pushResult.output,
      step: 'push',
      registry,
      imageUri,
      tag
    };
  }

  return {
    success: true,
    imageUri,
    registry,
    tag,
    output: pushResult.output,
    step: 'done'
  };
}

module.exports = {
  pushToEcr,
  buildEcrImageUri,
  getMissingEcrEnv,
  redactSecrets,
  REQUIRED_ECR_ENV
};
