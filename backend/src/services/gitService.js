const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

const TEMP_BASE_DIR = path.join(__dirname, '..', 'temp');

/**
 * Creates a unique temporary build directory for a deployment.
 * @returns {string} Absolute path to the created directory
 */
async function createTempDirectory() {
  await fs.ensureDir(TEMP_BASE_DIR);
  const uniqueName = `deployment-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;
  const dirPath = path.join(TEMP_BASE_DIR, uniqueName);
  await fs.ensureDir(dirPath);
  return dirPath;
}

/**
 * Clones a public GitHub repository into a target directory.
 * @param {string} repoUrl - Validated GitHub repository URL
 * @param {string} targetDir - Absolute path to target directory
 * @returns {Promise<{ success: boolean, stdout: string, stderr: string }>}
 */
function cloneRepository(repoUrl, targetDir) {
  return new Promise((resolve, reject) => {
    // Sanitize repo URL to ensure .git extension if missing, or use as is
    const cloneUrl = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;

    // Execute git clone --depth 1 directly via execFile to avoid shell injection
    execFile('git', ['clone', '--depth', '1', cloneUrl, targetDir], { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        return reject({
          message: `Failed to clone repository from ${repoUrl}`,
          error: stderr || error.message || 'Git clone failed'
        });
      }
      resolve({
        success: true,
        stdout,
        stderr
      });
    });
  });
}

/**
 * Safely removes a temporary directory with retry mechanism for Windows file locking (EBUSY/EPERM).
 * @param {string} dirPath - Directory to remove
 * @param {number} maxRetries - Maximum retry attempts (default 5)
 * @param {number} delayMs - Delay between retries in ms (default 1000)
 */
async function cleanupDirectory(dirPath, maxRetries = 5, delayMs = 1000) {
  if (!dirPath || !dirPath.includes('deployment-')) return;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
      return;
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`Failed to cleanup temp directory ${dirPath} after ${maxRetries} attempts:`, err.message);
      } else {
        // Wait before retrying to allow Windows processes/Docker to release file handles
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}

module.exports = {
  createTempDirectory,
  cloneRepository,
  cleanupDirectory
};
