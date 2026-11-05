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

### 3. `POST /api/ecr/push`
Runs the **GitHub → Docker → Amazon ECR** pipeline for an image that was already built by `POST /api/build`. It authenticates to ECR, tags the local image with a **unique deployment ID tag**, and pushes it to your ECR repository.

**Request Payload:**
```json
{
  "imageName": "fastapi-app",
  "deploymentId": "img_1787549554168_sc91s9"
}
```

**Response Payload (success):**
```json
{
  "success": true,
  "message": "Image successfully pushed to Amazon ECR",
  "imageUri": "123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app-repo:deploy-img_1787549554168_sc91s9",
  "tag": "deploy-img_1787549554168_sc91s9",
  "registry": "123456789012.dkr.ecr.us-east-1.amazonaws.com",
  "deploymentId": "img_1787549554168_sc91s9",
  "ecrStatus": "pushed"
}
```

Failures return `success: false` with the failing pipeline `step` (`config` | `auth` | `tag` | `push`) and a redacted error message. Credentials are never echoed back.

**Pipeline steps:**
1. **Config** – validate `AWS_REGION`, `AWS_ACCOUNT_ID`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `ECR_REPOSITORY`.
2. **Auth** – `aws ecr get-login-password` piped into `docker login --password-stdin` (the token is never logged or stored).
3. **Tag** – `docker tag <local-image> <registry>/<repo>:deploy-<deploymentId>`.
4. **Push** – `docker push` the tagged image to ECR.

### 4. `GET /api/ecr/config`
Returns ECR configuration **status only** (variable names marked `configured`/`missing`, plus the non-secret registry and repository names). No credential values are ever returned.

---

## 🚀 EC2 Deployment API

Deploys a pushed ECR image onto a **fresh EC2 instance**: the backend launches the instance with a user-data script that installs Docker, logs into ECR (via the instance role), pulls your image and runs your containers. The deployment only reports **DEPLOYED** after an HTTP health check against the public IP succeeds — and the returned **public IP + application URL** come from the actual running instance. The ECS Fargate/ALB pipeline has been removed — deployments are plain EC2 + Docker now.

| Endpoint | Purpose |
|---|---|
| `GET /api/deployments/config` | Status of the EC2 deploy config (missing var **names** only, region, instance types, AMI, instance profile) |
| `POST /api/deployments` | Validates the config and starts an async deployment → `202` with a `deploymentId` |
| `GET /api/deployments` | Deployment history with status, progress, URLs (env **values masked**, secrets **never returned**) |
| `GET /api/deployments/:id` | Deployment detail + progress log |
| `DELETE /api/deployments/:id` | Terminates the instance and removes **only** this deployment's resources |

**`POST /api/deployments` body:**
```json
{
  "imageUri": "429877856333.dkr.ecr.us-east-1.amazonaws.com/apps:deploy-img_1791827183063_2k71r",
  "instanceType": "t3.micro",
  "region": "us-east-1",
  "containerPort": 8000,
  "hostPort": 80,
  "containers": 1,
  "instanceName": "my-app-prod",
  "environmentVariables": { "NODE_ENV": "production" },
  "secretVariables": { "DATABASE_URL": "postgres://..." }
}
```

**Response (`202`, and on every `GET`):**
```json
{
  "deploymentId": "ec2dpl_1791830000000_ab12cd34",
  "status": "PENDING",
  "instanceId": null,
  "publicIp": null,
  "applicationUrl": null,
  "imageUri": "429877856333.dkr.ecr.us-east-1.amazonaws.com/apps:...",
  "instanceType": "t3.micro",
  "containerPort": 8000,
  "hostPort": 80
}
```
When the deployment finishes, `status` becomes `DEPLOYED` and `instanceId` / `publicIp` / `applicationUrl` (e.g. `http://54.1.2.3:80`) are filled in. `applicationUrl` is always plain **HTTP** — no TLS is claimed unless you actually configure it.

**Lifecycle** (every stage comes from a *real* signal — EC2 state, EC2 status checks 2/2, SSM bootstrap markers, HTTP health check — never from timers alone):

```
PENDING → PROVISIONING → INSTANCE_RUNNING → DOCKER_INSTALLING
        → PULLING_IMAGE → STARTING_CONTAINER → HEALTH_CHECK → DEPLOYED
```

- `DOCKER_INSTALLING`/`PULLING_IMAGE`/`STARTING_CONTAINER` are derived by reading `/var/log/clouddeploy-userdata.log` on the instance through **AWS SSM Run Command** (the script writes `step=` markers); a `userdata-failed:*` marker fails the deployment with the failing step.
- Any failure sets `FAILED` with a safe error message and **auto-cleans up** (instance terminated, this deployment's security-group rules revoked, secret parameters deleted).

**How containers are run on the instance:**
- Host ports are `hostPort`, `hostPort+1`, … — one per container, all mapping to `containerPort`. With `hostPort=80`, `containers=2`, `containerPort=8000`: `-p 80:8000` and `-p 81:8000`, URLs `http://<ip>:80` and `http://<ip>:81`.
- Containers run with `--restart unless-stopped`; env vars are injected with `-e` (values shell-quoted — no command injection is possible).
- The user-data script logs **step markers only** (never variable values) to `/var/log/clouddeploy-userdata.log` on the instance.

**Secrets (`secretVariables`):** values are written by the backend to **SSM Parameter Store SecureString** (`/clouddeploy/<deploymentId>/<KEY>`), fetched by the instance at boot through its instance role (scoped `ssm:GetParameter` on `/clouddeploy/*` only), passed to `docker run` from root-only temp files, then `shred`ed. Secret values are **never persisted, logged, or returned by the API** — only their key names.

**Validation (rejections happen before any AWS call):**
- `imageUri` must be a full ECR URI **from your own account/region**
- `instanceType` must be in the whitelist (t3/t3a/t2 micro–medium); `region` must match the configured VPC/subnet region
- `containers` 1–5, `containerPort` 1–65535, `hostPort` 1–65533
- Env names must match `[A-Za-z_][A-Za-z0-9_]*`, max 30 vars, no duplicate keys
- **Idempotency:** `RunInstances` uses `ClientToken = <deploymentId>` — replaying a request never launches a duplicate instance.

### Environment variables (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `EC2_VPC_ID` | ✅ | VPC where deployment instances launch |
| `EC2_SUBNET_ID` | ✅ | Public subnet (must auto-assign public IPs) |
| `EC2_INSTANCE_TYPE` | optional | Default instance type, `t3.micro` (free-tier eligible) — overridable per deployment in the UI |
| `EC2_KEY_NAME` | optional | Key pair — leave empty (instances are managed without SSH) |
| `EC2_AMI_ID` | optional | Pinned AMI — empty resolves latest Amazon Linux 2023 via SSM |

Credentials come from **AWS SDK default credential resolution** — `.env`-provided `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` are read by the SDK's environment provider. No credentials are hardcoded, logged, placed in user-data, or returned to the frontend.

### What the backend sets up automatically (idempotent, one-time)
- **IAM instance profile `clouddeploy-ec2-runner`** — role trusted by `ec2.amazonaws.com` with:
  - AWS managed **`AmazonEC2ContainerRegistryReadOnly`** (pull-only ECR access; least privilege)
  - AWS managed **`AmazonSSMManagedInstanceCore`** (so the backend can verify the bootstrap via SSM)
  - a scoped inline policy `ssm:GetParameter` on `arn:aws:ssm:<region>:<account>:parameter/clouddeploy/*` (read this app's secrets only)
- **Reusable security group `clouddeploy-ec2-app`** — created once; each deployment's exact host-port range is opened (`0.0.0.0/0` on those TCP ports only). **SSH/port 22 is never opened.** Cleanup revokes only *that* deployment's rules so concurrent deployments are unaffected.

### IAM permissions (least privilege) for the deploying principal
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": [
        "ec2:RunInstances", "ec2:DescribeInstances", "ec2:DescribeInstanceStatus",
        "ec2:TerminateInstances", "ec2:CreateTags"
      ], "Resource": "*" },
    { "Effect": "Allow", "Action": [
        "ec2:CreateSecurityGroup", "ec2:DescribeSecurityGroups",
        "ec2:AuthorizeSecurityGroupIngress", "ec2:RevokeSecurityGroupIngress",
        "ec2:DeleteSecurityGroup"
      ], "Resource": "*" },
    { "Effect": "Allow", "Action": "ssm:GetParameter",
      "Resource": "arn:aws:ssm:*::parameter/aws/service/ami-amazon-linux-latest/*" },
    { "Effect": "Allow", "Action": [
        "ssm:SendCommand", "ssm:GetCommandInvocation", "ssm:DescribeInstanceInformation",
        "ssm:PutParameter", "ssm:DeleteParameter", "ssm:DeleteParameters"
      ], "Resource": "*" },
    { "Effect": "Allow", "Action": [
        "iam:GetRole", "iam:CreateRole", "iam:AttachRolePolicy", "iam:PutRolePolicy",
        "iam:GetInstanceProfile", "iam:CreateInstanceProfile", "iam:AddRoleToInstanceProfile"
      ], "Resource": "arn:aws:iam::*:role/clouddeploy-ec2-runner*" },
    { "Effect": "Allow", "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::*:role/clouddeploy-ec2-runner",
      "Condition": { "StringEquals": { "iam:PassedToService": "ec2.amazonaws.com" } } }
  ]
}
```

### Cleanup & delete safety (per-deployment resources only)
`DELETE /api/deployments/:id` terminates **only** the instance carrying this deployment's ownership tag (`cloud-deploy-deployment=<id>`) — an instance missing the tag is refused, so unrelated EC2 resources are never touched — then revokes this deployment's security-group rules and deletes its secret parameters. Shared resources (IAM role/profile, reusable security group) stay for reuse. On failure the same cleanup runs automatically. **Terminate deployments you no longer need — running instances bill by the hour.**

> Authentication note: this project has no multi-user auth — the API is the existing single-user convention (local dev server), and ownership is enforced structurally via the deployment record + AWS tag check before any terminate call.

### What requires manual AWS Console setup
Nothing is required up-front: the VPC/subnet go in `.env`, and the IAM instance profile is auto-created on the first deployment (the deploying principal needs the IAM permissions above). Optional: set `EC2_KEY_NAME` if you want SSH access to instances.

## ☁️ Amazon ECR Setup

1. Copy the example env file and fill in your values (never commit `.env` — it is already listed in `.gitignore`):
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Provide an IAM user/role with at least: `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:PutImage`.
3. Create the repository in the same region as `AWS_REGION`:
   ```bash
   aws ecr create-repository --repository-name my-app-repo --region us-east-1
   ```
4. Prerequisites: **AWS CLI v2** on `PATH` and **Docker** running locally.
5. In the UI, build an image and click **☁️ Push to ECR** (Build result card or Image Registry) — the final ECR image URI and deployment status are shown on success.

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
   *(Runs on http://localhost:3300 — see `frontend/vite.config.js`)*

---

## 📄 License
MIT License
