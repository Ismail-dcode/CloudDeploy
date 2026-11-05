const express = require('express');
const router = express.Router();
const storage = require('../services/storage');
const {
  runDockerContainer,
  verifyContainerReachability,
  stopContainer,
  startContainer,
  removeContainer,
  getContainerLogs,
  listLiveContainers
} = require('../services/dockerService');

/**
 * POST /api/containers/run
 * Mechanism 2: Deploy a container instance on custom port & config from a built image
 */
router.post('/run', async (req, res) => {
  try {
    const { imageName, containerName, hostPort, appPort, envVars, isWeb = true } = req.body;

    if (!imageName) {
      return res.status(400).json({ success: false, message: 'imageName is required' });
    }
    if (!hostPort || isNaN(Number(hostPort))) {
      return res.status(400).json({ success: false, message: 'Valid hostPort is required' });
    }

    const parsedHostPort = Number(hostPort);
    const parsedAppPort = appPort ? Number(appPort) : parsedHostPort;
    const sanitizedContainerName = containerName ? containerName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') : `${imageName}-inst-${Date.now().toString().slice(-4)}`;

    const containerResult = await runDockerContainer({
      imageName,
      containerName: sanitizedContainerName,
      appPort: parsedAppPort,
      hostPort: parsedHostPort,
      envVars: envVars || {},
      isWeb: isWeb !== false
    });

    if (!containerResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to launch container instance',
        error: containerResult.error,
        runCommand: containerResult.runCommand
      });
    }

    let reachabilityStatus = { reachable: true, message: 'Non-web container' };
    if (isWeb !== false) {
      reachabilityStatus = await verifyContainerReachability(parsedHostPort);
    }

    const containerRecord = storage.saveContainer({
      containerId: containerResult.containerId,
      containerName: sanitizedContainerName,
      imageName,
      appPort: parsedAppPort,
      hostPort: parsedHostPort,
      envVars: envVars || {},
      isWeb: isWeb !== false,
      localUrl: isWeb !== false ? `http://localhost:${parsedHostPort}` : null,
      runCommand: containerResult.runCommand,
      status: 'running'
    });

    return res.json({
      success: true,
      message: `Container instance '${sanitizedContainerName}' deployed successfully`,
      container: containerRecord,
      reachability: reachabilityStatus
    });
  } catch (err) {
    console.error('Error running container:', err);
    res.status(500).json({ success: false, message: 'Container deployment failed', error: err.message });
  }
});

/**
 * GET /api/containers
 * Get all container deployments enriched with live Docker status
 */
router.get('/', async (req, res) => {
  try {
    const savedContainers = storage.getContainers();
    const liveContainers = await listLiveContainers();

    const liveMap = new Map();
    liveContainers.forEach(lc => {
      liveMap.set(lc.name, lc);
    });

    const enriched = savedContainers.map(c => {
      const live = liveMap.get(c.containerName);
      if (live) {
        return {
          ...c,
          containerId: live.id || c.containerId,
          status: live.isRunning ? 'running' : 'stopped',
          dockerStatus: live.status
        };
      }
      return c;
    });

    res.json({ success: true, containers: enriched });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list containers', error: err.message });
  }
});

/**
 * POST /api/containers/:name/stop
 * Stop a container instance
 */
router.post('/:name/stop', async (req, res) => {
  try {
    const containerName = req.params.name;
    const result = await stopContainer(containerName);
    if (result.success) {
      storage.updateContainerStatus(containerName, 'stopped');
      return res.json({ success: true, message: `Container ${containerName} stopped.` });
    }
    res.status(500).json({ success: false, message: `Failed to stop ${containerName}`, error: result.error });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/containers/:name/start
 * Start a stopped container instance
 */
router.post('/:name/start', async (req, res) => {
  try {
    const containerName = req.params.name;
    const result = await startContainer(containerName);
    if (result.success) {
      storage.updateContainerStatus(containerName, 'running');
      return res.json({ success: true, message: `Container ${containerName} started.` });
    }
    res.status(500).json({ success: false, message: `Failed to start ${containerName}`, error: result.error });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/containers/:name
 * Remove a container instance
 */
router.delete('/:name', async (req, res) => {
  try {
    const containerName = req.params.name;
    await removeContainer(containerName);
    storage.deleteContainer(containerName);
    res.json({ success: true, message: `Container ${containerName} removed.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/containers/:name/logs
 * Fetch container logs
 */
router.get('/:name/logs', async (req, res) => {
  try {
    const containerName = req.params.name;
    const result = await getContainerLogs(containerName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, logs: '', error: err.message });
  }
});

module.exports = router;
