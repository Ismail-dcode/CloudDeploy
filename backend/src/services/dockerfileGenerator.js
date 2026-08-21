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

      // Read package.json details
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

      const isViteApp = Boolean(
        details.isFrontendSpa ||
        (pkgScripts.dev && pkgScripts.dev.includes('vite')) ||
        (pkgScripts.start && pkgScripts.start.includes('vite')) ||
        (command && command.includes('vite'))
      );

      // Determine smart runtime CMD for Node / Vite application
      let nodeCmd = command;

      if (!nodeCmd) {
        if (pkgScripts.start) {
          const startIsVite = pkgScripts.start.includes('vite');
          if (startIsVite) {
            nodeCmd = pm === 'yarn' ? `yarn start --host 0.0.0.0 --port ${port}` : (pm === 'pnpm' ? `pnpm start -- --host 0.0.0.0 --port ${port}` : `npm start -- --host 0.0.0.0 --port ${port}`);
          } else {
            nodeCmd = pm === 'yarn' ? 'yarn start' : (pm === 'pnpm' ? 'pnpm start' : 'npm start');
          }
        } else if (pkgScripts.dev) {
          const devIsVite = pkgScripts.dev.includes('vite') || isViteApp;
          if (devIsVite) {
            nodeCmd = pm === 'yarn' ? `yarn dev --host 0.0.0.0 --port ${port}` : (pm === 'pnpm' ? `pnpm run dev -- --host 0.0.0.0 --port ${port}` : `npm run dev -- --host 0.0.0.0 --port ${port}`);
          } else {
            nodeCmd = pm === 'yarn' ? 'yarn dev' : (pm === 'pnpm' ? 'pnpm dev' : 'npm run dev');
          }
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
      } else if (isViteApp && !nodeCmd.includes('--host')) {
        // If user entered command like "npm run dev", ensure host 0.0.0.0 and port are passed to Vite for Docker container accessibility
        if (nodeCmd === 'npm run dev' || nodeCmd === 'npm dev') {
          nodeCmd = `npm run dev -- --host 0.0.0.0 --port ${port}`;
        } else if (nodeCmd.includes('npm run') || nodeCmd.includes('npm start')) {
          nodeCmd = `${nodeCmd} -- --host 0.0.0.0 --port ${port}`;
        } else if (nodeCmd.includes('yarn')) {
          nodeCmd = `${nodeCmd} --host 0.0.0.0 --port ${port}`;
        } else if (nodeCmd.includes('pnpm')) {
          nodeCmd = `${nodeCmd} -- --host 0.0.0.0 --port ${port}`;
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
      const pyVer = details.pythonVersion || '3.12';
      const framework = details.framework || 'generic';
      const entryPoint = details.entryPoint || 'app.py';
      const appObject = details.appObject || 'app';
      const depManager = details.dependencyManager || 'pip';
      const category = details.category || 'web';

      const entryModule = entryPoint.replace(/\.py$/, '').replace(/\//g, '.');

      // 1. Dependency Installation Steps
      let installStep = '';
      if (depManager === 'poetry') {
        installStep = `COPY pyproject.toml poetry.lock* ./
RUN pip install --no-cache-dir poetry && poetry config virtualenvs.create false && poetry install --no-interaction --no-ansi --no-root`;
      } else if (depManager === 'pipenv') {
        installStep = `COPY Pipfile Pipfile.lock* ./
RUN pip install --no-cache-dir pipenv && pipenv install --system --deploy`;
      } else if (await fs.pathExists(path.join(repoPath, 'requirements.txt'))) {
        installStep = `COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt`;
      } else if (await fs.pathExists(path.join(repoPath, 'setup.py'))) {
        installStep = `COPY setup.py .
RUN pip install --no-cache-dir .`;
      }

      // 2. Framework-Specific Runtime Commands & Environment
      let pyCmd = command;
      let extraEnv = '';
      let preRunStep = '';

      if (!pyCmd) {
        if (framework === 'django') {
          // Find Django WSGI module
          let djangoWsgi = 'project.wsgi';
          try {
            const files = await fs.readdir(repoPath);
            for (const f of files) {
              if (await fs.pathExists(path.join(repoPath, f, 'wsgi.py'))) {
                djangoWsgi = `${f}.wsgi`;
                break;
              }
            }
          } catch (e) {}
          preRunStep = 'RUN python manage.py collectstatic --noinput || true\n';
          pyCmd = `gunicorn --bind 0.0.0.0:${port} ${djangoWsgi}:application`;
        } else if (framework === 'fastapi') {
          pyCmd = `uvicorn ${entryModule}:${appObject} --host 0.0.0.0 --port ${port}`;
        } else if (framework === 'streamlit') {
          pyCmd = `streamlit run ${entryPoint} --server.address 0.0.0.0 --server.port ${port}`;
        } else if (framework === 'gradio') {
          extraEnv = `ENV GRADIO_SERVER_NAME=0.0.0.0\nENV GRADIO_SERVER_PORT=${port}\n`;
          pyCmd = `python ${entryPoint}`;
        } else if (framework === 'flask') {
          pyCmd = `gunicorn --bind 0.0.0.0:${port} ${entryModule}:${appObject}`;
        } else if (framework === 'celery') {
          pyCmd = `celery -A ${entryModule} worker --loglevel=info`;
        } else {
          pyCmd = `python ${entryPoint}`;
        }
      }

      const pyCmdDirective = formatDockerCmd(pyCmd);
      const exposeDirective = category === 'web' ? `EXPOSE ${port}\n` : '';

      dockerfileContent = `FROM python:${pyVer}

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV HOST=0.0.0.0
ENV PORT=${port}
${extraEnv}
${installStep}

COPY . .

${preRunStep}${exposeDirective}
${pyCmdDirective}
`;
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
