const express = require('express');
const net = require('net');
const router = express.Router();
const { validateBuildInput } = require('../utils/validation');
const { createTempDirectory, cloneRepository, cleanupDirectory } = require('../services/gitService');
const { detectProjectType } = require('../services/projectDetector');
const { generateDockerfile } = require('../services/dockerfileGenerator');
const { buildDockerImage, runDockerContainer } = require('../services/dockerService');

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
    }

    if (detectionResult.type === 'unsupported') {
      return res.status(400).json({
        success: false,
        message: 'This project type is not supported in Phase 1.',
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

    // STEP 7.5: Run Docker Container locally mapping hostPort to appPort (-p hostPort:appPort)
    const containerResult = await runDockerContainer({
      imageName,
      appPort: targetAppPort,
      hostPort: targetHostPort
    });

    // STEP 8: Return Success Result
    return res.status(200).json({
      success: true,
      message: containerResult.success ? 'Docker image built and container launched successfully' : 'Docker image built successfully',
      projectType: detectionResult.type === 'existing-dockerfile' ? 'Existing Dockerfile' : detectionResult.type,
      imageName: buildResult.imageName,
      tag: buildResult.tag,
      port: targetAppPort,
      appPort: targetAppPort,
      hostPort: targetHostPort,
      localUrl: `http://localhost:${targetHostPort}`,
      containerRunning: containerResult.success,
      containerId: containerResult.containerId,
      runCommand: containerResult.runCommand,
      runError: containerResult.error,
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
      // Brief delay to allow Windows process handles (Git/Docker) to close completely
      await new Promise((resolve) => setTimeout(resolve, 200));
      await cleanupDirectory(tempDir);
    }
  }
});

module.exports = router;
