const fs = require('fs-extra');
const path = require('path');

/**
 * Deeply scans a Python repository to detect framework, entry point, WSGI/ASGI app object,
 * dependency manager, environment variables, default internal port, and app category.
 * 
 * @param {string} repoPath - Absolute path to cloned repository
 * @returns {Promise<object>} Detailed Python project analysis metadata
 */
async function detectPythonProject(repoPath) {
  if (!repoPath || !(await fs.pathExists(repoPath))) {
    throw new Error(`Repository path does not exist: ${repoPath}`);
  }

  const files = await fs.readdir(repoPath);
  
  // 1. Dependency Manager Detection
  let dependencyManager = 'pip';
  let dependencyFile = 'none';

  if (files.includes('requirements.txt')) {
    dependencyManager = 'pip';
    dependencyFile = 'requirements.txt';
  } else if (files.includes('pyproject.toml')) {
    dependencyManager = 'poetry';
    dependencyFile = 'pyproject.toml';
  } else if (files.includes('Pipfile')) {
    dependencyManager = 'pipenv';
    dependencyFile = 'Pipfile';
  } else if (files.includes('setup.py')) {
    dependencyManager = 'pip';
    dependencyFile = 'setup.py';
  }

  // Read dependency text content for framework scanning
  let dependencyContent = '';
  if (dependencyFile === 'requirements.txt') {
    try {
      dependencyContent = await fs.readFile(path.join(repoPath, 'requirements.txt'), 'utf8');
    } catch (e) {}
  } else if (dependencyFile === 'pyproject.toml') {
    try {
      dependencyContent = await fs.readFile(path.join(repoPath, 'pyproject.toml'), 'utf8');
    } catch (e) {}
  } else if (dependencyFile === 'Pipfile') {
    try {
      dependencyContent = await fs.readFile(path.join(repoPath, 'Pipfile'), 'utf8');
    } catch (e) {}
  }

  const depLower = dependencyContent.toLowerCase();

  // 2. Python Version Detection
  let pythonVersion = '3.12';
  if (files.includes('.python-version')) {
    try {
      const verStr = (await fs.readFile(path.join(repoPath, '.python-version'), 'utf8')).trim();
      if (verStr) pythonVersion = verStr;
    } catch (e) {}
  } else if (files.includes('runtime.txt')) {
    try {
      const verStr = (await fs.readFile(path.join(repoPath, 'runtime.txt'), 'utf8')).trim();
      const match = verStr.match(/python-([0-9.]+)/i);
      if (match) pythonVersion = match[1];
    } catch (e) {}
  }

  // 3. Entry Point & Source File Scanning
  let entryPoint = '';
  let appObject = 'app';
  let framework = 'generic';
  let category = 'web'; // 'web' | 'cli' | 'worker' | 'background'
  let defaultPort = 5000;
  let serverType = 'gunicorn'; // 'gunicorn' | 'uvicorn' | 'streamlit' | 'gradio' | 'builtin' | 'none'

  const hasManagePy = files.includes('manage.py');
  const hasAppPy = files.includes('app.py');
  const hasMainPy = files.includes('main.py');
  const hasServerPy = files.includes('server.py');
  const hasWsgiPy = files.includes('wsgi.py');
  const hasAsgiPy = files.includes('asgi.py');

  // Check src/ directory layout if top-level python files aren't found
  let srcFiles = [];
  const srcPath = path.join(repoPath, 'src');
  if (await fs.pathExists(srcPath) && (await fs.stat(srcPath)).isDirectory()) {
    try {
      srcFiles = await fs.readdir(srcPath);
    } catch (e) {}
  }

  // Framework Detection Priority
  if (hasManagePy || depLower.includes('django')) {
    framework = 'django';
    entryPoint = hasManagePy ? 'manage.py' : (srcFiles.includes('manage.py') ? 'src/manage.py' : 'manage.py');
    appObject = 'application';
    defaultPort = 8000;
    serverType = 'gunicorn';
    category = 'web';
  } else if (depLower.includes('fastapi') || depLower.includes('starlette')) {
    framework = 'fastapi';
    serverType = 'uvicorn';
    defaultPort = 8000;
    category = 'web';
    if (hasMainPy) entryPoint = 'main.py';
    else if (hasAppPy) entryPoint = 'app.py';
    else if (hasAsgiPy) entryPoint = 'asgi.py';
    else if (hasServerPy) entryPoint = 'server.py';
    else if (srcFiles.includes('main.py')) entryPoint = 'src/main.py';
    else if (srcFiles.includes('app.py')) entryPoint = 'src/app.py';
    else entryPoint = 'main.py';
  } else if (depLower.includes('streamlit')) {
    framework = 'streamlit';
    serverType = 'streamlit';
    defaultPort = 8501;
    category = 'web';
    if (hasAppPy) entryPoint = 'app.py';
    else if (hasMainPy) entryPoint = 'main.py';
    else entryPoint = 'app.py';
  } else if (depLower.includes('gradio')) {
    framework = 'gradio';
    serverType = 'gradio';
    defaultPort = 7860;
    category = 'web';
    if (hasAppPy) entryPoint = 'app.py';
    else if (hasMainPy) entryPoint = 'main.py';
    else entryPoint = 'app.py';
  } else if (depLower.includes('flask')) {
    framework = 'flask';
    serverType = 'gunicorn';
    defaultPort = 5000;
    category = 'web';
    if (hasAppPy) entryPoint = 'app.py';
    else if (hasMainPy) entryPoint = 'main.py';
    else if (hasWsgiPy) entryPoint = 'wsgi.py';
    else if (hasServerPy) entryPoint = 'server.py';
    else if (srcFiles.includes('app.py')) entryPoint = 'src/app.py';
    else entryPoint = 'app.py';
  } else if (depLower.includes('sanic')) {
    framework = 'sanic';
    serverType = 'sanic';
    defaultPort = 8000;
    category = 'web';
    entryPoint = hasAppPy ? 'app.py' : (hasMainPy ? 'main.py' : 'server.py');
  } else if (depLower.includes('tornado')) {
    framework = 'tornado';
    serverType = 'tornado';
    defaultPort = 8888;
    category = 'web';
    entryPoint = hasAppPy ? 'app.py' : (hasMainPy ? 'main.py' : 'server.py');
  } else if (depLower.includes('aiohttp')) {
    framework = 'aiohttp';
    serverType = 'aiohttp';
    defaultPort = 8080;
    category = 'web';
    entryPoint = hasAppPy ? 'app.py' : (hasMainPy ? 'main.py' : 'server.py');
  } else if (depLower.includes('bottle')) {
    framework = 'bottle';
    serverType = 'gunicorn';
    defaultPort = 8080;
    category = 'web';
    entryPoint = hasAppPy ? 'app.py' : 'main.py';
  } else if (depLower.includes('celery')) {
    framework = 'celery';
    serverType = 'none';
    defaultPort = null;
    category = 'worker';
    entryPoint = hasAppPy ? 'app.py' : (hasMainPy ? 'main.py' : 'tasks.py');
  } else {
    // General Python app scanning
    if (hasManagePy) {
      framework = 'django';
      entryPoint = 'manage.py';
      defaultPort = 8000;
      serverType = 'gunicorn';
    } else if (hasAppPy) {
      entryPoint = 'app.py';
    } else if (hasMainPy) {
      entryPoint = 'main.py';
    } else if (hasServerPy) {
      entryPoint = 'server.py';
    } else {
      const pyFiles = files.filter(f => f.endsWith('.py'));
      entryPoint = pyFiles.length > 0 ? pyFiles[0] : 'app.py';
    }
  }

  // Deep Scan Entry Point file for app object & imports if exists
  if (entryPoint) {
    const fullEntryPointPath = path.join(repoPath, entryPoint);
    if (await fs.pathExists(fullEntryPointPath)) {
      try {
        const code = await fs.readFile(fullEntryPointPath, 'utf8');
        
        // Scan for FastAPI / Flask / Starlette / WSGI app objects
        if (code.includes('FastAPI(')) {
          framework = 'fastapi';
          serverType = 'uvicorn';
          defaultPort = 8000;
          category = 'web';
        } else if (code.includes('Flask(')) {
          framework = 'flask';
          serverType = 'gunicorn';
          defaultPort = 5000;
          category = 'web';
        } else if (code.includes('import streamlit') || code.includes('st.')) {
          framework = 'streamlit';
          serverType = 'streamlit';
          defaultPort = 8501;
          category = 'web';
        } else if (code.includes('import gradio') || code.includes('gr.Interface(') || code.includes('gr.Blocks(')) {
          framework = 'gradio';
          serverType = 'gradio';
          defaultPort = 7860;
          category = 'web';
        }

        // Match app variable name (e.g. app = FastAPI(), application = get_wsgi_application())
        const appVarMatch = code.match(/([a-zA-Z0-9_]+)\s*=\s*(FastAPI|Flask|Django|Sanic|Bottle|Tornado|aiohttp)/i);
        if (appVarMatch) {
          appObject = appVarMatch[1];
        } else if (code.includes('application =')) {
          appObject = 'application';
        }
      } catch (e) {}
    }
  }

  // 4. Environment Variables Scanning (.env.example, .env.template, os.getenv)
  const detectedEnvVars = new Set();
  
  const envExampleFiles = ['.env.example', '.env.template', '.env.sample', 'env.example'];
  for (const envFile of envExampleFiles) {
    const envPath = path.join(repoPath, envFile);
    if (await fs.pathExists(envPath)) {
      try {
        const lines = (await fs.readFile(envPath, 'utf8')).split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const key = trimmed.split('=')[0].trim();
            if (key) detectedEnvVars.add(key);
          }
        }
      } catch (e) {}
    }
  }

  // Scan source code for os.getenv & os.environ references
  try {
    const scanFileForEnv = async (filePath) => {
      const content = await fs.readFile(filePath, 'utf8');
      const getenvRegex = /os\.(?:getenv|environ\.get)\s*\(\s*["']([A-Za-z0-9_]+)["']/g;
      let match;
      while ((match = getenvRegex.exec(content)) !== null) {
        if (match[1]) detectedEnvVars.add(match[1]);
      }
    };

    if (entryPoint && (await fs.pathExists(path.join(repoPath, entryPoint)))) {
      await scanFileForEnv(path.join(repoPath, entryPoint));
    }
  } catch (e) {}

  return {
    framework,
    category,
    pythonVersion,
    dependencyManager,
    dependencyFile,
    entryPoint,
    appObject,
    defaultPort,
    serverType,
    detectedEnvVars: Array.from(detectedEnvVars)
  };
}

module.exports = {
  detectPythonProject
};
