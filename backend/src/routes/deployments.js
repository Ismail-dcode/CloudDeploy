const express = require('express');
const router = express.Router();
const storage = require('../services/storage');
const {
  REQUIRED_DEPLOY_ENV,
  ALLOWED_INSTANCE_TYPES,
  RUNNER_PROFILE_NAME,
  getMissingDeployEnv,
  getDeployConfig,
  validateDeploymentConfig,
  newDeploymentId,
  startDeployment,
  cleanupDeployment,
  resolveAmiId
} = require('../services/ec2DeployService');
const { redactSecrets } = require('../services/ecrService');

const DEPLOY_ID_RE = /^ec2dpl_\d{10,}_[a-z0-9]{1,10}$/;

function maskValues(obj) {
  if (!obj || typeof obj !== 'object') return {};
  return Object.fromEntries(Object.keys(obj).map((k) => [k, '\u2022\u2022\u2022\u2022\u2022\u2022']));
}

/**
 * Prepares a deployment record for the API (spec response shape):
 * - status is returned UPPERCASE (PENDING … DEPLOYED / FAILED)
 * - environment variable VALUES are masked
 * - secret variable VALUES are NEVER returned (only their key names)
 */
function toPublicDeploy(deployment) {
  if (!deployment) return null;
  const cfg = deployment.config || {};
  const plainVars = cfg.environmentVariables || cfg.envVars || {};
  const secretKeys = Object.keys(cfg.secretVariables || cfg.secretKeys || {});
  const resources = deployment.resources || {};

  return {
    ...deployment,
    deploymentId: deployment.id,
    status: String(deployment.status || 'pending').toUpperCase(),
    instanceId: resources.instanceId || deployment.instanceId || null,
    publicIp: deployment.publicIp || null,
    applicationUrl: deployment.applicationUrl || deployment.publicUrl || null,
    imageUri: cfg.imageUri || null,
    instanceType: cfg.instanceType || null,
    region: cfg.region || null,
    containerPort: cfg.containerPort !== undefined ? cfg.containerPort : null,
    hostPort: cfg.hostPort !== undefined && cfg.hostPort !== null ? cfg.hostPort : null,
    containers: cfg.containers || 1,
    instanceName: cfg.instanceName || null,
    config: {
      ...cfg,
      environmentVariables: maskValues(plainVars),
      envVars: undefined,
      secretVariables: undefined,
      secretKeys
    }
  };
}

/**
 * GET /api/deployments/config
 * Non-secret status of the EC2 deployment configuration.
 */
router.get('/config', async (req, res) => {
  const missing = getMissingDeployEnv();

  let registry = null;
  let error = null;

  if (missing.length === 0) {
    try {
      const config = getDeployConfig();
      let amiId = config.amiId;
      if (!amiId) {
        amiId = await resolveAmiId(); // also validates SSM access up-front
      }
      registry = {
        region: config.region,
        defaultInstanceType: config.defaultInstanceType,
        allowedInstanceTypes: ALLOWED_INSTANCE_TYPES,
        vpcId: config.vpcId,
        subnetId: config.subnetId,
        amiId,
        keyConfigured: Boolean(config.keyName),
        instanceProfile: RUNNER_PROFILE_NAME
      };
    } catch (err) {
      error = redactSecrets(err.message);
    }
  }

  res.json({
    success: true,
    configured: missing.length === 0 && !error,
    missing,
    required: REQUIRED_DEPLOY_ENV,
    registry,
    error
  });
});

/**
 * POST /api/deployments
 * Validates the configuration and starts an asynchronous EC2 deployment.
 * Returns 202 immediately with a deployment ID; poll GET /:deploymentId.
 */
router.post('/', async (req, res) => {
  const validation = validateDeploymentConfig(req.body || {});

  if (!validation.isValid) {
    return res.status(400).json({
      success: false,
      message: 'Deployment configuration is invalid',
      errors: validation.errors
    });
  }

  const missing = getMissingDeployEnv();
  if (missing.length > 0) {
    return res.status(500).json({
      success: false,
      message: `Missing AWS configuration: ${missing.join(', ')}. Add them to backend/.env`,
      missing
    });
  }

  const deploymentId = newDeploymentId();
  const sanitized = validation.sanitized;
  const record = {
    id: deploymentId,
    status: 'pending',
    progress: 0,
    config: sanitized,
    resources: {},
    logs: [],
    publicUrl: null,
    applicationUrl: null,
    publicIp: null,
    instanceId: null,
    urls: [],
    error: null,
    createdBy: 'ui'
  };

  storage.saveDeployment(record);
  console.log(`[EC2-DEPLOY] ${deploymentId}: accepted (type=${sanitized.instanceType}, region=${sanitized.region}, containers=${sanitized.containers}, ${sanitized.hostPort}->${sanitized.containerPort}, secrets=${Object.keys(sanitized.secretVariables).length})`);

  startDeployment(deploymentId);

  const deployment = toPublicDeploy(storage.getDeployment(deploymentId));
  return res.status(202).json({
    success: true,
    message: 'Deployment started',
    deploymentId,
    status: 'PENDING',
    imageUri: sanitized.imageUri,
    instanceType: sanitized.instanceType,
    region: sanitized.region,
    containerPort: sanitized.containerPort,
    hostPort: sanitized.hostPort,
    deployment
  });
});

/**
 * GET /api/deployments
 * Deployment history, newest first.
 */
router.get('/', (req, res) => {
  try {
    const deployments = storage.getDeployments().map(toPublicDeploy);
    res.json({ success: true, deployments });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch deployments', error: redactSecrets(err.message) });
  }
});

/**
 * GET /api/deployments/:deploymentId
 * Full detail incl. progress log (used by the status UI).
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  if (!DEPLOY_ID_RE.test(id)) {
    return res.status(400).json({ success: false, message: 'Invalid deployment id' });
  }

  const deployment = storage.getDeployment(id);
  if (!deployment) {
    return res.status(404).json({ success: false, message: 'Deployment not found' });
  }

  res.json({ success: true, deployment: toPublicDeploy(deployment) });
});

/**
 * DELETE /api/deployments/:deploymentId
 * Terminates this deployment's instance (only after verifying its ownership
 * tag) and removes deployment-specific resources — shared resources (IAM
 * instance profile, reusable security group) stay untouched.
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!DEPLOY_ID_RE.test(id)) {
    return res.status(400).json({ success: false, message: 'Invalid deployment id' });
  }
  if (!storage.getDeployment(id)) {
    return res.status(404).json({ success: false, message: 'Deployment not found' });
  }

  console.log(`[EC2-DEPLOY] ${id}: cleanup requested`);
  try {
    const result = await cleanupDeployment(id);

    if (result.ok) {
      storage.deleteDeploymentRecord(id);
      console.log(`[EC2-DEPLOY] ${id}: removed (instance terminated, resources cleaned up)`);
      return res.json({ success: true, message: 'Deployment deleted — instance terminated and resources cleaned up' });
    }

    // Incomplete cleanup → keep the record so the user can retry the delete
    storage.appendDeploymentLog(id, 'warn', `Cleanup incomplete: ${result.warnings.join('; ')}`);
    return res.status(500).json({
      success: false,
      message: 'Some resources could not be deleted yet — try again shortly',
      warnings: result.warnings.map(redactSecrets)
    });
  } catch (err) {
    console.error('[EC2-DEPLOY] Cleanup failed:', redactSecrets(err.message));
    return res.status(500).json({ success: false, message: 'Cleanup failed', error: redactSecrets(err.message) });
  }
});

module.exports = router;
