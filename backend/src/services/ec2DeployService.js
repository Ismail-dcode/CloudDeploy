/**
 * ec2DeployService — deploys an ECR image onto a fresh EC2 instance.
 *
 * Lifecycle (each stage is set from REAL signals — EC2 state, status checks,
 * SSM bootstrap markers and an HTTP health check; never from timers alone):
 *
 *   pending → provisioning → instance_running → docker_installing
 *           → pulling_image → starting_container → health_check → deployed
 *
 * Any failure sets status=failed with a safe message and cleans up the
 * partially created resources (instance terminated, security group removed,
 * secret parameters deleted). Shared resources (runner IAM role/profile,
 * reusable security group) are created once and reused.
 */
const crypto = require('crypto');
const {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  DescribeInstanceStatusCommand,
  TerminateInstancesCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  RevokeSecurityGroupIngressCommand,
  DeleteSecurityGroupCommand,
  DescribeSecurityGroupsCommand,
  CreateTagsCommand
} = require('@aws-sdk/client-ec2');
const {
  SSMClient,
  GetParameterCommand,
  DescribeInstanceInformationCommand,
  SendCommandCommand,
  GetCommandInvocationCommand,
  PutParameterCommand,
  DeleteParametersCommand
} = require('@aws-sdk/client-ssm');
const {
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  GetInstanceProfileCommand,
  CreateInstanceProfileCommand,
  AddRoleToInstanceProfileCommand,
  PutRolePolicyCommand
} = require('@aws-sdk/client-iam');

const storage = require('./storage');
const { redactSecrets } = require('./ecrService');

// ─────────────────────────────────────────────────────────────────────────────
// Configuration (read from environment — never hardcoded)
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_DEPLOY_ENV = [
  'AWS_REGION',
  'EC2_VPC_ID',
  'EC2_SUBNET_ID'
];

const RUNNER_ROLE_NAME = process.env.EC2_ROLE_NAME || 'clouddeploy-ec2-runner';
const RUNNER_PROFILE_NAME = process.env.EC2_INSTANCE_PROFILE || 'clouddeploy-ec2-runner';
const RUNNER_POLICY_ARN = 'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly';
// SSM agent management (AWS managed) — lets the backend read bootstrap state
const RUNNER_SSM_POLICY_ARN = 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore';
// Scoped inline policy: read ONLY this app's secret parameters
const RUNNER_SECRET_POLICY_NAME = 'CloudDeployRunnerSecrets';
// Public SSM parameter for the latest Amazon Linux 2023 AMI (x86_64)
const AMI_SSM_PARAMETER = '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64';
// Prefix for per-deployment secret parameters
const SECRET_PARAM_PREFIX = '/clouddeploy';

const ALLOWED_INSTANCE_TYPES = [
  't3.micro', 't3.small', 't3.medium',
  't3a.micro', 't3a.small', 't3a.medium',
  't2.micro', 't2.small', 't2.medium'
];

// Deployment lifecycle stages in order
const STAGES = [
  'pending',
  'provisioning',
  'instance_running',
  'docker_installing',
  'pulling_image',
  'starting_container',
  'health_check',
  'deployed'
];

const STAGE_PROGRESS = {
  pending: 5,
  provisioning: 15,
  instance_running: 30,
  docker_installing: 50,
  pulling_image: 65,
  starting_container: 75,
  health_check: 85,
  deployed: 100
};

function getMissingDeployEnv() {
  return REQUIRED_DEPLOY_ENV.filter((key) => !process.env[key] || !process.env[key].trim());
}

function getDeployConfig() {
  const missing = getMissingDeployEnv();
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Add them to backend/.env`);
  }
  return {
    region: process.env.AWS_REGION.trim(),
    accountId: (process.env.AWS_ACCOUNT_ID || '').trim(),
    vpcId: process.env.EC2_VPC_ID.trim(),
    subnetId: process.env.EC2_SUBNET_ID.trim(),
    defaultInstanceType: (process.env.EC2_INSTANCE_TYPE || 't3.micro').trim(),
    keyName: (process.env.EC2_KEY_NAME || '').trim() || null,
    amiId: (process.env.EC2_AMI_ID || '').trim() || null
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AWS clients — default credential chain (env vars from .env, no hardcoding)
// Clients are cached per region (a deployment may target the configured region)
// ─────────────────────────────────────────────────────────────────────────────

const ec2Clients = {};
const ssmClients = {};
let iamClient = null;

function ec2(region) {
  const r = region || getDeployConfig().region;
  if (!ec2Clients[r]) ec2Clients[r] = new EC2Client({ region: r });
  return ec2Clients[r];
}

function ssm(region) {
  const r = region || getDeployConfig().region;
  if (!ssmClients[r]) ssmClients[r] = new SSMClient({ region: r });
  return ssmClients[r];
}

function iam() {
  if (!iamClient) iamClient = new IAMClient({ region: getDeployConfig().region });
  return iamClient;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function newDeploymentId() {
  return `ec2dpl_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function slugify(id) {
  return String(id)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Removes user-provided secret values and AWS credentials from logged text. */
function redactAll(text, secretValues = []) {
  let out = redactSecrets(text || '');
  for (const value of secretValues) {
    if (typeof value === 'string' && value.length >= 4) {
      out = out.split(value).join('***REDACTED***');
    }
  }
  return out;
}

function log(deploymentId, level, message) {
  storage.appendDeploymentLog(deploymentId, level, message);
}

/** Updates a deployment record ONLY if it still exists (user may delete mid-run). */
function saveIfPresent(deploymentId, patch) {
  if (!storage.getDeployment(deploymentId)) return null;
  return storage.saveDeployment({ id: deploymentId, ...patch });
}

/** Sets a lifecycle stage with its canonical progress percentage. */
function setStage(deploymentId, stage, patch = {}) {
  saveIfPresent(deploymentId, {
    status: stage,
    progress: STAGE_PROGRESS[stage] || 0,
    ...patch
  });
}

/** Single-quote shell escaping — neutralizes command injection in user-data. */
function shq(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const ECR_IMAGE_RE = /^(\d{12})\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\/[a-z0-9._\/-]+:[A-Za-z0-9_.-]+$/;
const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d$/;
const INSTANCE_NAME_RE = /^[\w\s.-]{0,128}$/;
const MAX_CONTAINERS = 5;
const MAX_ENV_VARS = 30;

/**
 * Validates the deployment configuration submitted by the UI.
 * Returns { isValid, errors, sanitized } — never throws.
 */
function validateDeploymentConfig(input = {}) {
  const errors = [];
  const cfg = safeConfigOrNull();

  // Image URI must be an ECR image from THIS account (least exposure)
  const imageUri = String(input.imageUri || '').trim();
  if (!imageUri) {
    errors.push('imageUri is required (push the image to ECR first)');
  } else if (!ECR_IMAGE_RE.test(imageUri)) {
    errors.push('imageUri must be a full ECR image URI (registry/repo:tag)');
  } else if (cfg && cfg.accountId && !imageUri.startsWith(`${cfg.accountId}.dkr.ecr.`)) {
    errors.push('imageUri must come from your own ECR registry in this AWS account');
  }

  // Region — the VPC/subnet are region-bound, so it must match the configured region
  const region = String(input.region || (cfg && cfg.region) || '').trim();
  if (!REGION_RE.test(region)) {
    errors.push('region must be a valid AWS region id (e.g. us-east-1)');
  } else if (cfg && region !== cfg.region) {
    errors.push(`region must be ${cfg.region} — the configured VPC/subnet live in that region (the ECR image is there too)`);
  }

  // Instance type — whitelist (cheap, free-tier-friendly sizes)
  let instanceType = String(input.instanceType || '').trim();
  if (!instanceType) {
    instanceType = (cfg && cfg.defaultInstanceType) || 't3.micro';
  }
  if (!ALLOWED_INSTANCE_TYPES.includes(instanceType)) {
    errors.push(`instanceType must be one of: ${ALLOWED_INSTANCE_TYPES.join(', ')}`);
  }

  // Container port — the port the app listens on inside the container
  const containerPort = Number(input.containerPort);
  if (!Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) {
    errors.push('containerPort must be an integer between 1 and 65535');
  }

  // Host port — the public port on the instance (default 80)
  let hostPort = input.hostPort === undefined || input.hostPort === '' || input.hostPort === null
    ? 80
    : Number(input.hostPort);
  if (!Number.isInteger(hostPort) || hostPort < 1 || hostPort > 65533) {
    errors.push('hostPort must be an integer between 1 and 65533');
  }

  // Container count (multiple containers map to hostPort, hostPort+1, ...)
  let containers = input.containers === undefined || input.containers === '' || input.containers === null
    ? 1
    : Number(input.containers);
  if (!Number.isInteger(containers) || containers < 1 || containers > MAX_CONTAINERS) {
    errors.push(`containers must be an integer between 1 and ${MAX_CONTAINERS}`);
  }
  if (Number.isInteger(hostPort) && Number.isInteger(containerPort) && hostPort + containers - 1 > 65535) {
    errors.push('hostPort + containers exceeds the valid port range');
  }

  // Optional instance name (EC2 Name tag)
  const instanceName = String(input.instanceName || '').trim();
  if (instanceName && !INSTANCE_NAME_RE.test(instanceName)) {
    errors.push('instanceName may contain letters, digits, spaces, dots and hyphens only');
  }

  // Environment variables — names validated, values accepted but NEVER logged/returned
  const plainVars = validateEnvObject(input.environmentVariables, 'environmentVariables', errors);
  const secretVars = validateEnvObject(input.secretVariables, 'secretVariables', errors);
  for (const key of Object.keys(plainVars)) {
    if (key in secretVars) {
      errors.push(`"${key}" is defined twice — use either environmentVariables or secretVariables`);
    }
  }
  if (Object.keys(plainVars).length + Object.keys(secretVars).length > MAX_ENV_VARS) {
    errors.push(`A maximum of ${MAX_ENV_VARS} environment variables is allowed in total`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: {
      imageUri,
      region,
      instanceType,
      containerPort,
      hostPort,
      containers,
      instanceName,
      environmentVariables: plainVars,
      secretVariables: secretVars
    }
  };
}

function validateEnvObject(raw, label, errors) {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const key of Object.keys(obj)) {
    if (!ENV_NAME_RE.test(key)) {
      errors.push(`Invalid environment variable name in ${label}: "${key}" (use letters, digits, underscore)`);
      continue;
    }
    const value = obj[key];
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      errors.push(`${label}."${key}" must be a scalar value`);
      continue;
    }
    if (String(value).length > 4000) {
      errors.push(`${label}."${key}" exceeds 4000 characters`);
      continue;
    }
    out[key] = String(value);
  }
  return out;
}

function safeConfigOrNull() {
  try {
    return getDeployConfig();
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared one-time setup (idempotent): AMI + IAM instance profile
// ─────────────────────────────────────────────────────────────────────────────

let cachedAmiId = null;

/** Latest Amazon Linux 2023 AMI via the public SSM parameter (cached). */
async function resolveAmiId(region) {
  const cfg = getDeployConfig();
  if (cfg.amiId) return cfg.amiId;
  if (cachedAmiId) return cachedAmiId;

  const res = await ssm(region).send(new GetParameterCommand({ Name: AMI_SSM_PARAMETER }));
  const ami = res.Parameter && res.Parameter.Value;
  if (!ami) throw new Error(`SSM parameter ${AMI_SSM_PARAMETER} returned no AMI id`);
  cachedAmiId = ami;
  return ami;
}

let runnerSetupDone = false;

/**
 * Ensures the EC2 instance profile exists (idempotent, one-time):
 * role trusted by ec2.amazonaws.com with
 *  - AmazonEC2ContainerRegistryReadOnly  (pull images)
 *  - AmazonSSMManagedInstanceCore        (SSM agent management)
 *  - a scoped inline policy to read /clouddeploy/* secret parameters
 */
async function ensureRunnerInstanceProfile() {
  if (runnerSetupDone) return RUNNER_PROFILE_NAME;

  const trust = {
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Principal: { Service: 'ec2.amazonaws.com' }, Action: 'sts:AssumeRole' }]
  };

  let roleExists = true;
  try {
    await iam().send(new GetRoleCommand({ RoleName: RUNNER_ROLE_NAME }));
  } catch (err) {
    if (!/NoSuchEntity/.test(err.name || '')) throw err;
    roleExists = false;
  }

  if (!roleExists) {
    await iam().send(new CreateRoleCommand({
      RoleName: RUNNER_ROLE_NAME,
      AssumeRolePolicyDocument: JSON.stringify(trust),
      Description: 'CloudDeploy EC2 runner - pulls deployment images from ECR (pull-only)',
      Tags: [{ Key: 'cloud-deploy', Value: 'ec2-runner' }]
    }));
  }
  // Managed policies (AttachRolePolicy is idempotent)
  await iam().send(new AttachRolePolicyCommand({ RoleName: RUNNER_ROLE_NAME, PolicyArn: RUNNER_POLICY_ARN }));
  await iam().send(new AttachRolePolicyCommand({ RoleName: RUNNER_ROLE_NAME, PolicyArn: RUNNER_SSM_POLICY_ARN }));
  // Scoped secrets access: SSM GetParameter on /clouddeploy/* only
  const cfg = getDeployConfig();
  await iam().send(new PutRolePolicyCommand({
    RoleName: RUNNER_ROLE_NAME,
    PolicyName: RUNNER_SECRET_POLICY_NAME,
    PolicyDocument: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Action: 'ssm:GetParameter',
        Resource: `arn:aws:ssm:${cfg.region}:${cfg.accountId}:parameter${SECRET_PARAM_PREFIX}/*`
      }]
    })
  }));

  try {
    await iam().send(new GetInstanceProfileCommand({ InstanceProfileName: RUNNER_PROFILE_NAME }));
  } catch (err) {
    if (!/NoSuchEntity/.test(err.name || '')) throw err;
    await iam().send(new CreateInstanceProfileCommand({
      InstanceProfileName: RUNNER_PROFILE_NAME,
      Tags: [{ Key: 'cloud-deploy', Value: 'ec2-runner' }]
    }));
    await iam().send(new AddRoleToInstanceProfileCommand({
      InstanceProfileName: RUNNER_PROFILE_NAME,
      RoleName: RUNNER_ROLE_NAME
    }));
    // IAM is eventually consistent — give the profile a moment before RunInstances
    await sleep(10000);
  }

  runnerSetupDone = true;
  return RUNNER_PROFILE_NAME;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable security group (shared across deployments; rules managed per port)
// ─────────────────────────────────────────────────────────────────────────────

const REUSABLE_SG_NAME = 'clouddeploy-ec2-app';

/**
 * Returns (creating if needed) the reusable application security group and
 * ensures the requested host-port range is open. Other deployments' rules are
 * never revoked here (they may still be serving running instances) — each
 * deployment's rules are removed only when IT is cleaned up. Never port 22.
 */
async function ensureAppSecurityGroup(deploymentId, config, spec) {
  const client = ec2(spec.region);

  let groupId = null;
  try {
    const res = await client.send(new DescribeSecurityGroupsCommand({
      Filters: [{ Name: 'group-name', Values: [REUSABLE_SG_NAME] },
        { Name: 'vpc-id', Values: [config.vpcId] }]
    }));
    const sg = (res.SecurityGroups || [])[0];
    if (sg) groupId = sg.GroupId;
  } catch (_) { /* not found handled below */ }

  if (!groupId) {
    const res = await client.send(new CreateSecurityGroupCommand({
      GroupName: REUSABLE_SG_NAME,
      Description: 'CloudDeploy reusable app security group - managed by the deploy pipeline',
      VpcId: config.vpcId,
      TagSpecifications: [{
        ResourceType: 'security-group',
        Tags: [{ Key: 'cloud-deploy', Value: 'managed' }]
      }]
    }));
    groupId = res.GroupId;
  }

  // Ensure this deployment's host-port range is open (idempotent).
  const fromPort = spec.hostPort;
  const toPort = spec.hostPort + spec.containers - 1;

  let current = null;
  try {
    const res = await client.send(new DescribeSecurityGroupsCommand({ GroupIds: [groupId] }));
    current = (res.SecurityGroups || [])[0] || null;
  } catch (_) { /* best effort — authorize below surfaces real errors */ }

  const alreadyOpen = Boolean(current) && (current.IpPermissions || []).some(
    (p) => p.IpProtocol === 'tcp' && p.FromPort === fromPort && p.ToPort === toPort
      && (p.IpRanges || []).some((r) => r.CidrIp === '0.0.0.0/0')
  );

  if (!alreadyOpen) {
    await client.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: groupId,
      IpPermissions: [{
        IpProtocol: 'tcp',
        FromPort: fromPort,
        ToPort: toPort,
        IpRanges: [{ CidrIp: '0.0.0.0/0', Description: `CloudDeploy app port ${fromPort}-${toPort}` }]
      }]
    })).catch((err) => {
      // Concurrent deploy raced us with the identical rule — fine
      if (!/InvalidPermission\.Duplicate/.test(err.name || err.message || '')) throw err;
    });
  }

  return groupId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Secrets — stored in SSM SecureString at deploy time, fetched by the instance
// ─────────────────────────────────────────────────────────────────────────────

/** Writes secret env values as SecureString parameters (one per key). */
async function storeSecretParams(deploymentId, spec) {
  const names = [];
  for (const [key, value] of Object.entries(spec.secretVariables || {})) {
    const name = `${SECRET_PARAM_PREFIX}/${deploymentId}/${key}`;
    await ssm(spec.region).send(new PutParameterCommand({
      Name: name,
      Type: 'SecureString',
      Value: value,
      Overwrite: true,
      Description: `CloudDeploy deployment ${deploymentId} secret ${key}`
    }));
    names.push(name);
  }
  return names;
}

/** Deletes this deployment's secret parameters (cleanup / failure path). */
async function deleteSecretParams(deploymentId, spec, names) {
  const list = (names && names.length ? names : Object.keys(spec.secretVariables || {})
    .map((k) => `${SECRET_PARAM_PREFIX}/${deploymentId}/${k}`));
  for (let i = 0; i < list.length; i += 10) {
    const batch = list.slice(i, i + 10);
    if (batch.length === 0) continue;
    await ssm(spec.region).send(new DeleteParametersCommand({ Names: batch })).catch(() => { /* best effort */ });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// User-data script — installs Docker, pulls from ECR, runs containers.
// Writes step markers to /var/log/clouddeploy-userdata.log which the backend
// reads through SSM to track real progress (no guessing).
// ─────────────────────────────────────────────────────────────────────────────

function buildUserData(deploymentId, config, spec) {
  const region = spec.region;
  const ecrHost = spec.imageUri.split('/')[0];
  const secretKeys = Object.keys(spec.secretVariables || {});
  const envEntries = Object.entries(spec.environmentVariables || {});
  const secretFiles = secretKeys.map((_, i) => SECRET_TMP_FILE(deploymentId, i));

  // NOTE: no `set -x` here — it would echo plain environment values into the
  // log. Only step markers are written (never variable values).
  const lines = [
    '#!/bin/bash',
    'exec > >(tee -a /var/log/clouddeploy-userdata.log) 2>&1',
    "echo '[clouddeploy] step=bootstrap-started'",
    'dnf -y update >/dev/null 2>&1 || true',
    "dnf -y install -y docker || { echo '[clouddeploy] step=userdata-failed:docker-install'; exit 1; }",
    "systemctl enable --now docker || { echo '[clouddeploy] step=userdata-failed:docker-start'; exit 1; }",
    "echo '[clouddeploy] step=docker-installed'",
    `aws ecr get-login-password --region ${shq(region)} | docker login --username AWS --password-stdin ${shq(ecrHost)} || { echo '[clouddeploy] step=userdata-failed:ecr-login'; exit 1; }`,
    `docker pull ${shq(spec.imageUri)} || { echo '[clouddeploy] step=userdata-failed:image-pull'; exit 1; }`,
    "echo '[clouddeploy] step=image-pulled'"
  ];

  // Secrets: fetched at boot from SSM SecureString with the instance role,
  // written to root-only temp files, passed to docker, then shredded — the
  // values never appear in this script or in any API response.
  secretKeys.forEach((k, i) => {
    lines.push(
      `aws ssm get-parameter --region ${shq(region)} --name ${shq(`${SECRET_PARAM_PREFIX}/${deploymentId}/${k}`)} --with-decryption --query Parameter.Value --output text > ${secretFiles[i]} 2>/dev/null || { echo '[clouddeploy] step=userdata-failed:secret-fetch:${k}'; exit 1; }`,
      `chmod 600 ${secretFiles[i]}`
    );
  });

  // One docker run per container: host ports hostPort, hostPort+1, ...
  for (let i = 0; i < spec.containers; i += 1) {
    const args = [
      'docker run -d',
      `--name deployed-app-${i}`,
      '--restart unless-stopped',
      `-p ${spec.hostPort + i}:${spec.containerPort}`
    ];
    // Plain vars: single-quoted (shq neutralizes quotes -> no injection)
    for (const [k, v] of envEntries) {
      args.push(`-e ${shq(`${k}=${v}`)}`);
    }
    // Secrets: double-quoted $(cat file) expands ONCE at runtime; the result
    // is passed to docker verbatim as a single argument (never re-evaluated)
    secretKeys.forEach((k, si) => {
      args.push(`-e "${k}=$(cat ${secretFiles[si]})"`);
    });
    args.push(shq(spec.imageUri));
    lines.push(
      `${args.join(' ')} || { echo '[clouddeploy] step=userdata-failed:container-run:${i}'; exit 1; }`,
      `echo '[clouddeploy] step=container-started:${i}'`
    );
  }

  lines.push("docker ps -a --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}' || true");
  if (secretFiles.length > 0) {
    lines.push(`shred -u ${secretFiles.join(' ')} 2>/dev/null || rm -f ${secretFiles.join(' ')}`);
  }
  lines.push("echo '[clouddeploy] step=userdata-finished'");

  return Buffer.from(lines.join('\n')).toString('base64');
}

function SECRET_TMP_FILE(deploymentId, index) {
  return `/root/.cdsecret_${slugify(deploymentId)}_${index}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Instance launch + polling
// ─────────────────────────────────────────────────────────────────────────────

async function launchInstance(deploymentId, config, spec, resources) {
  const amiId = await resolveAmiId(spec.region);
  const profileName = await ensureRunnerInstanceProfile();

  const params = {
    ImageId: amiId,
    InstanceType: spec.instanceType,
    MinCount: 1,
    MaxCount: 1,
    // Idempotency: replaying the same request never launches a duplicate
    ClientToken: deploymentId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 64),
    IamInstanceProfile: { Name: profileName },
    UserData: buildUserData(deploymentId, config, spec),
    NetworkInterfaces: [{
      DeviceIndex: 0,
      SubnetId: config.subnetId,
      Groups: [resources.securityGroupId],
      AssociatePublicIp: true
    }],
    TagSpecifications: [{
      ResourceType: 'instance',
      Tags: [
        { Key: 'Name', Value: spec.instanceName || `cd-ec2-${slugify(deploymentId)}` },
        { Key: 'cloud-deploy-deployment', Value: deploymentId }
      ]
    }]
  };
  if (config.keyName) params.KeyName = config.keyName;

  const res = await ec2(spec.region).send(new RunInstancesCommand(params));
  const instance = (res.Instances || [])[0];
  if (!instance || !instance.InstanceId) {
    throw new Error('RunInstances returned no instance');
  }
  return instance.InstanceId;
}

async function describeInstance(spec, instanceId) {
  const res = await ec2(spec.region).send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
  const reservation = (res.Reservations || [])[0];
  return (reservation && reservation.Instances && reservation.Instances[0]) || null;
}

/**
 * Waits for instance state=running AND EC2 status checks 2/2.
 * Returns { ok, instance, message }.
 */
async function waitForInstanceRunning(deploymentId, spec, instanceId) {
  const startedAt = Date.now();
  const TIMEOUT_MS = 8 * 60 * 1000;

  while (Date.now() - startedAt < TIMEOUT_MS) {
    const instance = await describeInstance(spec, instanceId).catch(() => null);
    if (!instance) {
      return { ok: false, message: 'Instance disappeared (terminated?)' };
    }
    const state = instance.State && instance.State.Name;
    if (state === 'terminated' || state === 'shutting-down' || state === 'stopped') {
      return { ok: false, message: `Instance entered state "${state}"` };
    }
    if (state === 'running') {
      const statusRes = await ec2(spec.region).send(new DescribeInstanceStatusCommand({
        InstanceIds: [instanceId],
        IncludeAllInstances: true
      })).catch(() => null);
      const status = statusRes && (statusRes.InstanceStatuses || [])[0];
      const checksOk = status
        && status.SystemStatus && status.SystemStatus.Status === 'ok'
        && status.InstanceStatus && status.InstanceStatus.Status === 'ok';
      if (checksOk) {
        return { ok: true, instance };
      }
    }
    await sleep(10000);
  }
  return { ok: false, message: 'Timed out waiting for instance status checks (2/2)' };
}

/**
 * SSM bootstrap verification: waits for the agent, then polls the user-data
 * log markers to derive the REAL lifecycle stage (no timer-based guessing).
 * Succeeds only on the script's final `userdata-finished` marker — i.e. after
 * ALL containers started — and fails fast on any `userdata-failed:*` marker.
 */
async function trackBootstrap(deploymentId, spec, instanceId) {
  const client = ssm(spec.region);

  // 1. Wait for the SSM agent to come online (AL2023 ships with it)
  const onlineDeadline = Date.now() + 6 * 60 * 1000;
  let online = false;
  while (Date.now() < onlineDeadline) {
    const res = await client.send(new DescribeInstanceInformationCommand({
      Filters: [{ Key: 'InstanceIds', Values: [instanceId] }]
    })).catch(() => null);
    const info = res && (res.InstanceInformationList || [])[0];
    if (info && info.PingStatus === 'Online') { online = true; break; }
    await sleep(10000);
  }
  if (!online) {
    return { ok: false, message: 'SSM agent never came online — cannot verify the bootstrap' };
  }
  log(deploymentId, 'info', 'SSM agent online — tracking bootstrap steps');

  // 2. Poll the bootstrap log + container state
  const pollDeadline = Date.now() + 12 * 60 * 1000;
  let lastStage = 'docker_installing';

  while (Date.now() < pollDeadline) {
    const cmd = await client.send(new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Comment: 'CloudDeploy bootstrap status check',
      Parameters: { commands: ['grep "\\[clouddeploy\\] step=" /var/log/clouddeploy-userdata.log 2>/dev/null | tail -5', 'docker ps -a --format "{{.Names}}|{{.Status}}" 2>/dev/null || true'] },
      TimeoutSeconds: 30
    })).catch(() => null);
    if (!cmd || !cmd.Command || !cmd.Command.CommandId) {
      await sleep(10000);
      continue;
    }

    let inv = null;
    for (let i = 0; i < 12; i += 1) {
      await sleep(3000);
      inv = await client.send(new GetCommandInvocationCommand({
        CommandId: cmd.Command.CommandId,
        InstanceId: instanceId
      })).catch(() => null);
      if (inv && inv.Status && inv.Status !== 'Pending' && inv.Status !== 'InProgress') break;
    }

    const stdout = ((inv && inv.StandardOutputContent) || '');
    const failMatch = stdout.match(/step=userdata-failed:([A-Za-z0-9_.:-]+)/);
    if (failMatch) {
      return { ok: false, message: `Bootstrap failed on the instance (step: ${failMatch[1]}) — see the deployment logs` };
    }
    if (/step=userdata-finished/.test(stdout)) {
      // Only after the script's LAST marker: every container has started
      return { ok: true, stage: 'starting_container', finished: true };
    }

    // Derive the current stage from the newest marker present in the log
    let stage = 'docker_installing';
    if (/step=container-started:/.test(stdout) || /step=image-pulled/.test(stdout)) {
      stage = 'starting_container';
    } else if (/step=docker-installed/.test(stdout)) {
      stage = 'pulling_image';
    }
    if (stage !== lastStage) {
      lastStage = stage;
      setStage(deploymentId, stage);
      log(deploymentId, 'info', `Bootstrap progress: ${stage.replace(/_/g, ' ')}`);
    }

    await sleep(8000);
  }
  return { ok: false, message: 'Timed out waiting for the bootstrap to finish on the instance' };
}

/**
 * HTTP health check against the public IP + host port.
 * Returns { ok, message } — a reachable non-2xx counts as a warning pass
 * (the app may only serve specific paths); unreachable fails the deployment.
 */
async function healthCheck(deploymentId, spec, publicIp) {
  const http = require('http');
  const url = `http://${publicIp}:${spec.hostPort}/`;
  const deadline = Date.now() + 3 * 60 * 1000;

  while (Date.now() < deadline) {
    const result = await new Promise((resolve) => {
      const req = http.get(url, { timeout: 8000 }, (res) => {
        res.resume();
        resolve({ reachable: true, statusCode: res.statusCode });
      });
      req.on('timeout', () => { req.destroy(); resolve({ reachable: false }); });
      req.on('error', () => resolve({ reachable: false }));
    });

    if (result.reachable) {
      if (result.statusCode >= 200 && result.statusCode < 400) {
        log(deploymentId, 'info', `Health check passed (HTTP ${result.statusCode}) at ${url}`);
        return { ok: true, message: `HTTP ${result.statusCode}` };
      }
      log(deploymentId, 'warn', `App answered with HTTP ${result.statusCode} at ${url} — treating as up (check the app's routes if this is unexpected)`);
      return { ok: true, message: `HTTP ${result.statusCode}`, warning: true };
    }
    await sleep(8000);
  }
  return { ok: false, message: `Health check failed: no HTTP response from ${url} within 3 minutes` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deployment pipeline
// ─────────────────────────────────────────────────────────────────────────────

async function runDeploymentPipeline(deploymentId) {
  const record = storage.getDeployment(deploymentId);
  if (!record) return;

  const spec = record.config;
  const secretValues = Object.values(spec.secretVariables || {});
  let cleanedSecretNames = [];

  let config;
  try {
    config = getDeployConfig();
  } catch (err) {
    return failDeployment(deploymentId, 'config', err.message, secretValues);
  }

  setStage(deploymentId, 'provisioning');
  log(deploymentId, 'info', `Provisioning EC2 instance (type=${spec.instanceType}, region=${spec.region}, containers=${spec.containers}, hostPort=${spec.hostPort} -> containerPort=${spec.containerPort})`);
  log(deploymentId, 'info', `Image: ${spec.imageUri}`);

  const resources = { instanceType: spec.instanceType, region: spec.region };

  try {
    // 1. Reusable security group with exactly this deployment's host ports
    log(deploymentId, 'info', 'Ensuring security group rules…');
    resources.securityGroupId = await ensureAppSecurityGroup(deploymentId, config, spec);
    saveIfPresent(deploymentId, { resources: { ...resources } });
    log(deploymentId, 'info', `Security group ready: ${resources.securityGroupId}`);

    // 2. Secrets to SSM SecureString (values never persisted or logged)
    if (Object.keys(spec.secretVariables || {}).length > 0) {
      log(deploymentId, 'info', 'Storing secret environment variables in SSM SecureString…');
      cleanedSecretNames = await storeSecretParams(deploymentId, spec);
      resources.secretParameterNames = cleanedSecretNames;
      saveIfPresent(deploymentId, { resources: { ...resources } });
    }

    // 3. Launch the instance (idempotent via ClientToken = deploymentId)
    log(deploymentId, 'info', 'Launching EC2 instance…');
    resources.instanceId = await launchInstance(deploymentId, config, spec, resources);
    saveIfPresent(deploymentId, { resources: { ...resources } });
    log(deploymentId, 'info', `Instance launched: ${resources.instanceId}`);

    // 4. Instance running + status checks 2/2
    log(deploymentId, 'info', 'Waiting for the instance to pass EC2 status checks…');
    const running = await waitForInstanceRunning(deploymentId, spec, resources.instanceId);
    if (!running.ok) {
      return failDeployment(deploymentId, 'instance_running', running.message, secretValues, resources);
    }
    setStage(deploymentId, 'instance_running');
    log(deploymentId, 'info', 'Instance is running with status checks 2/2');

    // 5. Bootstrap tracking via SSM (docker install → pull → container start)
    setStage(deploymentId, 'docker_installing');
    const boot = await trackBootstrap(deploymentId, spec, resources.instanceId);
    if (!boot.ok) {
      return failDeployment(deploymentId, 'docker_installing', boot.message, secretValues, resources);
    }

    // 6. Public IP + health check
    const instance = await describeInstance(spec, resources.instanceId);
    const publicIp = instance && instance.PublicIpAddress;
    if (!publicIp) {
      return failDeployment(deploymentId, 'health_check', 'Instance has no public IP', secretValues, resources);
    }
    resources.publicIp = publicIp;
    saveIfPresent(deploymentId, { resources: { ...resources } });

    setStage(deploymentId, 'health_check');
    log(deploymentId, 'info', `Performing HTTP health check on ${publicIp}:${spec.hostPort}…`);
    const health = await healthCheck(deploymentId, spec, publicIp);
    if (!health.ok) {
      return failDeployment(deploymentId, 'health_check', health.message, secretValues, resources);
    }

    // 7. Deployed
    const urls = [];
    for (let i = 0; i < spec.containers; i += 1) {
      urls.push(`http://${publicIp}:${spec.hostPort + i}`);
    }
    setStage(deploymentId, 'deployed', {
      publicIp,
      publicUrl: urls[0],
      applicationUrl: urls[0],
      urls,
      instanceId: resources.instanceId
    });
    log(deploymentId, 'info', `DEPLOYED — application available at ${urls.join(' , ')}`);
  } catch (err) {
    const message = redactAll(err.message || String(err), secretValues);
    return failDeployment(deploymentId, 'provisioning', message, secretValues, resources);
  }
}

/**
 * Marks a deployment failed and cleans up anything partially created
 * (instance terminated, security group left reusable, secrets deleted).
 */
function failDeployment(deploymentId, step, message, secretValues = [], resources = {}) {
  saveIfPresent(deploymentId, {
    status: 'failed',
    failureStep: step,
    error: message,
    resources: Object.keys(resources).length ? resources : undefined
  });
  log(deploymentId, 'error', `Deployment FAILED at "${step}": ${message}`);
  log(deploymentId, 'info', 'Cleaning up partially created resources…');
  // Fire-and-forget cleanup — record already carries the failure
  cleanupDeployment(deploymentId).catch(() => { /* best effort */ });
}

/** Starts a deployment asynchronously (fire-and-forget with progress tracking). */
function startDeployment(deploymentId) {
  runDeploymentPipeline(deploymentId).catch((err) => {
    failDeployment(deploymentId, 'provisioning', `Unexpected pipeline error: ${err.message}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup (deployment-specific resources only; shared SG stays reusable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Terminates THIS deployment's instance (after verifying it carries our
 * deployment tag — never touches unrelated instances), deletes the secret
 * parameters and removes this deployment's port rules from the reusable SG.
 */
async function cleanupDeployment(deploymentId) {
  const record = storage.getDeployment(deploymentId);
  const warnings = [];
  if (!record) return { ok: true, warnings: ['Deployment record not found (already removed?)'] };

  const res = record.resources || {};
  const spec = record.config || {};

  // 1. Terminate the instance — ONLY after verifying the ownership tag
  if (res.instanceId) {
    try {
      const instance = await describeInstance(spec, res.instanceId).catch(() => null);
      const owned = instance && (instance.Tags || []).some(
        (t) => t.Key === 'cloud-deploy-deployment' && t.Value === deploymentId
      );
      if (!owned) {
        warnings.push(`Instance ${res.instanceId} is missing the deployment tag — refusing to terminate it`);
      } else {
        await ec2(spec.region).send(new TerminateInstancesCommand({ InstanceIds: [res.instanceId] }));
        log(deploymentId, 'info', `Terminating instance ${res.instanceId}…`);

        const deadline = Date.now() + 180000;
        while (Date.now() < deadline) {
          const inst = await describeInstance(spec, res.instanceId).catch(() => null);
          if (!inst || (inst.State && inst.State.Name === 'terminated')) break;
          await sleep(8000);
        }
      }
    } catch (err) {
      if (!/InvalidInstanceID\.NotFound|not found/i.test(err.message || '')) {
        warnings.push(`Instance: ${redactAll(err.message)}`);
      }
    }
  }

  // 2. Secret parameters for this deployment
  await deleteSecretParams(deploymentId, spec, res.secretParameterNames);

  // 3. Security group handling:
  //    - reusable shared group: revoke ONLY this deployment's port-range rules
  //    - per-deployment group (older records): delete the group outright
  if (res.securityGroupId) {
    try {
      const client = ec2(spec.region);
      const sgRes = await client.send(new DescribeSecurityGroupsCommand({ GroupIds: [res.securityGroupId] })).catch(() => null);
      const sg = sgRes && (sgRes.SecurityGroups || [])[0];

      if (sg && sg.GroupName === REUSABLE_SG_NAME) {
        if (spec.hostPort !== undefined && spec.hostPort !== null) {
          const fromPort = spec.hostPort;
          const toPort = spec.hostPort + (spec.containers || 1) - 1;
          const perms = (sg.IpPermissions || []).filter((p) => p.IpProtocol === 'tcp'
            && p.FromPort >= fromPort && p.ToPort <= toPort
            && (p.Description || '').startsWith('CloudDeploy app port'));
          if (perms.length > 0) {
            await client.send(new RevokeSecurityGroupIngressCommand({
              GroupId: sg.GroupId,
              IpPermissions: perms
            })).catch(() => { /* best effort */ });
          }
        }
      } else if (sg) {
        // Per-deployment group — remove it once the ENIs have detached (retry)
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const deleted = await client.send(new DeleteSecurityGroupCommand({ GroupId: sg.GroupId }))
            .then(() => true)
            .catch((e) => {
              const msg = e.message || '';
              if (/InvalidGroup/.test(e.name || '') || /InvalidGroup/.test(msg)) return true;
              if (/DependencyViolation/.test(msg)) return false;
              throw e;
            });
          if (deleted) break;
          await sleep(8000);
        }
      }
    } catch (err) {
      warnings.push(`Security group: ${redactAll(err.message)}`);
    }
  }

  return { ok: warnings.length === 0, warnings };
}

/**
 * Called on server start: resumes or fails deployments that were in-flight
 * when the backend restarted.
 */
function reconcileInterruptedDeployments() {
  const deployments = storage.getDeployments();
  for (const d of deployments) {
    if (!STAGES.includes(d.status) || d.status === 'deployed' || d.status === 'failed' || d.status === 'pending') continue;

    if (d.resources && d.resources.instanceId) {
      log(d.id, 'warn', 'Backend restarted while deploying — resuming status tracking');
      resumeDeployment(d);
    } else {
      storage.saveDeployment({
        id: d.id,
        status: 'failed',
        failureStep: 'config',
        error: 'Deployment was interrupted by a backend restart before the instance was launched. Create a new deployment.'
      });
      log(d.id, 'error', 'Deployment interrupted by backend restart (no instance was launched)');
    }
  }
}

/** Re-attaches to an already-launched instance after a backend restart. */
async function resumeDeployment(record) {
  const spec = record.config;
  const secretValues = Object.values(spec.secretVariables || {});

  const instance = await describeInstance(spec, record.resources.instanceId).catch(() => null);
  const state = instance && instance.State ? instance.State.Name : null;
  if (!instance || state === 'terminated' || state === 'shutting-down') {
    return failDeployment(record.id, 'instance_running', `Instance ${record.resources.instanceId} is ${state || 'gone'}`, secretValues, record.resources);
  }

  const boot = await trackBootstrap(record.id, spec, record.resources.instanceId);
  if (!boot.ok) {
    return failDeployment(record.id, 'docker_installing', boot.message, secretValues, record.resources);
  }

  const publicIp = instance.PublicIpAddress;
  if (!publicIp) {
    return failDeployment(record.id, 'health_check', 'Instance has no public IP', secretValues, record.resources);
  }

  setStage(record.id, 'health_check');
  const health = await healthCheck(record.id, spec, publicIp);
  if (!health.ok) {
    return failDeployment(record.id, 'health_check', health.message, secretValues, record.resources);
  }

  const urls = [];
  for (let i = 0; i < spec.containers; i += 1) {
    urls.push(`http://${publicIp}:${spec.hostPort + i}`);
  }
  setStage(record.id, 'deployed', {
    publicIp,
    publicUrl: urls[0],
    applicationUrl: urls[0],
    urls,
    instanceId: record.resources.instanceId
  });
  log(record.id, 'info', `DEPLOYED — application available at ${urls.join(' , ')}`);
}

// Tag helper kept for future use (e.g. tagging volumes)
async function tagResource(region, resourceIds, tags) {
  await ec2(region).send(new CreateTagsCommand({ Resources: resourceIds, Tags: tags }));
}

module.exports = {
  REQUIRED_DEPLOY_ENV,
  STAGES,
  STAGE_PROGRESS,
  ALLOWED_INSTANCE_TYPES,
  RUNNER_PROFILE_NAME,
  REUSABLE_SG_NAME,
  getMissingDeployEnv,
  getDeployConfig,
  validateDeploymentConfig,
  newDeploymentId,
  startDeployment,
  cleanupDeployment,
  reconcileInterruptedDeployments,
  resolveAmiId,
  ensureRunnerInstanceProfile,
  buildUserData,
  tagResource
};
