import React, { useState, useEffect } from 'react';

export default function BuildForm({ onSubmit, isLoading }) {
  const [buildMode, setBuildMode] = useState('auto'); // 'auto' | 'static' | 'existing'

  const [formData, setFormData] = useState({
    repoUrl: '',
    command: '',
    appPort: '3000',
    hostPort: '8080',
    imageName: ''
  });

  const [errors, setErrors] = useState({});
  const [portStatus, setPortStatus] = useState(null); // { checking: boolean, available: boolean, message: string }

  // Check host port availability on change
  useEffect(() => {
    const portNum = parseInt(formData.hostPort, 10);
    if (!formData.hostPort || isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setPortStatus(null);
      return;
    }

    setPortStatus({ checking: true });

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-port/${portNum}`);
        const data = await res.json();
        setPortStatus({
          checking: false,
          available: data.available,
          message: data.message
        });
      } catch (err) {
        setPortStatus(null);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [formData.hostPort]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};
    
    // GitHub Repo URL validation
    const repoTrimmed = formData.repoUrl.trim();
    const githubRegex = /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?\/?$/;
    if (!repoTrimmed) {
      newErrors.repoUrl = 'GitHub Repository URL is required.';
    } else if (!githubRegex.test(repoTrimmed)) {
      newErrors.repoUrl = 'Please enter a valid GitHub repository URL (e.g. https://github.com/user/my-app)';
    }

    // Run Command (Optional in 'auto' mode)

    // App Port validation (Only in 'auto' and 'existing' modes)
    if (buildMode !== 'static') {
      const apNum = Number(formData.appPort);
      if (!formData.appPort || isNaN(apNum) || !Number.isInteger(apNum) || apNum < 1 || apNum > 65535) {
        newErrors.appPort = 'Enter a valid application port number between 1 and 65535.';
      }
    }

    // Host Port validation
    const hpNum = Number(formData.hostPort);
    if (!formData.hostPort || isNaN(hpNum) || !Number.isInteger(hpNum) || hpNum < 1 || hpNum > 65535) {
      newErrors.hostPort = 'Enter a valid host port number between 1 and 65535.';
    }

    // Image Name validation
    const imgTrimmed = formData.imageName.trim();
    const dockerImageRegex = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/;
    if (!imgTrimmed) {
      newErrors.imageName = 'Image name is required.';
    } else if (!dockerImageRegex.test(imgTrimmed.toLowerCase())) {
      newErrors.imageName = 'Image name must be alphanumeric with hyphens/dots (e.g. my-node-app).';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      const targetAppPort = buildMode === 'static' ? 80 : Number(formData.appPort);
      onSubmit({
        repoUrl: formData.repoUrl.trim(),
        command: buildMode === 'auto' ? formData.command.trim() : '',
        port: targetAppPort,
        appPort: targetAppPort,
        hostPort: Number(formData.hostPort),
        imageName: formData.imageName.trim().toLowerCase(),
        buildMode,
        isStaticMode: buildMode === 'static',
        useExistingDockerfile: buildMode === 'existing'
      });
    }
  };

  return (
    <div className="glass-card">
      {/* Mode Selector Toggle */}
      <div className="mode-selector">
        <button
          type="button"
          className={`mode-tab ${buildMode === 'auto' ? 'mode-tab-active' : ''}`}
          onClick={() => {
            setBuildMode('auto');
            setErrors({});
            setFormData(prev => ({ ...prev, appPort: prev.appPort === '80' ? '3000' : prev.appPort }));
          }}
        >
          ⚡ Auto Backend / App
        </button>
        <button
          type="button"
          className={`mode-tab ${buildMode === 'static' ? 'mode-tab-active' : ''}`}
          onClick={() => {
            setBuildMode('static');
            setErrors({});
            setFormData(prev => ({ ...prev, appPort: '80' }));
          }}
        >
          🌐 Static Website (Nginx)
        </button>
        <button
          type="button"
          className={`mode-tab ${buildMode === 'existing' ? 'mode-tab-active' : ''}`}
          onClick={() => {
            setBuildMode('existing');
            setErrors({});
            setFormData(prev => ({ ...prev, appPort: prev.appPort === '80' ? '3000' : prev.appPort }));
          }}
        >
          🐳 Existing Dockerfile
        </button>
      </div>

      <form onSubmit={handleSubmit} className="build-form" noValidate style={{ marginTop: '1.25rem' }}>
        {/* Field 1: GitHub Repository */}
        <div className="form-group">
          <label htmlFor="repoUrl" className="form-label">
            GitHub Repository
            <span className="label-hint">Public repository URL</span>
          </label>
          <input
            id="repoUrl"
            name="repoUrl"
            type="url"
            className={`form-input ${errors.repoUrl ? 'input-error' : ''}`}
            placeholder="https://github.com/user/my-static-site"
            value={formData.repoUrl}
            onChange={handleChange}
            disabled={isLoading}
            autoComplete="off"
          />
          {errors.repoUrl && <span className="error-hint">{errors.repoUrl}</span>}
        </div>

        {/* Field 2: Run Command (Optional in Auto Backend mode, hidden in Static/Existing modes) */}
        {buildMode === 'auto' && (
          <div className="form-group">
            <label htmlFor="command" className="form-label">
              Run Command
              <span className="label-hint">Optional (auto-detected e.g. "npm start", "node server.js", "python app.py" if left blank)</span>
            </label>
            <input
              id="command"
              name="command"
              type="text"
              className={`form-input ${errors.command ? 'input-error' : ''}`}
              placeholder="npm start or node server.js (Optional)"
              value={formData.command}
              onChange={handleChange}
              disabled={isLoading}
              autoComplete="off"
            />
            {errors.command && <span className="error-hint">{errors.command}</span>}
          </div>
        )}

        {/* Dual Port Binding Section */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {/* Field 3a: Application Port (Hidden in Static Website mode) */}
          {buildMode !== 'static' ? (
            <div className="form-group">
              <label htmlFor="appPort" className="form-label">
                Application Port
                <span className="label-hint">Container internal port (EXPOSE)</span>
              </label>
              <input
                id="appPort"
                name="appPort"
                type="number"
                className={`form-input ${errors.appPort ? 'input-error' : ''}`}
                placeholder="3300"
                value={formData.appPort}
                onChange={handleChange}
                disabled={isLoading}
                autoComplete="off"
              />
              {errors.appPort && <span className="error-hint">{errors.appPort}</span>}
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">
                Internal Web Server Port
                <span className="label-hint">Nginx Container Default</span>
              </label>
              <div className="form-input" style={{ opacity: 0.7, background: 'rgba(255, 255, 255, 0.05)' }}>
                Port 80 (Nginx HTTP)
              </div>
            </div>
          )}

          {/* Field 3b: Host Free Port */}
          <div className="form-group">
            <label htmlFor="hostPort" className="form-label">
              Host Free Port
              <span className="label-hint">Free port on your local machine</span>
            </label>
            <input
              id="hostPort"
              name="hostPort"
              type="number"
              className={`form-input ${errors.hostPort ? 'input-error' : ''}`}
              placeholder="8080"
              value={formData.hostPort}
              onChange={handleChange}
              disabled={isLoading}
              autoComplete="off"
            />
            {errors.hostPort && <span className="error-hint">{errors.hostPort}</span>}
          </div>
        </div>

        {/* Live Host Port Availability Indicator */}
        {portStatus && !errors.hostPort && (
          <div className="port-status-badge">
            {portStatus.checking ? (
              <span style={{ color: 'var(--text-muted)' }}>🔍 Checking host port availability...</span>
            ) : portStatus.available ? (
              <span style={{ color: '#10b981' }}>
                🟢 Host Port {formData.hostPort} is free and ready for binding (-p {formData.hostPort}:{buildMode === 'static' ? 80 : formData.appPort})
              </span>
            ) : (
              <span style={{ color: '#f59e0b' }}>
                ⚠️ Host Port {formData.hostPort} is currently in use. Choose another free port (e.g. 8080, 8081, 9000) to avoid conflict.
              </span>
            )}
          </div>
        )}

        {/* Field 4: Image Name */}
        <div className="form-group">
          <label htmlFor="imageName" className="form-label">
            Image Name
            <span className="label-hint">Docker image tag name</span>
          </label>
          <input
            id="imageName"
            name="imageName"
            type="text"
            className={`form-input ${errors.imageName ? 'input-error' : ''}`}
            placeholder="my-static-site"
            value={formData.imageName}
            onChange={handleChange}
            disabled={isLoading}
            autoComplete="off"
          />
          {errors.imageName && <span className="error-hint">{errors.imageName}</span>}
        </div>

        {/* Main BUILD Button */}
        <button type="submit" className="btn-build" disabled={isLoading}>
          {isLoading ? (
            <>
              <div className="spinner" />
              <span>Building & Launching Container...</span>
            </>
          ) : (
            <span>BUILD</span>
          )}
        </button>
      </form>
    </div>
  );
}
