const express = require('express');
const router = express.Router();
const { pushToEcr, redactSecrets } = require('../services/ecrService');
const storage = require('../services/storage');

/**
 * POST /api/ecr/push
 *
 * Authenticates to Amazon ECR, tags the locally-built Docker image
 * with a unique deployment-ID tag, and pushes it to the configured
 * ECR repository.
 *
 * Request body:
 *   {
 *     "imageName":    "my-app",           // Local Docker image name (required)
 *     "deploymentId": "img_17..._abc12"   // Unique deployment ID for ECR tag (required)
 *   }
 *
 * Response:
 *   {
 *     "success":    true,
 *     "message":    "...",
 *     "imageUri":   "123456789.dkr.ecr.us-east-1.amazonaws.com/my-repo:deploy-img_17...",
 *     "tag":        "deploy-img_17...",
 *     "registry":   "123456789.dkr.ecr.us-east-1.amazonaws.com",
 *     "ecrStatus":  "pushed"
 *   }
 */
router.post('/push', async (req, res) => {
  const { imageName, deploymentId } = req.body;

  // --- Input validation ---
  if (!imageName || typeof imageName !== 'string' || !imageName.trim()) {
    return res.status(400).json({
      success: false,
      message: 'imageName is required'
    });
  }

  if (!deploymentId || typeof deploymentId !== 'string' || !deploymentId.trim()) {
    return res.status(400).json({
      success: false,
      message: 'deploymentId is required to uniquely tag the ECR image'
    });
  }

  const safeImageName = imageName.trim();
  const safeDeploymentId = deploymentId.trim();

  // Reject anything that is not a plausible local Docker image name
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._\/-]*$/.test(safeImageName) || safeImageName.length > 200) {
    return res.status(400).json({
      success: false,
      message: 'imageName contains invalid characters'
    });
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(safeDeploymentId) || safeDeploymentId.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'deploymentId contains invalid characters'
    });
  }

  // --- Verify ECR environment is configured ---
  const missingVars = ['AWS_REGION', 'AWS_ACCOUNT_ID', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'ECR_REPOSITORY']
    .filter((v) => !process.env[v] || !process.env[v].trim());

  if (missingVars.length > 0) {
    return res.status(500).json({
      success: false,
      message: `Missing required environment variables: ${missingVars.join(', ')}. Add them to your .env file.`,
      missingVars
    });
  }

  console.log(`[ECR] Starting push pipeline for image "${safeImageName}" (deploymentId: ${safeDeploymentId})`);

  try {
    const result = await pushToEcr({
      localImageName: safeImageName,
      deploymentId: safeDeploymentId
    });

    if (!result.success) {
      const safeError = redactSecrets(result.error || 'Unknown error');
      console.error(`[ECR] Push failed at step "${result.step}": ${safeError}`);
      return res.status(500).json({
        success: false,
        message: `ECR push failed at step: ${result.step}`,
        error: safeError,
        step: result.step,
        registry: result.registry || null,
        imageUri: result.imageUri || null,
        deploymentId: safeDeploymentId,
        ecrStatus: 'failed'
      });
    }

    // Update storage record with ECR metadata (best-effort)
    try {
      const images = storage.getImages();
      const imageRecord = images.find(
        (img) => img.id === safeDeploymentId || img.imageName === safeImageName
      );
      if (imageRecord) {
        storage.saveImage({
          ...imageRecord,
          ecrImageUri: result.imageUri,
          ecrTag: result.tag,
          ecrRegistry: result.registry,
          ecrStatus: 'pushed',
          ecrPushedAt: new Date().toISOString()
        });
      }
    } catch (storageErr) {
      // Non-fatal: image was pushed successfully, storage update is best-effort
      console.warn('[ECR] Could not update image storage record:', storageErr.message);
    }

    console.log(`[ECR] Successfully pushed image to: ${result.imageUri}`);

    return res.status(200).json({
      success: true,
      message: 'Image successfully pushed to Amazon ECR',
      imageUri: result.imageUri,
      tag: result.tag,
      registry: result.registry,
      deploymentId: safeDeploymentId,
      ecrStatus: 'pushed',
      output: redactSecrets(result.output || '')
    });
  } catch (err) {
    console.error('[ECR] Unexpected error during ECR push:', redactSecrets(err.message));
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred during ECR push',
      error: redactSecrets(err.message),
      ecrStatus: 'failed'
    });
  }
});

/**
 * GET /api/ecr/config
 *
 * Returns the current ECR configuration status (whether vars are set).
 * Never exposes actual credentials — only presence/absence.
 */
router.get('/config', (req, res) => {
  const requiredVars = ['AWS_REGION', 'AWS_ACCOUNT_ID', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'ECR_REPOSITORY'];
  const configStatus = {};
  const missing = [];

  for (const varName of requiredVars) {
    const isSet = Boolean(process.env[varName] && process.env[varName].trim());
    configStatus[varName] = isSet ? 'configured' : 'missing';
    if (!isSet) missing.push(varName);
  }

  const region = process.env.AWS_REGION || null;
  const accountId = process.env.AWS_ACCOUNT_ID || null;
  const ecrRepo = process.env.ECR_REPOSITORY || null;

  res.json({
    success: true,
    configured: missing.length === 0,
    missing,
    configStatus,
    // Safe to expose: these are non-secret identifiers
    registry: (region && accountId)
      ? `${accountId}.dkr.ecr.${region}.amazonaws.com`
      : null,
    ecrRepository: ecrRepo || null
  });
});

module.exports = router;
