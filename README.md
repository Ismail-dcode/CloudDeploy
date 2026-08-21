# 🚀 CloudDeploy — Phase 1: Automated Multi-Stack Docker Deployment System

CloudDeploy is an automated deployment engine designed to clone GitHub repositories, auto-detect project types, generate optimized Dockerfiles, build Docker images, and launch containerized applications (Node.js, React/Vite, Python, Go, Static SPAs, and Existing Dockerfiles) locally on isolated host ports.

---

## 🎯 Key Achievements & System Architecture in Phase 1

### 1. Smart Multi-Stack Project Type Detection (`projectDetector.js`)
- **Existing Dockerfile Detection**: Inspects repository root for existing `Dockerfile`.
- **Node.js Application Detection**: Automatically detects `package.json` (npm, yarn, pnpm) and classifies Node backend servers and fullstack apps cleanly without misclassifying them into Nginx containers.
- **Python Application Detection**: Identifies Python projects using `requirements.txt`, `pyproject.toml`, `Pipfile`, `setup.py`, or `*.py` files.
- **Go Application Detection**: Identifies Go modules (`go.mod` and `go.sum`).
- **Static Web Application Detection**: Identifies pure static HTML/CSS/JS websites without Node runtimes.

### 2. Automated Dockerfile Generator (`dockerfileGenerator.js`)
- **Node.js Backend Containers**: Generates `node:22` containers with automatic environment bindings (`HOST=0.0.0.0`, `PORT`) and smart entrypoint determination (`npm start`, `node server.js`).
- **React + Vite App Container Compatibility**: Automatically appends `-- --host 0.0.0.0 --port ${port}` to Vite dev server scripts so containers bind cleanly to `0.0.0.0`, making Vite apps fully accessible over Docker port forwarding without network isolation issues.
- **Python Containers**: Generates `python:3.12` containers, automatically installs dependencies (`requirements.txt` or `pyproject.toml`), and determines entrypoints (`app.py`, `main.py`, `server.py`).
- **Go Multi-Stage Containers**: Generates multi-stage Go builds (`golang:1.24` build stage -> `debian:bookworm-slim` runner) for small, secure production binaries.
- **Static SPA Multi-Stage Builds**: Builds frontend SPAs using `node:22` (`npm run build`) and serves compiled `/dist` output using `nginx:alpine`.

### 3. Dual Port Binding System & Real-Time Availability Check
- **App Port (Container Internal)**: Configurable internal container port (defaults: Node=3000, Python=5000, Go=8080, Static=80).
- **Host Port (Local Machine Binding)**: Configurable local machine free port.
- **Real-Time Host Port Checker (`GET /api/check-port/:port`)**: Live TCP socket availability checker in the UI preventing port conflict errors before deployment.

### 4. Robust Execution Engine & Docker Service (`dockerService.js` & `gitService.js`)
- **Isolated Build Contexts**: Uses unique temp directories (`temp/deployment-<timestamp>-<uuid>`) per build.
- **Git Cloning**: Shallow cloning (`--depth 1`) with automatic cleanup.
- **Automated Container Lifecycle**: Automatically removes old container instances with the same tag before running `docker run -d -p hostPort:appPort`.
- **Windows File Handle Safety**: Automatic retries and process lock handling for clean temporary workspace removal on Windows.

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express, `fs-extra`, `child_process`, `net` (TCP socket checking), `crypto`.
- **Frontend**: React 18, Vite, Vanilla Glassmorphism CSS design system.
- **Containerization**: Docker (Node 22, Python 3.12, Go 1.24, Nginx Alpine).

---

## 📋 API Endpoints

### 1. `POST /api/build`
Triggers the full deployment lifecycle: clone ➜ detect ➜ generate Dockerfile ➜ build image ➜ run container.

**Request Payload:**
```json
{
  "repoUrl": "https://github.com/user/repository",
  "command": "npm start",
  "appPort": 3000,
  "hostPort": 8080,
  "imageName": "my-node-app",
  "buildMode": "auto"
}
```

**Response Payload:**
```json
{
  "success": true,
  "message": "Docker image built and container launched successfully",
  "projectType": "node",
  "imageName": "my-node-app",
  "tag": "latest",
  "appPort": 3000,
  "hostPort": 8080,
  "localUrl": "http://localhost:8080",
  "containerRunning": true,
  "containerId": "a1b2c3d4e5f6",
  "runCommand": "docker run -d -p 8080:3000 --name my-node-app-container my-node-app:latest",
  "dockerfileContent": "..."
}
```

### 2. `GET /api/check-port/:port`
Checks if a TCP port is currently free on localhost.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18+)
- Docker Desktop (installed and running)
- Git

### Installation & Running Locally

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/Ismail-dcode/CloudDeploy.git
   cd CloudDeploy
   ```

2. **Start Backend Server:**
   ```bash
   cd backend
   npm install
   npm start
   ```
   *(Runs on http://localhost:5000)*

3. **Start Frontend Client:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   *(Runs on http://localhost:5173)*

---

## 📄 License
MIT License
