/**
 * Validates the build input parameters from the user request.
 * 
 * Fields:
 * - repoUrl: valid GitHub URL
 * - command: non-empty string (optional if hasExistingDockerfile or isStaticMode is true)
 * - port / appPort: valid TCP port (1-65535, defaults to 80 in static mode)
 * - hostPort: valid TCP port (1-65535)
 * - imageName: valid Docker image name
 * - isStaticMode / buildMode: string / boolean
 */

function validateBuildInput(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Request body must be a JSON object'] };
  }

  const { repoUrl, command, port, appPort, hostPort, imageName, hasExistingDockerfile, useExistingDockerfile, buildMode, isStaticMode } = data;
  const isExistingDockerfileMode = Boolean(hasExistingDockerfile || useExistingDockerfile || buildMode === 'existing-dockerfile');
  const isStaticWebMode = Boolean(isStaticMode || buildMode === 'static');

  // 1. Validate repoUrl
  if (!repoUrl || typeof repoUrl !== 'string' || repoUrl.trim() === '') {
    errors.push('GitHub Repository URL is required.');
  } else {
    const cleanRepoUrl = repoUrl.trim();
    const githubRegex = /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?\/?$/;
    if (!githubRegex.test(cleanRepoUrl)) {
      errors.push('Must be a valid GitHub repository URL (e.g., https://github.com/user/repo)');
    }
  }

  // 2. Validate command (Required ONLY when explicitly requested or checked after repo detection)
  // For auto mode, command is optional at validation time and checked after repo detection if project is a Node.js server.

  // 3. Validate App Port (internal container port)
  const targetAppPort = isStaticWebMode ? 80 : (appPort !== undefined ? appPort : (port !== undefined ? port : 80));
  const parsedAppPort = Number(targetAppPort);
  if (targetAppPort === undefined || targetAppPort === null || targetAppPort === '' || isNaN(parsedAppPort)) {
    errors.push('Application port must be a valid number.');
  } else if (!Number.isInteger(parsedAppPort) || parsedAppPort < 1 || parsedAppPort > 65535) {
    errors.push('Application port must be an integer between 1 and 65535.');
  }

  // 4. Validate Host Port (local machine free port)
  const targetHostPort = hostPort !== undefined ? hostPort : (port !== undefined ? port : 3300);
  const parsedHostPort = Number(targetHostPort);
  if (targetHostPort === undefined || targetHostPort === null || targetHostPort === '' || isNaN(parsedHostPort)) {
    errors.push('Host port must be a valid number.');
  } else if (!Number.isInteger(parsedHostPort) || parsedHostPort < 1 || parsedHostPort > 65535) {
    errors.push('Host port must be an integer between 1 and 65535.');
  }

  // 5. Validate imageName
  if (!imageName || typeof imageName !== 'string' || imageName.trim() === '') {
    errors.push('Docker image name is required.');
  } else {
    const cleanImageName = imageName.trim();
    const dockerImageRegex = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/;
    if (!dockerImageRegex.test(cleanImageName)) {
      errors.push('Image name must contain only lowercase letters, numbers, hyphens, underscores, or periods (e.g., my-node-app).');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? {
      repoUrl: repoUrl.trim().replace(/\.git$/, ''),
      command: (command && typeof command === 'string') ? command.trim() : '',
      port: Number(targetAppPort),
      appPort: Number(targetAppPort),
      hostPort: Number(targetHostPort),
      imageName: imageName.trim().toLowerCase(),
      useExistingDockerfile: isExistingDockerfileMode,
      isStaticMode: isStaticWebMode,
      buildMode: isStaticWebMode ? 'static' : (isExistingDockerfileMode ? 'existing-dockerfile' : 'auto')
    } : null
  };
}

module.exports = {
  validateBuildInput
};
