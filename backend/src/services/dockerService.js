const { execFile } = require('child_process');

/**
 * Runs `docker build` using the temporary repository directory as context.
 * 
 * @param {object} options
 * @param {string} options.imageName - User provided Docker image name
 * @param {string} options.buildContextDir - Absolute path to build context directory
 * @returns {Promise<{ success: boolean, imageName: string, tag: string, output: string, error?: string }>}
 */
function buildDockerImage({ imageName, buildContextDir }) {
  return new Promise((resolve) => {
    const tag = 'latest';
    const fullTag = `${imageName}:${tag}`;

    // Execute docker build safely via execFile
    const dockerProcess = execFile(
      'docker',
      ['build', '-t', fullTag, buildContextDir],
      { timeout: 600000 }, // 10 minutes timeout
      (error, stdout, stderr) => {
        const fullOutput = (stdout || '') + '\n' + (stderr || '');

        if (error) {
          return resolve({
            success: false,
            message: 'Docker build failed',
            error: stderr || error.message || 'Docker build process exited with an error.',
            output: fullOutput.trim()
          });
        }

        resolve({
          success: true,
          message: 'Docker image built successfully',
          imageName,
          tag,
          output: fullOutput.trim()
        });
      }
    );
  });
}

const http = require('http');

/**
 * Runs the built Docker container locally mapping host port to application container port (-p hostPort:appPort),
 * injecting environment variables (-e KEY=VALUE).
 * 
 * @param {object} options
 * @param {string} options.imageName
 * @param {number} [options.port]
 * @param {number} [options.appPort]
 * @param {number} [options.hostPort]
 * @param {object} [options.envVars]
 * @param {boolean} [options.isWeb]
 * @returns {Promise<{ success: boolean, containerId?: string, error?: string, runCommand: string }>}
 */
function runDockerContainer({ imageName, port, appPort, hostPort, envVars = {}, isWeb = true }) {
  const targetAppPort = appPort !== undefined ? appPort : port;
  const targetHostPort = hostPort !== undefined ? hostPort : targetAppPort;

  const containerName = `${imageName}-container`;
  
  // Format environment variable arguments
  const envArgs = [];
  const envCmdStringParts = [];
  if (envVars && typeof envVars === 'object') {
    for (const [key, value] of Object.entries(envVars)) {
      if (key && value !== undefined) {
        envArgs.push('-e', `${key}=${value}`);
        envCmdStringParts.push(`-e ${key}="${value}"`);
      }
    }
  }

  const envCmdStr = envCmdStringParts.length > 0 ? ` ${envCmdStringParts.join(' ')}` : '';
  const portArgStr = (isWeb && targetHostPort && targetAppPort) ? `-p ${targetHostPort}:${targetAppPort} ` : '';
  const runCommand = `docker run -d ${portArgStr}${envCmdStr}--name ${containerName} ${imageName}:latest`.trim();

  return new Promise((resolve) => {
    // Stop and remove existing container with the same name if present
    execFile('docker', ['rm', '-f', containerName], () => {
      const dockerArgs = ['run', '-d'];
      if (isWeb && targetHostPort && targetAppPort) {
        dockerArgs.push('-p', `${targetHostPort}:${targetAppPort}`);
      }
      dockerArgs.push(...envArgs);
      dockerArgs.push('--name', containerName, `${imageName}:latest`);

      // Run new container
      execFile(
        'docker',
        dockerArgs,
        { timeout: 30000 },
        (error, stdout, stderr) => {
          if (error) {
            return resolve({
              success: false,
              runCommand,
              error: (stderr || error.message || '').trim()
            });
          }
          resolve({
            success: true,
            containerId: (stdout || '').trim().substring(0, 12),
            runCommand
          });
        }
      );
    });
  });
}

/**
 * Polls container health and tests HTTP reachability on hostPort.
 * 
 * @param {number} hostPort 
 * @param {number} retries 
 * @param {number} delayMs 
 * @returns {Promise<{ reachable: boolean, statusCode?: number, message: string }>}
 */
function verifyContainerReachability(hostPort, retries = 5, delayMs = 1000) {
  return new Promise((resolve) => {
    let attempt = 0;

    const check = () => {
      attempt++;
      const req = http.get(`http://localhost:${hostPort}`, (res) => {
        resolve({
          reachable: true,
          statusCode: res.statusCode,
          message: `Application is reachable on http://localhost:${hostPort} (HTTP Status ${res.statusCode})`
        });
      });

      req.on('error', (err) => {
        if (attempt < retries) {
          setTimeout(check, delayMs);
        } else {
          resolve({
            reachable: false,
            message: `Could not connect to http://localhost:${hostPort}: ${err.message}`
          });
        }
      });

      req.setTimeout(2000, () => {
        req.destroy();
      });
    };

    setTimeout(check, 1000);
  });
}

module.exports = {
  buildDockerImage,
  runDockerContainer,
  verifyContainerReachability
};

