const fs = require('fs-extra');
const path = require('path');
const { formatDockerCmd } = require('../utils/commandParser');

/**
 * Generates an appropriate Dockerfile for the project type and writes it to the repository directory.
 * Also creates a .dockerignore file to ensure node_modules are built cleanly inside the container.
 * 
 * @param {object} options
 * @param {string} options.projectType - "node" | "python" | "go" | "static" | "existing-dockerfile"
 * @param {string} options.command - User run command (e.g., "npm run dev")
 * @param {number} options.port - Application port (e.g., 3000 or 80)
 * @param {string} options.repoPath - Path to cloned repository
 * @param {object} [options.details] - Project detection details
 * @returns {Promise<{ generated: boolean, dockerfileContent: string }>}
 */
async function generateDockerfile({ projectType, command, port, repoPath, details = {} }) {
  // Ensure .dockerignore exists to ignore host node_modules, .git, etc.
  const dockerignorePath = path.join(repoPath, '.dockerignore');
  if (!(await fs.pathExists(dockerignorePath))) {
    await fs.writeFile(dockerignorePath, "node_modules\n.git\n.env\n", "utf8");
  }

  if (projectType === 'existing-dockerfile') {
    const existingPath = path.join(repoPath, 'Dockerfile');
    let content = '';
    if (await fs.pathExists(existingPath)) {
      content = await fs.readFile(existingPath, 'utf8');
    }
    return {
      generated: false,
      dockerfileContent: content,
      message: 'Existing Dockerfile detected.'
    };
  }

  const cmdDirective = command ? formatDockerCmd(command) : 'CMD ["nginx", "-g", "daemon off;"]';
  let dockerfileContent = '';

  switch (projectType) {
    case 'static': {
      const hasPackageJson = await fs.pathExists(path.join(repoPath, 'package.json'));

      // Always write a clean nginx.conf with SPA fallback into the repository
      const nginxConfPath = path.join(repoPath, 'nginx.conf');
      const nginxConfContent = `server {
    listen 80;
    server_name localhost;

    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
`;
      await fs.writeFile(nginxConfPath, nginxConfContent, 'utf8');

      if (hasPackageJson) {
        // Multi-stage Nginx build for static sites with Node.js build tools (React, Vite, Vue, Tailwind, Next export, etc.)
        dockerfileContent = `FROM node:22 AS builder

WORKDIR /app

ENV HOST=0.0.0.0

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build || true

RUN mkdir -p /app/static_output && \\
    if [ -d "dist" ]; then cp -r dist/* /app/static_output/ ; \\
    elif [ -d "build" ]; then cp -r build/* /app/static_output/ ; \\
    elif [ -d "out" ]; then cp -r out/* /app/static_output/ ; \\
    elif [ -d "public" ] && [ -f "public/index.html" ]; then cp -r public/* /app/static_output/ ; \\
    else cp -r ./* /app/static_output/ ; fi

FROM nginx:alpine

WORKDIR /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/static_output /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
`;
      } else {
        // Standard static HTML/CSS/JS site
        dockerfileContent = `FROM nginx:alpine

WORKDIR /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY . /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
`;
      }
      break;
    }

    case 'node': {
      const pm = details.packageManager || 'npm';
      let installCmd = 'RUN npm install';
      let copyLockCmd = 'COPY package*.json ./';

      if (pm === 'yarn') {
        copyLockCmd = 'COPY package.json yarn.lock* ./';
        installCmd = 'RUN yarn install';
      } else if (pm === 'pnpm') {
        copyLockCmd = 'COPY package.json pnpm-lock.yaml* ./';
        installCmd = 'RUN corepack enable && pnpm install';
      }

      // Check if package.json has a build script
      let hasBuildScript = false;
      const pkgPath = path.join(repoPath, 'package.json');
      if (await fs.pathExists(pkgPath)) {
        try {
          const pkg = await fs.readJson(pkgPath);
          if (pkg && pkg.scripts && pkg.scripts.build) {
            hasBuildScript = true;
          }
        } catch (e) {
          // ignore parse errors
        }
      }

      const buildStep = hasBuildScript ? `RUN ${pm} run build || true\n\n` : '';

      dockerfileContent = `FROM node:22

WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=${port}

${copyLockCmd}

${installCmd}

COPY . .

${buildStep}EXPOSE ${port}

${cmdDirective}
`;
      break;
    }

    case 'python': {
      const hasRequirements = await fs.pathExists(path.join(repoPath, 'requirements.txt'));
      const hasPyproject = await fs.pathExists(path.join(repoPath, 'pyproject.toml'));
      const hasSetupPy = await fs.pathExists(path.join(repoPath, 'setup.py'));

      if (hasRequirements) {
        dockerfileContent = `FROM python:3.12

WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=${port}
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE ${port}

${cmdDirective}
`;
      } else if (hasPyproject || hasSetupPy) {
        dockerfileContent = `FROM python:3.12

WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=${port}
ENV PYTHONUNBUFFERED=1

COPY . .

RUN pip install --no-cache-dir .

EXPOSE ${port}

${cmdDirective}
`;
      } else {
        // Standard Python application without external dependency file (e.g. server.py, app.py)
        dockerfileContent = `FROM python:3.12

WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=${port}
ENV PYTHONUNBUFFERED=1

COPY . .

EXPOSE ${port}

${cmdDirective}
`;
      }
      break;
    }

    case 'go': {
      dockerfileContent = `FROM golang:1.24 AS builder

WORKDIR /app

COPY go.mod ./
COPY go.sum* ./
RUN go mod download || true

COPY . .

RUN CGO_ENABLED=0 go build -o app .

FROM alpine:latest

WORKDIR /app

COPY --from=builder /app/app .

EXPOSE ${port}

${cmdDirective}
`;
      break;
    }

    default:
      throw new Error(`Cannot generate Dockerfile for unsupported project type: ${projectType}`);
  }

  // Write Dockerfile to repo root
  const targetDockerfile = path.join(repoPath, 'Dockerfile');
  await fs.writeFile(targetDockerfile, dockerfileContent, 'utf8');

  return {
    generated: true,
    dockerfileContent,
    message: `Generated Dockerfile for ${projectType} application.`
  };
}

module.exports = {
  generateDockerfile
};
