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

  let dockerfileContent = '';

  switch (projectType) {
    case 'static': {
      const hasPkg = await fs.pathExists(path.join(repoPath, 'package.json'));
      if (hasPkg) {
        // Multi-stage build for Node frontend SPA (Vite, React, Vue, Svelte, etc.)
        const pm = details.packageManager || 'npm';
        let installCmd = 'RUN npm install';
        let copyLockCmd = 'COPY package*.json ./';
        let buildCmd = 'RUN npm run build';

        if (pm === 'yarn') {
          copyLockCmd = 'COPY package.json yarn.lock* ./';
          installCmd = 'RUN yarn install';
          buildCmd = 'RUN yarn build';
        } else if (pm === 'pnpm') {
          copyLockCmd = 'COPY package.json pnpm-lock.yaml* ./';
          installCmd = 'RUN corepack enable && pnpm install';
          buildCmd = 'RUN pnpm run build';
        }

        dockerfileContent = `FROM node:22 AS builder

WORKDIR /app

${copyLockCmd}

${installCmd}

COPY . .

${buildCmd}

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
`;
      } else {
        // Pure static HTML/CSS/JS website
        dockerfileContent = `FROM nginx:alpine

WORKDIR /usr/share/nginx/html

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

      // Determine smart runtime CMD for Node application
      let nodeCmd = command;
      if (!nodeCmd) {
        const pkgPath = path.join(repoPath, 'package.json');
        let pkgScripts = {};
        let pkgMain = '';
        try {
          if (await fs.pathExists(pkgPath)) {
            const pkg = await fs.readJson(pkgPath);
            pkgScripts = pkg.scripts || {};
            pkgMain = pkg.main || '';
          }
        } catch (err) {}

        if (pkgScripts.start) {
          nodeCmd = pm === 'yarn' ? 'yarn start' : (pm === 'pnpm' ? 'pnpm start' : 'npm start');
        } else if (pkgScripts.dev) {
          nodeCmd = pm === 'yarn' ? 'yarn dev' : (pm === 'pnpm' ? 'pnpm dev' : 'npm run dev');
        } else if (pkgMain && await fs.pathExists(path.join(repoPath, pkgMain))) {
          nodeCmd = `node ${pkgMain}`;
        } else if (await fs.pathExists(path.join(repoPath, 'index.js'))) {
          nodeCmd = 'node index.js';
        } else if (await fs.pathExists(path.join(repoPath, 'server.js'))) {
          nodeCmd = 'node server.js';
        } else if (await fs.pathExists(path.join(repoPath, 'app.js'))) {
          nodeCmd = 'node app.js';
        } else {
          nodeCmd = 'npm start';
        }
      }

      const nodeCmdDirective = formatDockerCmd(nodeCmd);

      dockerfileContent = `FROM node:22

WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=${port}

${copyLockCmd}

${installCmd}

COPY . .

EXPOSE ${port}

${nodeCmdDirective}
`;
      break;
    }

    case 'python': {
      const hasRequirements = await fs.pathExists(path.join(repoPath, 'requirements.txt'));
      const hasPyproject = await fs.pathExists(path.join(repoPath, 'pyproject.toml'));
      const hasSetupPy = await fs.pathExists(path.join(repoPath, 'setup.py'));

      // Determine smart runtime CMD for Python application
      let pyCmd = command;
      if (!pyCmd) {
        if (await fs.pathExists(path.join(repoPath, 'app.py'))) {
          pyCmd = 'python app.py';
        } else if (await fs.pathExists(path.join(repoPath, 'main.py'))) {
          pyCmd = 'python main.py';
        } else if (await fs.pathExists(path.join(repoPath, 'server.py'))) {
          pyCmd = 'python server.py';
        } else {
          pyCmd = 'python app.py';
        }
      }

      const pyCmdDirective = formatDockerCmd(pyCmd);

      if (hasRequirements) {
        dockerfileContent = `FROM python:3.12

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE ${port}

${pyCmdDirective}
`;
      } else if (hasPyproject || hasSetupPy) {
        dockerfileContent = `FROM python:3.12

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir .

EXPOSE ${port}

${pyCmdDirective}
`;
      } else {
        // Standard Python application without external dependency file (e.g. server.py, app.py)
        dockerfileContent = `FROM python:3.12

WORKDIR /app

COPY . .

EXPOSE ${port}

${pyCmdDirective}
`;
      }
      break;
    }

    case 'go': {
      let goCmd = command ? formatDockerCmd(command) : 'CMD ["./app"]';

      dockerfileContent = `FROM golang:1.24 AS builder

WORKDIR /app

COPY go.mod ./
COPY go.sum* ./
RUN go mod download

COPY . .

RUN go build -o app .

FROM debian:bookworm-slim

WORKDIR /app

COPY --from=builder /app/app .

EXPOSE ${port}

${goCmd}
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
