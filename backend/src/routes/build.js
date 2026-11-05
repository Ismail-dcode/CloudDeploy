const express = require('express');
const net = require('net');
const router = express.Router();
const { validateBuildInput } = require('../utils/validation');
const { createTempDirectory, cloneRepository, cleanupDirectory } = require('../services/gitService');
const { detectProjectType } = require('../services/projectDetector');
const { generateDockerfile } = require('../services/dockerfileGenerator');
const { buildDockerImage, runDockerContainer, verifyContainerReachability, deleteDockerImage } = require('../services/dockerService');
const storage = require('../services/storage');

/**
 * GET /api/check-port/:port
 * Checks if a TCP port is currently free on localhost.
 */
router.get('/check-port/:port', (req, res) => {
  const port = parseInt(req.params.port, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    return res.status(400).json({ available: false, message: 'Invalid port number' });
  }

  const server = net.createServer();
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      return res.json({ available: false, port, message: `Port ${port} is currently in use.` });
    }
    return res.json({ available: false, port, message: err.message });
  });

  server.once('listening', () => {
    server.close(() => {
      return res.json({ available: true, port, message: `Port ${port} is available.` });
    });
  });

  server.listen(port, '0.0.0.0');
});

/**
 * GET /api/images
 * Returns all built images stored in data file.
 */
router.get('/images', (req, res) => {
  try {
    const images = storage.getImages();
    res.json({ success: true, images });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch stored images', error: err.message });
  }
});

/**
 * DELETE /api/images/:id
 * Removes stored image metadata and deletes Docker image locally.
 */
router.delete('/images/:id', async (req, res) => {
  try {
    const imageId = req.params.id;
    const images = storage.getImages();
    const targetImage = images.find(img => img.id === imageId || img.imageName === imageId);

    if (targetImage) {
      await deleteDockerImage(targetImage.imageName);
    }
    const deleted = storage.deleteImage(imageId);

    if (deleted) {
      return res.json({ success: true, message: `Image ${imageId} deleted successfully.` });
    } else {
      return res.status(404).json({ success: false, message: 'Image record not found.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete image', error: err.message });
  }
});

/**
 * POST /api/build
 * Main Phase 1 build endpoint.
 */
router.post('/build', async (req, res) => {
  // STEP 1: Input Validation
  const validation = validateBuildInput(req.body);
  if (!validation.isValid) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: validation.errors
    });
  }

  const { repoUrl, command, port, appPort, hostPort, imageName } = validation.sanitized;
  const deployNow = req.body.deployNow !== false; // default true unless explicitly false
  const targetAppPort = appPort !== undefined ? appPort : port;
  const targetHostPort = hostPort !== undefined ? hostPort : targetAppPort;
  let tempDir = null;

  try {
    // STEP 2: Create Unique Temp Build Directory
    tempDir = await createTempDirectory();

    // STEP 3: Clone GitHub Repository
    try {
      await cloneRepository(repoUrl, tempDir);
    } catch (cloneErr) {
      return res.status(400).json({
        success: false,
        message: 'Failed to clone repository',
        error: cloneErr.error || cloneErr.message
      });
    }

    // STEP 4 & 5: Inspect Repository & Detect Project Type
    let detectionResult = await detectProjectType(tempDir);

    if (validation.sanitized.isStaticMode) {
      detectionResult = {
        type: 'static',
        confidence: 'high',
        details: { serverType: 'nginx', entryFile: 'static website' }
      };
    } else if (validation.sanitized.useExistingDockerfile) {
      detectionResult = {
        type: 'existing-dockerfile',
        confidence: 'high',
        details: { message: 'Existing Dockerfile specified by user.' }
      };
    }

    if (detectionResult.type === 'unsupported') {
      return res.status(400).json({
        success: false,
        message: 'This project type is not supported.',
        projectType: 'unsupported'
      });
    }

    // STEP 6: Generate Dockerfile (if not existing)
    const dockerfileResult = await generateDockerfile({
      projectType: detectionResult.type,
      command,
      port: targetAppPort,
      repoPath: tempDir,
      details: detectionResult.details
    });

    // STEP 7: Run Docker Build
    const buildResult = await buildDockerImage({
      imageName,
      buildContextDir: tempDir
    });

    if (!buildResult.success) {
      return res.status(500).json({
        success: false,
        message: buildResult.message,
        projectType: detectionResult.type,
        error: buildResult.error,
        logs: buildResult.output
      });
    }

    // Mechanism 1: Save Image Record to Persistent Datafile
    const savedImage = storage.saveImage({
      id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      imageName: buildResult.imageName,
      tag: buildResult.tag || 'latest',
      repoUrl,
      projectType: detectionResult.type === 'existing-dockerfile' ? 'Existing Dockerfile' : detectionResult.type,
      details: detectionResult.details || {},
      appPort: targetAppPort,
      dockerfileContent: dockerfileResult.dockerfileContent,
      logs: buildResult.output
    });

    let containerResult = { success: false };
    let reachabilityStatus = { reachable: false, message: 'Container not deployed yet' };
    const isWeb = detectionResult.details ? (detectionResult.details.category !== 'worker' && detectionResult.details.category !== 'cli') : true;

    // STEP 7.5: Optional Immediate Deployment if deployNow is true
    if (deployNow) {
      containerResult = await runDockerContainer({
        imageName,
        containerName: `${imageName}-instance-1`,
        appPort: targetAppPort,
        hostPort: targetHostPort,
        envVars: validation.sanitized.envVars || {},
        isWeb
      });

      if (containerResult.success) {
        // Mechanism 2: Save Container Deployment Metadata to Datafile
        storage.saveContainer({
          containerId: containerResult.containerId,
          containerName: containerResult.containerName || `${imageName}-instance-1`,
          imageName,
          appPort: targetAppPort,
          hostPort: targetHostPort,
          envVars: validation.sanitized.envVars || {},
          isWeb,
          localUrl: isWeb ? `http://localhost:${targetHostPort}` : null,
          runCommand: containerResult.runCommand,
          status: 'running'
        });

        if (isWeb) {
          reachabilityStatus = await verifyContainerReachability(targetHostPort);
        }
      }
    }

    // STEP 8: Return Success Result
    return res.status(200).json({
      success: true,
      message: deployNow
        ? (containerResult.success ? 'Docker image built and container launched successfully' : 'Docker image built successfully')
        : 'Docker image built and stored in Image Registry successfully',
      projectType: detectionResult.type === 'existing-dockerfile' ? 'Existing Dockerfile' : detectionResult.type,
      details: detectionResult.details || {},
      image: savedImage,
      imageName: buildResult.imageName,
      tag: buildResult.tag,
      port: targetAppPort,
      appPort: targetAppPort,
      hostPort: deployNow ? targetHostPort : null,
      localUrl: (deployNow && isWeb && containerResult.success) ? `http://localhost:${targetHostPort}` : null,
      containerRunning: containerResult.success,
      containerId: containerResult.containerId,
      containerName: containerResult.containerName,
      runCommand: containerResult.runCommand,
      runError: containerResult.error,
      reachability: reachabilityStatus,
      envVarsInjected: Object.keys(validation.sanitized.envVars || {}),
      dockerfileGenerated: dockerfileResult.generated,
      dockerfileContent: dockerfileResult.dockerfileContent,
      logs: buildResult.output
    });

  } catch (err) {
    console.error('Unexpected error during build process:', err);
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred during the build process',
      error: err.message
    });
  } finally {
    // STEP 9: Clean up temporary cloned repository
    if (tempDir) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await cleanupDirectory(tempDir);
    }
  }
});

module.exports = router;

