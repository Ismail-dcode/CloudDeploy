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
 * Runs a Docker container locally mapping host port to application container port (-p hostPort:appPort),
 * injecting environment variables (-e KEY=VALUE).
 * 
 * @param {object} options
 * @param {string} options.imageName
 * @param {string} [options.containerName]
 * @param {number} [options.port]
 * @param {number} [options.appPort]
 * @param {number} [options.hostPort]
 * @param {object} [options.envVars]
 * @param {boolean} [options.isWeb]
 * @returns {Promise<{ success: boolean, containerId?: string, error?: string, runCommand: string }>}
 */
function runDockerContainer({ imageName, containerName, port, appPort, hostPort, envVars = {}, isWeb = true }) {
  const targetAppPort = appPort !== undefined ? appPort : port;
  const targetHostPort = hostPort !== undefined ? hostPort : targetAppPort;

  const sanitizedContainerName = containerName ? containerName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') : `${imageName}-container`;
  
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
  const runCommand = `docker run -d ${portArgStr}${envCmdStr}--name ${sanitizedContainerName} ${imageName}:latest`.trim();

  return new Promise((resolve) => {
    // Stop and remove existing container with the same name if present
    execFile('docker', ['rm', '-f', sanitizedContainerName], () => {
      const dockerArgs = ['run', '-d'];
      if (isWeb && targetHostPort && targetAppPort) {
        dockerArgs.push('-p', `${targetHostPort}:${targetAppPort}`);
      }
      dockerArgs.push(...envArgs);
      dockerArgs.push('--name', sanitizedContainerName, `${imageName}:latest`);

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
            containerName: sanitizedContainerName,
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

function stopContainer(containerName) {
  return new Promise((resolve) => {
    execFile('docker', ['stop', containerName], (error, stdout, stderr) => {
      if (error) return resolve({ success: false, error: stderr || error.message });
      resolve({ success: true, output: stdout.trim() });
    });
  });
}

function startContainer(containerName) {
  return new Promise((resolve) => {
    execFile('docker', ['start', containerName], (error, stdout, stderr) => {
      if (error) return resolve({ success: false, error: stderr || error.message });
      resolve({ success: true, output: stdout.trim() });
    });
  });
}

function removeContainer(containerName) {
  return new Promise((resolve) => {
    execFile('docker', ['rm', '-f', containerName], (error, stdout, stderr) => {
      if (error) return resolve({ success: false, error: stderr || error.message });
      resolve({ success: true, output: stdout.trim() });
    });
  });
}

function getContainerLogs(containerName) {
  return new Promise((resolve) => {
    execFile('docker', ['logs', '--tail', '300', containerName], (error, stdout, stderr) => {
      const logs = (stdout || '') + '\n' + (stderr || '');
      resolve({ success: !error, logs: logs.trim() });
    });
  });
}

function deleteDockerImage(imageName) {
  return new Promise((resolve) => {
    const fullTag = imageName.includes(':') ? imageName : `${imageName}:latest`;
    execFile('docker', ['rmi', '-f', fullTag], (error, stdout, stderr) => {
      if (error) return resolve({ success: false, error: stderr || error.message });
      resolve({ success: true, output: stdout.trim() });
    });
  });
}

function listLiveContainers() {
  return new Promise((resolve) => {
    execFile('docker', ['ps', '-a', '--format', '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}'], (error, stdout) => {
      if (error || !stdout) return resolve([]);
      const lines = stdout.trim().split('\n').filter(Boolean);
      const list = lines.map((line) => {
        const [id, name, image, status, ports] = line.split('|');
        return { id, name, image, status, ports, isRunning: status ? status.startsWith('Up') : false };
      });
      resolve(list);
    });
  });
}

module.exports = {
  buildDockerImage,
  runDockerContainer,
  verifyContainerReachability,
  stopContainer,
  startContainer,
  removeContainer,
  getContainerLogs,
  deleteDockerImage,
  listLiveContainers
};


