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

/**
 * Runs the built Docker container locally mapping host port to application container port (-p hostPort:appPort).
 * 
 * @param {object} options
 * @param {string} options.imageName
 * @param {number} [options.port]
 * @param {number} [options.appPort]
 * @param {number} [options.hostPort]
 * @returns {Promise<{ success: boolean, containerId?: string, error?: string, runCommand: string }>}
 */
function runDockerContainer({ imageName, port, appPort, hostPort }) {
  const targetAppPort = appPort !== undefined ? appPort : port;
  const targetHostPort = hostPort !== undefined ? hostPort : targetAppPort;

  const containerName = `${imageName}-container`;
  const runCommand = `docker run -d -p ${targetHostPort}:${targetAppPort} --name ${containerName} ${imageName}:latest`;

  return new Promise((resolve) => {
    // Stop and remove existing container with the same name if present
    execFile('docker', ['rm', '-f', containerName], () => {
      // Run new container
      execFile(
        'docker',
        ['run', '-d', '-p', `${targetHostPort}:${targetAppPort}`, '--name', containerName, `${imageName}:latest`],
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

module.exports = {
  buildDockerImage,
  runDockerContainer
};
