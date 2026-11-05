const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const IMAGES_FILE = path.join(DATA_DIR, 'images.json');
const CONTAINERS_FILE = path.join(DATA_DIR, 'containers.json');
const DEPLOYMENTS_FILE = path.join(DATA_DIR, 'deployments.json');

// Ensure data directory and files exist
function initStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(IMAGES_FILE)) {
    fs.writeFileSync(IMAGES_FILE, JSON.stringify([], null, 2), 'utf8');
  }
  if (!fs.existsSync(CONTAINERS_FILE)) {
    fs.writeFileSync(CONTAINERS_FILE, JSON.stringify([], null, 2), 'utf8');
  }
  if (!fs.existsSync(DEPLOYMENTS_FILE)) {
    fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

initStorage();

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err);
    return [];
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing file ${filePath}:`, err);
    return false;
  }
}

// Image Store Helpers
function getImages() {
  return readJsonFile(IMAGES_FILE);
}

function saveImage(imageData) {
  const images = getImages();
  // Check if image record exists with same id or imageName
  const existingIdx = images.findIndex((img) => img.id === imageData.id || img.imageName === imageData.imageName);
  if (existingIdx !== -1) {
    images[existingIdx] = { ...images[existingIdx], ...imageData, updatedAt: new Date().toISOString() };
  } else {
    images.unshift({
      id: imageData.id || `img_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      createdAt: new Date().toISOString(),
      ...imageData
    });
  }
  writeJsonFile(IMAGES_FILE, images);
  return imageData;
}

// Merge ECR push metadata into an existing image record (matched by id or imageName)
function updateImageEcrMeta(imageKey, ecrMeta) {
  const images = getImages();
  const idx = images.findIndex((img) => img.id === imageKey || img.imageName === imageKey);
  if (idx === -1) return null;
  images[idx] = { ...images[idx], ...ecrMeta, updatedAt: new Date().toISOString() };
  writeJsonFile(IMAGES_FILE, images);
  return images[idx];
}

function deleteImage(imageId) {
  let images = getImages();
  const initialLen = images.length;
  images = images.filter((img) => img.id !== imageId && img.imageName !== imageId);
  if (images.length !== initialLen) {
    writeJsonFile(IMAGES_FILE, images);
    return true;
  }
  return false;
}

// Container Store Helpers
function getContainers() {
  return readJsonFile(CONTAINERS_FILE);
}

function saveContainer(containerData) {
  const containers = getContainers();
  const existingIdx = containers.findIndex((c) => c.containerName === containerData.containerName || c.containerId === containerData.containerId);
  if (existingIdx !== -1) {
    containers[existingIdx] = { ...containers[existingIdx], ...containerData, updatedAt: new Date().toISOString() };
  } else {
    containers.unshift({
      id: containerData.id || `cnt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      createdAt: new Date().toISOString(),
      status: 'running',
      ...containerData
    });
  }
  writeJsonFile(CONTAINERS_FILE, containers);
  return containerData;
}

function updateContainerStatus(containerName, status) {
  const containers = getContainers();
  const idx = containers.findIndex((c) => c.containerName === containerName || c.containerId === containerName);
  if (idx !== -1) {
    containers[idx].status = status;
    containers[idx].updatedAt = new Date().toISOString();
    writeJsonFile(CONTAINERS_FILE, containers);
    return containers[idx];
  }
  return null;
}

function deleteContainer(containerName) {
  let containers = getContainers();
  const initialLen = containers.length;
  containers = containers.filter((c) => c.containerName !== containerName && c.containerId !== containerName);
  if (containers.length !== initialLen) {
    writeJsonFile(CONTAINERS_FILE, containers);
    return true;
  }
  return false;
}

// ── EC2 Deployment Store Helpers ─────────────────────────────────────────────
function getDeployments() {
  return readJsonFile(DEPLOYMENTS_FILE);
}

function getDeployment(id) {
  return getDeployments().find((d) => d.id === id) || null;
}

function saveDeployment(deploymentData) {
  const deployments = getDeployments();
  const idx = deployments.findIndex((d) => d.id === deploymentData.id);

  if (idx !== -1) {
    deployments[idx] = { ...deployments[idx], ...deploymentData, updatedAt: new Date().toISOString() };
  } else {
    deployments.unshift({ createdAt: new Date().toISOString(), ...deploymentData });
  }
  writeJsonFile(DEPLOYMENTS_FILE, deployments);
  return getDeployment(deploymentData.id);
}

/**
 * Appends a progress log line to a deployment record.
 * Callers must never pass secret values in `message`.
 */
function appendDeploymentLog(id, level, message) {
  const deployment = getDeployment(id);
  if (!deployment) return null;

  const logs = Array.isArray(deployment.logs) ? deployment.logs : [];
  logs.push({ ts: new Date().toISOString(), level, message: String(message).slice(0, 2000) });

  // Keep only the most recent 200 lines per deployment
  const trimmed = logs.slice(-200);
  return saveDeployment({ id, logs: trimmed });
}

function deleteDeploymentRecord(id) {
  const deployments = getDeployments();
  const remaining = deployments.filter((d) => d.id !== id);
  if (remaining.length === deployments.length) return false;
  writeJsonFile(DEPLOYMENTS_FILE, remaining);
  return true;
}

module.exports = {
  getImages,
  saveImage,
  updateImageEcrMeta,
  deleteImage,
  getContainers,
  saveContainer,
  updateContainerStatus,
  deleteContainer,
  getDeployments,
  getDeployment,
  saveDeployment,
  appendDeploymentLog,
  deleteDeploymentRecord
};
