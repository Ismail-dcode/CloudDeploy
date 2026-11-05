# 🚀 CloudDeploy — GitHub → Docker → Amazon ECR → EC2 Deployment Platform

CloudDeploy is an automated container deployment platform. It clones a GitHub repository, deep-scans the project structure, generates a framework-optimized production Dockerfile, builds the image, pushes it to **Amazon ECR** — and then deploys that image onto a **freshly launched EC2 instance** with one click: no AWS console, no SSH, no manual Docker commands. The backend returns the instance's **public IP** and a working **application URL** only after a real HTTP health check passes.

Supported stacks: **FastAPI, Django, Flask, Streamlit, Gradio, Tornado, Sanic, aiohttp, Celery, Bottle, Node.js, React/Vite, Go, and static SPAs.**

---

## ✨ Platform Highlights

- **Full pipeline:** GitHub clone → deep scan → Dockerfile generation → `docker build` → **push to Amazon ECR** → **deploy to EC2**.
- **Build-only by default** — Image Builder Studio builds and stores images; running containers (local or EC2) is always an explicit action.
- **EC2 Deploy console** — pick an ECR image, instance type, region, container port, host port (default `80`), 1–5 containers, optional instance name, and dynamic environment variables (with per-variable **secret** flag → SSM SecureString).
- **Real progress, no fake bars** — the lifecycle is driven by actual signals: EC2 instance state, status checks 2/2, SSM bootstrap markers read from the instance, and an HTTP health check.
- **Result card on success** — deployment status, instance ID, public IP, clickable application URL, image URI, ports, and a **Terminate** button.
- **Security-first** — no AWS credentials in code or user-data, environment values masked in API responses, least-privilege IAM, SSH never opened, ownership-tag verification before terminating anything, idempotent instance launches.
- **Local container toolkit** — run / stop / start / view logs for local Docker deployments (existing feature, preserved).

---

## 🎯 Core Engines

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
- **Static SPA Multi-Stage Builds**: Multi-stage Docker build (`node:22` running `npm run build` → `nginx:alpine` serving compiled `/dist`).

### 3. Dual Port Binding & Real-Time Availability Check
- **App Port (Container Internal)**: Framework-aware internal container ports (FastAPI/Django=8000, Streamlit=8501, Gradio=7860, Flask=5000, Static=80).
- **Host Port (Local Machine Binding)**: Configurable local machine free port.
- **Real-Time Host Port Checker (`GET /api/check-port/:port`)**: Live TCP socket availability checker in the UI preventing port conflict errors before deployment.
- **Host Reachability Verification**: HTTP polling against `http://localhost:${hostPort}` to confirm app readiness before declaring success.

### 4. Dynamic Environment Variable Injection (`dockerService.js`)
- UI input section for key-value environment variables.
- Pass environment securely into containers via `docker run -e KEY=VAL` (shell-quoted — no injection is possible).

### 5. EC2 Deployment Engine (`ec2DeployService.js`)
- **Idempotent shared setup** (created once, reused): latest Amazon Linux 2023 AMI via the public SSM parameter, IAM instance profile `clouddeploy-ec2-runner` (ECR pull-only + SSM core + scoped secret access), and the reusable security group `clouddeploy-ec2-app`.
- **Dynamic user-data script**: installs Docker → ECR login through the **instance role** (never static credentials) → pulls your exact image URI → runs N containers with `--restart unless-stopped` and per-container host-port mapping, writing `step=` markers to `/var/log/clouddeploy-userdata.log`.
- **Lifecycle tracking**: `PENDING → PROVISIONING → INSTANCE_RUNNING → DOCKER_INSTALLING → PULLING_IMAGE → STARTING_CONTAINER → HEALTH_CHECK → DEPLOYED`, where the bootstrap stages are derived by reading those markers on the instance via **AWS SSM Run Command**, and the final stage requires a successful HTTP health check against the public IP.
- **Failure handling**: safe error messages, automatic cleanup (instance terminated, this deployment's rules revoked, secrets deleted), and resume/reconcile of in-flight deployments after a backend restart.

---

## 🧭 User Interface Workflow

| Tab | What you do there |
|---|---|
| 🛠️ **Image Builder Studio** | Paste a GitHub URL → scan → build. **Build-only by default** (button reads *🛠️ BUILD & STORE IMAGE*); ticking *deploy container* opts in to a local `docker run`. |
| 📦 **Image Registry** | All built images with ECR status. Actions: ☁️ **Push to ECR**, 🚀 **Deploy to EC2**, delete. |
| 🚀 **EC2 Deploy** | The **"Deploy Your Application"** console: image picker, instance type, region, containers, ports, env-var editor, live lifecycle progress, result card, terminate. |
| 🚀 **Containers & Deployments** | Local Docker containers: stop / start / logs / remove. |

**Typical flow:** build an image → **☁️ Push to ECR** → **🚀 Deploy Your Application** → watch the lifecycle → open `http://<public-ip>:<host-port>` → **Terminate** when finished.

---

## 🛠️ Technology Stack

- **Backend**: Node.js (v18+), Express, AWS SDK for JavaScript v3 (`client-ec2`, `client-iam`, `client-ssm`), `fs-extra`, `uuid`, `dotenv`. (ECR push uses the **AWS CLI** via `docker login` — no ECR SDK dependency.)
- **Frontend**: React 18, Vite (dev server on port **3300**, proxying `/api` → `http://localhost:5000`), vanilla glassmorphism CSS.
- **Containerization**: Docker (Python 3.12, Node 22, Go 1.24, Nginx Alpine, Gunicorn, Uvicorn).
- **AWS services**: Amazon ECR, Amazon EC2, AWS Systems Manager, AWS IAM. **No ECS, EKS, Kubernetes, or Terraform.**

---

## 📁 Project Structure

```
CloudDeploy/
├── backend/
│   ├── data/                        # JSON stores: images, containers, deployments
│   │   ├── images.json
│   │   ├── containers.json
│   │   └── deployments.json
│   ├── src/
│   │   ├── server.js                # Express app: mounts all routes, boot-time reconcile
│   │   ├── routes/
│   │   │   ├── build.js             # POST /api/build, GET /api/images, check-port
│   │   │   ├── containers.js        # local container run/stop/start/logs
│   │   │   ├── ecr.js               # POST /api/ecr/push, GET /api/ecr/config
│   │   │   └── deployments.js       # /api/deployments  (EC2 deploy API)
│   │   ├── services/
│   │   │   ├── gitService.js        # repo clone / update
│   │   │   ├── projectDetector.js   # language + project classification
│   │   │   ├── pythonDetector.js    # framework detection (FastAPI, Django, …)
│   │   │   ├── dockerfileGenerator.js
│   │   │   ├── dockerService.js     # build / run / reachability
│   │   │   ├── ecrService.js        # ECR auth, tag, push (+ secret redaction)
│   │   │   ├── ec2DeployService.js  # EC2 provisioning, lifecycle, SSM, cleanup
│   │   │   └── storage.js           # JSON persistence helpers
│   │   └── utils/                   # validation, command parsing
│   └── package.json
├── frontend/
│   ├── vite.config.js               # port 3300 + /api proxy → :5000
│   └── src/
│       ├── App.jsx                  # state, polling, tab routing
│       └── components/
│           ├── BuildForm.jsx        # Image Builder Studio (build-only default)
│           ├── Ec2DeployConsole.jsx # "Deploy Your Application" console
│           ├── EcrPushModal.jsx     # push-to-ECR wizard
│           ├── ImageRegistry.jsx    # images + push/deploy actions
│           ├── ContainersDashboard.jsx
│           ├── DeployModal.jsx / DeploymentProgress.jsx / ResultCard.jsx
│           └── Header / Navigation / LandingPage
└── README.md
```

---

## 📋 API Reference

> The Vite dev server proxies `/api` to the backend on port **5000**.

### `GET /api/health`
Liveness check → `{ "status": "ok", "service": "CloudDeploy Engine", ... }`.

### `GET /api/check-port/:port`
Checks whether a TCP port is free on localhost.

### `POST /api/build`
Runs the build pipeline: clone → deep scan → generate Dockerfile → `docker build` → store the image record. Containers are started **only** when `"deployNow": true` — the UI sends `false` by default (build-only).

**Request payload:**
```json
{
  "repoUrl": "https://github.com/user/python-fastapi-app",
  "command": "",
  "appPort": 8000,
  "hostPort": 8000,
  "imageName": "fastapi-app",
  "buildMode": "auto",
  "deployNow": false,
  "envVars": { "DATABASE_URL": "postgresql://...", "SECRET_KEY": "..." }
}
```

**Response payload (success):**
```json
{
  "success": true,
  "message": "Docker image built successfully",
  "projectType": "python",
  "details": {
    "framework": "fastapi",
    "category": "web",
    "pythonVersion": "3.12",
    "dependencyManager": "pip",
    "entryPoint": "main.py",
    "defaultPort": 8000,
    "detectedEnvVars": ["DATABASE_URL", "SECRET_KEY"]
  },
  "imageName": "fastapi-app",
  "tag": "latest",
  "appPort": 8000,
  "containerRunning": false,
  "dockerfileContent": "..."
}
```
With `deployNow: true` the response additionally carries `hostPort`, `localUrl` (`http://localhost:<port>`), `containerId`, and a `reachability` object verified against the host.

### `GET /api/images` · `DELETE /api/images/:id`
Image catalog (used by the registry and the deploy console's image picker) and image removal.

### Local containers
| Endpoint | Purpose |
|---|---|
| `POST /api/containers/run` | Start a local container for a built image |
| `GET /api/containers` | List local containers |
| `POST /api/containers/:name/stop` · `/start` | Stop / start |
| `GET /api/containers/:name/logs` | Container logs |
| `DELETE /api/containers/:name` | Remove |

### Amazon ECR
| Endpoint | Purpose |
|---|---|
| `POST /api/ecr/push` | GitHub → Docker → **ECR** pipeline for a built image |
| `GET /api/ecr/config` | ECR config **status only** — variable names `configured`/`missing`, registry and repository names; **no credential values ever returned** |

**`POST /api/ecr/push` payload:** `{ "imageName": "fastapi-app", "deploymentId": "img_1787549554168_sc91s9" }`

**Success response:**
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
Failures return `success: false` with the failing pipeline `step` (`config` | `auth` | `tag` | `push`) and a redacted error — credentials are never echoed back.

**Pipeline steps:**
1. **Config** – validate `AWS_REGION`, `AWS_ACCOUNT_ID`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `ECR_REPOSITORY`.
2. **Auth** – `aws ecr get-login-password` piped into `docker login --password-stdin` (the token is never logged or stored).
3. **Tag** – `docker tag <local-image> <registry>/<repo>:deploy-<deploymentId>`.
4. **Push** – `docker push` the tagged image to ECR.

### EC2 Deployments
See the dedicated section below.

---

## 🚀 EC2 Deployment API

Deploys a pushed ECR image onto a **fresh EC2 instance**: the backend launches the instance with a user-data script that installs Docker, logs into ECR (via the instance role), pulls your image and runs your containers. The deployment only reports **DEPLOYED** after an HTTP health check against the public IP succeeds — and the returned **public IP + application URL** come from the actual running instance.

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
  "imageUri": "123456789012.dkr.ecr.us-east-1.amazonaws.com/apps:deploy-img_1791827183063_2k71r",
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
  "imageUri": "123456789012.dkr.ecr.us-east-1.amazonaws.com/apps:...",
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

- `DOCKER_INSTALLING` / `PULLING_IMAGE` / `STARTING_CONTAINER` are derived by reading `/var/log/clouddeploy-userdata.log` on the instance through **AWS SSM Run Command** (the script writes `step=` markers); a `userdata-failed:*` marker fails the deployment with the failing step.
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

### Environment variables for EC2 deploys (`backend/.env`)

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

> Authentication note: this project has no multi-user auth — the API follows the existing single-user convention (local dev server), and ownership is enforced structurally via the deployment record + AWS tag check before any terminate call.

### What requires manual AWS Console setup
Nothing is required up-front: the VPC/subnet go in `.env`, and the IAM instance profile is auto-created on the first deployment (the deploying principal needs the IAM permissions above). Optional: set `EC2_KEY_NAME` if you want SSH access to instances.

---

## ☁️ Amazon ECR Setup

1. Copy the example env file and fill in your values (never commit `.env` — it is already listed in `.gitignore`):
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Provide an IAM user/role with at least: `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:PutImage` — plus the EC2-deploy permissions listed above if you use the deploy feature.
3. Create the repository in the same region as `AWS_REGION`:
   ```bash
   aws ecr create-repository --repository-name my-app-repo --region us-east-1
   ```
4. Prerequisites: **AWS CLI v2** on `PATH` and **Docker** running locally.
5. In the UI, build an image and click **☁️ Push to ECR** (Build result card or Image Registry) — the final ECR image URI and deployment status are shown on success.

---

## ⚡ Quick Start

### Prerequisites
- Node.js **v18+**
- Docker Desktop (installed and running)
- Git
- AWS account + AWS CLI v2 (for ECR push and EC2 deploys)

### 1. Clone the repository
```bash
git clone https://github.com/Ismail-dcode/CloudDeploy.git
cd CloudDeploy
```

### 2. Configure the backend
```bash
cd backend
cp .env.example .env    # then edit .env with your values
```

| Variable | Required | Description |
|---|---|---|
| `PORT` | optional | Backend port (default `5000`) |
| `AWS_REGION` | ✅ | Region of your ECR repository and deploy VPC (e.g. `us-east-1`) |
| `AWS_ACCOUNT_ID` | ✅ | Your 12-digit AWS account ID |
| `AWS_ACCESS_KEY_ID` | ✅ | IAM user key (ECR push + EC2 deploy permissions) |
| `AWS_SECRET_ACCESS_KEY` | ✅ | IAM secret key — keep private |
| `ECR_REPOSITORY` | ✅ | ECR repository **name** (not the full URI) |
| `EC2_VPC_ID` | ✅* | VPC for deployment instances (*required for EC2 deploys) |
| `EC2_SUBNET_ID` | ✅* | Public subnet that auto-assigns public IPs |
| `EC2_INSTANCE_TYPE` | optional | Default `t3.micro` (free-tier eligible) |
| `EC2_KEY_NAME` | optional | Leave empty — instances are managed without SSH |
| `EC2_AMI_ID` | optional | Leave empty — latest Amazon Linux 2023 resolved via SSM |

### 3. Start the backend
```bash
npm install
npm start          # → http://localhost:5000
```

### 4. Start the frontend
```bash
cd ../frontend
npm install
npm run dev        # → http://localhost:3300  (proxies /api to :5000)
```

### 5. First deployment walkthrough
1. **🛠️ Image Builder Studio** — paste a GitHub repo URL, set the app port, click **BUILD & STORE IMAGE** (build-only by default).
2. **📦 Image Registry** — select the image → **☁️ Push to ECR**.
3. On push success → **🚀 Deploy Your Application** (or open the **🚀 EC2 Deploy** tab).
4. Choose the image, `t3.micro`, container port (e.g. `8000` for FastAPI/uvicorn), host port `80`, optional env vars → **🚀 Deploy Application to EC2**.
5. Watch the lifecycle (typically **3–5 minutes**: boot → status checks → Docker install → ECR pull → containers → health check) → open the returned `http://<public-ip>:<host-port>` URL.
6. Click **🗑 Terminate** when finished — this stops the billing.

---

## 🔐 Security Model

- **No credentials in code or user-data** — AWS keys live only in `backend/.env` (git-ignored) and are read through the SDK's default credential chain; EC2 instances authenticate to ECR/SSM with their **IAM instance role**.
- **No secrets in API responses** — environment values are masked (`••••••`); secret variables return key names only. Secret values live exclusively in **SSM SecureString** and are shredded from the instance after container start.
- **No secrets in logs** — the user-data script writes step markers only (no `set -x`), and backend logs pass through a redaction layer.
- **Least-privilege IAM** — instance role: ECR pull-only + SSM core + scoped `ssm:GetParameter` on `/clouddeploy/*`. The deploying principal's policy is documented above (includes `iam:PassRole` with a service condition).
- **Attack-surface reduction** — security groups open exactly the requested host-port TCP range; **port 22 is never opened**; no ALB/ECS control plane exists to manage.
- **Injection-proof generation** — all user-provided values (image URIs, ports, env names/values) are validated and shell-quoted when the user-data script is generated.
- **Safe termination** — an instance is only terminated if it carries this deployment's `cloud-deploy-deployment=<id>` tag; idempotency tokens prevent duplicate launches.

---

## 💰 AWS Resources & Costs

| Resource | Created | Shared? | Removed by |
|---|---|---|---|
| EC2 instance (one per deployment) | on deploy | no | **Terminate** button / `DELETE /api/deployments/:id` / auto on failure |
| Security group `clouddeploy-ec2-app` | first deploy | yes | kept (per-deployment **rules** are revoked on cleanup) |
| IAM role + instance profile `clouddeploy-ec2-runner` | first deploy | yes | kept (intentionally reused) |
| SSM SecureString `/clouddeploy/<id>/*` | when secrets are used | no | auto-deleted on cleanup/failure |
| ECR repository + image layers | on push | per repo | delete via AWS console/CLI if desired |

> ⚠️ **Every deployment is a billable EC2 instance.** `t3.micro`/`t2.micro` are free-tier eligible, but idle instances still accrue charges once free-tier hours are used. **Always Terminate deployments you no longer need**, and check the EC2 console periodically for stray instances (`cloud-deploy-deployment` tag = launched by this app).

---

## 🧪 Testing & Verification

**Automated checks passing:**
- Backend: `node --check` on all sources, module-load tests, input-validation unit checks (valid + invalid payloads), AMI resolution against live SSM.
- User-data: generated script verified with `bash -n`; confirmed free of `set -x` and secret values; correct port mapping and quoting.
- API: end-to-end smoke test against a running server — health, config, list/detail, 400-validation, and ID-guards (400 on malformed ids, 404 on missing).
- Frontend: `vite build` succeeds; no stale API references.
- AWS (read-only): verified 0 stray instances and 0 leftover security groups after cleanup flows.

**Live end-to-end checklist (Stage 10):**
1. Build an image from a GitHub URL ✅ (existing pipeline)
2. Push it to ECR ✅ (existing pipeline)
3. Deploy from the EC2 console with correct ports — **Container Port = the port your app listens on** (e.g. `8000`), **Host Port = 80**
4. Confirm `DEPLOYED` only after the health check, open `http://<public-ip>:80`
5. Verify **Terminate** removes the instance (and check the EC2 console shows it terminated)

**Troubleshooting:**
- Changed backend code? **Restart `npm start`** — routes are loaded at boot.
- UI can't reach the API? Confirm the backend runs on port **5000** (Vite proxy target) and the dev server on **3300**.
- Deployment stuck/failed? Open **▸ show logs** on the deployment card — each stage and the failing step are recorded there.

---

## 📄 License
MIT License
