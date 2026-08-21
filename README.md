# 🚀 CloudDeploy — Automated Multi-Stack Docker Deployment System

CloudDeploy is an automated deployment engine designed to clone GitHub repositories, deep-scan project structures, generate framework-optimized production Dockerfiles, build Docker images, test host reachability, and launch containerized applications (FastAPI, Django, Flask, Streamlit, Gradio, Tornado, Sanic, aiohttp, Celery, Node.js, React/Vite, Go, and Static SPAs) locally on isolated host ports.

---

## 🎯 Key System Architecture & Universal Engines

### 1. Universal Python Detection & Deployment Engine (`pythonDetector.js` & `dockerfileGenerator.js`)
- **Deep Framework Classification**: Scans code, imports, and configuration files to classify projects as **FastAPI, Django, Flask, Streamlit, Gradio, Tornado, Sanic, aiohttp, Bottle, Celery/Worker, CLI, or Generic**.
- **Application Category Distinction**: Distinguishes `web` applications from `cli` / `worker` / `background` tasks so non-web services do not expose ports unnecessarily.
- **Dependency Manager Support**: Full support for `pip` (`requirements.txt`), `poetry` (`pyproject.toml`), `pipenv` (`Pipfile`), and `setup.py`.
- **Framework Production Commands**:
  - **FastAPI**: `uvicorn main:app --host 0.0.0.0 --port ${port}`
  - **Django**: `python manage.py collectstatic --noinput && gunicorn --bind 0.0.0.0:${port} project.wsgi:application`
  - **Flask**: `gunicorn --bind 0.0.0.0:${port} app:app`
  - **Streamlit**: `streamlit run app.py --server.address 0.0.0.0 --server.port 8501`
  - **Gradio**: `python app.py` with `GRADIO_SERVER_NAME=0.0.0.0` & `GRADIO_SERVER_PORT=7860`
  - **Celery / Workers**: Runs workers without opening web ports.
- **Environment Variable Scanning**: Auto-scans `.env.example`, `.env.template`, `config.py`, and `os.getenv` references without exposing secrets.

### 2. Multi-Stack Node.js & React/Vite Engine
- **Node.js Servers**: Generates `node:22` containers with automatic environment bindings (`HOST=0.0.0.0`, `PORT`) and smart entrypoint determination (`npm start`, `node server.js`).
- **React + Vite App Container Compatibility**: Automatically appends `-- --host 0.0.0.0 --port ${port}` to Vite dev server scripts so containers bind cleanly to `0.0.0.0`.
- **Static SPA Multi-Stage Builds**: Multi-stage Docker build (`node:22` running `npm run build` -> `nginx:alpine` serving compiled `/dist`).

### 3. Dual Port Binding & Real-Time Availability Check
- **App Port (Container Internal)**: Framework-aware internal container ports (FastAPI/Django=8000, Streamlit=8501, Gradio=7860, Flask=5000, Static=80).
- **Host Port (Local Machine Binding)**: Configurable local machine free port.
- **Real-Time Host Port Checker (`GET /api/check-port/:port`)**: Live TCP socket availability checker in the UI preventing port conflict errors before deployment.
- **Host Reachability Verification**: HTTP polling against `http://localhost:${hostPort}` to confirm app readiness before declaring success.

### 4. Dynamic Environment Variable Injection (`dockerService.js`)
- UI input section for key-value environment variables.
- Pass environment secrets securely into containers via `docker run -e KEY=VAL`.

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express, `fs-extra`, `child_process`, `net`, `http`, `crypto`.
- **Frontend**: React 18, Vite, Vanilla Glassmorphism CSS design system.
- **Containerization**: Docker (Python 3.12, Node 22, Go 1.24, Nginx Alpine, Gunicorn, Uvicorn).

---

## 📋 API Endpoints

### 1. `POST /api/build`
Triggers full deployment lifecycle: clone ➜ deep scan ➜ generate Dockerfile ➜ build ➜ inject env ➜ run container ➜ verify host reachability.

**Request Payload:**
```json
{
  "repoUrl": "https://github.com/user/python-fastapi-app",
  "command": "",
  "appPort": 8000,
  "hostPort": 8000,
  "imageName": "fastapi-app",
  "buildMode": "auto",
  "envVars": {
    "DATABASE_URL": "postgresql://user:pass@localhost/db",
    "SECRET_KEY": "my-secret-key"
  }
}
```

**Response Payload:**
```json
{
  "success": true,
  "message": "Docker image built and container launched successfully",
  "projectType": "python",
  "details": {
    "framework": "fastapi",
    "category": "web",
    "pythonVersion": "3.12",
    "dependencyManager": "pip",
    "entryPoint": "main.py",
    "appObject": "app",
    "defaultPort": 8000,
    "detectedEnvVars": ["DATABASE_URL", "SECRET_KEY"]
  },
  "imageName": "fastapi-app",
  "tag": "latest",
  "appPort": 8000,
  "hostPort": 8000,
  "localUrl": "http://localhost:8000",
  "containerRunning": true,
  "containerId": "a1b2c3d4e5f6",
  "reachability": {
    "reachable": true,
    "statusCode": 200,
    "message": "Application is reachable on http://localhost:8000 (HTTP Status 200)"
  },
  "envVarsInjected": ["DATABASE_URL", "SECRET_KEY"],
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
