const fs = require('fs-extra');
const path = require('path');

/**
 * Inspects repository files and detects the project type based on priority:
 * 1. Dockerfile -> "existing-dockerfile"
 * 2. package.json -> "node"
 * 3. go.mod -> "go"
 * 4. requirements.txt / pyproject.toml / Pipfile / setup.py / *.py -> "python"
 * 5. index.html / *.html -> "static"
 * 6. unsupported
 * 
 * @param {string} repoPath Absolute path to cloned repository
 * @returns {Promise<{ type: string, confidence: string, details: object }>}
 */
async function detectProjectType(repoPath) {
  if (!repoPath || !(await fs.pathExists(repoPath))) {
    throw new Error(`Repository path does not exist: ${repoPath}`);
  }

  const files = await fs.readdir(repoPath);

  // 1. Existing Dockerfile check (case-insensitive search for Dockerfile)
  const hasDockerfile = files.some(f => f.toLowerCase() === 'dockerfile');
  if (hasDockerfile) {
    return {
      type: 'existing-dockerfile',
      confidence: 'high',
      details: {
        message: 'Existing Dockerfile detected in repository root.'
      }
    };
  }

  // 2. Node.js / Frontend SPA check (package.json)
  const hasPackageJson = files.includes('package.json');
  if (hasPackageJson) {
    let packageManager = 'npm';
    if (files.includes('yarn.lock')) {
      packageManager = 'yarn';
    } else if (files.includes('pnpm-lock.yaml')) {
      packageManager = 'pnpm';
    } else if (files.includes('package-lock.json')) {
      packageManager = 'npm';
    }

    // Inspect package.json to identify React+Vite, CRA, Vue, Svelte SPAs vs Node backend servers
    let isFrontendSpa = false;
    let frameworkName = 'node';
    const pkgPath = path.join(repoPath, 'package.json');

    try {
      if (await fs.pathExists(pkgPath)) {
        const pkg = await fs.readJson(pkgPath);
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        const scripts = pkg.scripts || {};

        const hasVite = Boolean(allDeps.vite || (scripts.build && scripts.build.includes('vite')) || (scripts.dev && scripts.dev.includes('vite')));
        const hasCra = Boolean(allDeps['react-scripts']);
        const hasVue = Boolean(allDeps['@vue/cli-service'] || allDeps.vue);
        const hasAstro = Boolean(allDeps.astro);
        const hasSvelte = Boolean(allDeps['@sveltejs/kit'] || allDeps.svelte);

        const hasBackendFramework = Boolean(
          allDeps.express || allDeps.fastify || allDeps.koa || allDeps['@nestjs/core'] || allDeps.hono || allDeps.restify
        );

        if ((hasVite || hasCra || hasVue || hasAstro || hasSvelte) && !hasBackendFramework) {
          isFrontendSpa = true;
          if (hasVite) frameworkName = 'vite';
          else if (hasCra) frameworkName = 'create-react-app';
          else if (hasVue) frameworkName = 'vue';
          else if (hasSvelte) frameworkName = 'svelte';
          else if (hasAstro) frameworkName = 'astro';
        }
      }
    } catch (err) {
      // Ignore JSON parse errors and fallback to standard node detection
    }

    if (isFrontendSpa) {
      return {
        type: 'static',
        confidence: 'high',
        details: {
          packageManager,
          isFrontendSpa: true,
          framework: frameworkName,
          serverType: 'nginx',
          entryFile: 'static SPA build'
        }
      };
    }

    return {
      type: 'node',
      confidence: 'high',
      details: {
        packageManager,
        hasLockFile: files.includes('package-lock.json') || files.includes('yarn.lock') || files.includes('pnpm-lock.yaml')
      }
    };
  }

  // 3. Go check (go.mod)
  const hasGoMod = files.includes('go.mod');
  if (hasGoMod) {
    return {
      type: 'go',
      confidence: 'high',
      details: {
        hasGoSum: files.includes('go.sum')
      }
    };
  }

  // 4. Python check (requirements.txt, pyproject.toml, Pipfile, setup.py, or any .py file)
  const hasRequirementsTxt = files.includes('requirements.txt');
  const hasPyprojectToml = files.includes('pyproject.toml');
  const hasPipfile = files.includes('Pipfile');
  const hasSetupPy = files.includes('setup.py');
  const hasPythonFiles = files.some(f => f.endsWith('.py'));

  if (hasRequirementsTxt) {
    return {
      type: 'python',
      confidence: 'high',
      details: {
        dependencyFile: 'requirements.txt'
      }
    };
  }

  if (hasPyprojectToml || hasPipfile || hasSetupPy || hasPythonFiles) {
    return {
      type: 'python',
      confidence: (hasPyprojectToml || hasPipfile) ? 'high' : 'medium',
      details: {
        dependencyFile: hasPyprojectToml ? 'pyproject.toml' : (hasPipfile ? 'Pipfile' : 'none'),
        hasSetupPy,
        hasPythonFiles
      }
    };
  }

  // 5. Static HTML/CSS/JS website check (index.html, *.html)
  const hasIndexHtml = files.some(f => f.toLowerCase() === 'index.html' || f.toLowerCase() === 'index.htm');
  const hasHtmlFiles = files.some(f => f.endsWith('.html') || f.endsWith('.htm'));

  if (hasIndexHtml || hasHtmlFiles) {
    return {
      type: 'static',
      confidence: 'high',
      details: {
        serverType: 'nginx',
        entryFile: hasIndexHtml ? 'index.html' : 'static HTML'
      }
    };
  }

  // 6. Unsupported
  return {
    type: 'unsupported',
    confidence: 'none',
    details: {
      message: 'This project type is not supported in Phase 1.'
    }
  };
}

module.exports = {
  detectProjectType
};
