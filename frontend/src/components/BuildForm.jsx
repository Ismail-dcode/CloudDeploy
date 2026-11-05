import React, { useState, useEffect } from 'react';

export default function BuildForm({ onSubmit, isLoading }) {
  const [buildMode, setBuildMode] = useState('auto'); // 'auto' | 'static' | 'existing'
  const [deployNow, setDeployNow] = useState(false); // build image only by default; running a container is opt-in
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);

  const [formData, setFormData] = useState({
    repoUrl: '',
    command: '',
    appPort: '3000',
    hostPort: '8080',
    imageName: ''
  });

  const [errors, setErrors] = useState({});
  const [portStatus, setPortStatus] = useState(null);
  const [envPairs, setEnvPairs] = useState([{ id: 1, key: '', value: '' }]);

  // Auto extract image slug from GitHub URL
  const handleRepoUrlChange = (e) => {
    const url = e.target.value;
    setFormData((prev) => {
      let updatedImageName = prev.imageName;
      if (!prev.imageName || prev.imageName === extractSlug(prev.repoUrl)) {
        updatedImageName = extractSlug(url);
      }
      return { ...prev, repoUrl: url, imageName: updatedImageName };
    });
    if (errors.repoUrl) setErrors((prev) => ({ ...prev, repoUrl: null }));
  };

  const extractSlug = (url) => {
    if (!url) return '';
    try {
      const parts = url.trim().replace(/\/$/, '').replace(/\.git$/, '').split('/');
      const last = parts[parts.length - 1];
      return last ? last.toLowerCase().replace(/[^a-z0-9_-]/g, '-') : '';
    } catch (err) {
      return '';
    }
  };

  // Check host port availability
  useEffect(() => {
    if (!deployNow) {
      setPortStatus(null);
      return;
    }

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
  }, [formData.hostPort, deployNow]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};

    const repoTrimmed = formData.repoUrl.trim();
    const githubRegex = /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?\/?$/;
    if (!repoTrimmed) {
      newErrors.repoUrl = 'GitHub Repository URL is required.';
    } else if (!githubRegex.test(repoTrimmed)) {
      newErrors.repoUrl = 'Please enter a valid GitHub repository URL (e.g. https://github.com/user/my-app)';
    }

    if (buildMode !== 'static') {
      const apNum = Number(formData.appPort);
      if (!formData.appPort || isNaN(apNum) || !Number.isInteger(apNum) || apNum < 1 || apNum > 65535) {
        newErrors.appPort = 'Enter a valid application port number between 1 and 65535.';
      }
    }

    if (deployNow) {
      const hpNum = Number(formData.hostPort);
      if (!formData.hostPort || isNaN(hpNum) || !Number.isInteger(hpNum) || hpNum < 1 || hpNum > 65535) {
        newErrors.hostPort = 'Enter a valid host port number between 1 and 65535.';
      }
    }

    const imgTrimmed = formData.imageName.trim();
    const dockerImageRegex = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/;
    if (!imgTrimmed) {
      newErrors.imageName = 'Image name is required.';
    } else if (!dockerImageRegex.test(imgTrimmed.toLowerCase())) {
      newErrors.imageName = 'Image name must be alphanumeric with hyphens/dots (e.g. my-node-app).';
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      if (newErrors.imageName || newErrors.appPort || newErrors.hostPort) {
        setIsAccordionOpen(true);
      }
    }
    return Object.keys(newErrors).length === 0;
  };

  const addEnvPair = () => {
    setEnvPairs((prev) => [...prev, { id: Date.now() + Math.random(), key: '', value: '' }]);
  };

  const removeEnvPair = (idToRemove) => {
    setEnvPairs((prev) => prev.filter((item) => item.id !== idToRemove));
  };

  const handleEnvChange = (idToUpdate, field, val) => {
    setEnvPairs((prev) =>
      prev.map((item) => (item.id === idToUpdate ? { ...item, [field]: val } : item))
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      const targetAppPort = buildMode === 'static' ? 80 : Number(formData.appPort);

      const envVarsObj = {};
      envPairs.forEach((pair) => {
        if (pair.key && pair.key.trim()) {
          envVarsObj[pair.key.trim()] = pair.value ? pair.value.trim() : '';
        }
      });

      onSubmit({
        repoUrl: formData.repoUrl.trim(),
        command: buildMode === 'auto' ? formData.command.trim() : '',
        port: targetAppPort,
        appPort: targetAppPort,
        hostPort: deployNow ? Number(formData.hostPort) : undefined,
        imageName: formData.imageName.trim().toLowerCase(),
        buildMode,
        isStaticMode: buildMode === 'static',
        useExistingDockerfile: buildMode === 'existing',
        deployNow,
        envVars: envVarsObj
      });
    }
  };

  return (
    <div className="glass-card" style={{ padding: '0 0 3rem 0', borderBottom: '1px solid #1a1a1a' }}>
      <div className="section-header" style={{ borderBottom: 'none', marginBottom: '1.25rem' }}>
        <div>
          <h2 className="section-title" style={{ fontSize: '1.6rem', fontWeight: 800 }}>⚡ Import & Deploy Repository</h2>
          <p className="section-desc">Clone code, auto-detect framework, generate Dockerfile & launch container</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="build-form" noValidate>
        {/* GitHub Repository Importer */}
        <div className="form-group">
          <label htmlFor="repoUrl" className="form-label">
            <span>Git Repository URL</span>
            <span className="label-hint">Public GitHub Repository</span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="repoUrl"
              name="repoUrl"
              type="url"
              className={`form-input ${errors.repoUrl ? 'input-error' : ''}`}
              placeholder="https://github.com/user/my-awesome-app"
              value={formData.repoUrl}
              onChange={handleRepoUrlChange}
              disabled={isLoading}
              autoComplete="off"
              style={{ paddingLeft: '2.75rem', fontSize: '0.95rem' }}
            />
            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.6, fontSize: '1.1rem' }}>
              🐙
            </span>
          </div>
          {errors.repoUrl && <span className="error-hint">{errors.repoUrl}</span>}
        </div>

        {/* Framework Presets Selector */}
        <div className="form-group" style={{ marginTop: '0.2rem' }}>
          <label className="form-label">
            <span>Framework Preset</span>
            <span className="label-hint">Auto-detected framework specs</span>
          </label>
          <div className="mode-selector" style={{ background: '#0a0a0a', border: '1px solid #1a1a1a' }}>
            <button
              type="button"
              className={`mode-tab ${buildMode === 'auto' ? 'mode-tab-active' : ''}`}
              onClick={() => {
                setBuildMode('auto');
                setErrors({});
                setFormData((prev) => ({ ...prev, appPort: prev.appPort === '80' ? '3000' : prev.appPort }));
              }}
            >
              ⚡ Auto App (Python/Node/Go)
            </button>
            <button
              type="button"
              className={`mode-tab ${buildMode === 'static' ? 'mode-tab-active' : ''}`}
              onClick={() => {
                setBuildMode('static');
                setErrors({});
                setFormData((prev) => ({ ...prev, appPort: '80' }));
              }}
            >
              🌐 Static / React SPA
            </button>
            <button
              type="button"
              className={`mode-tab ${buildMode === 'existing' ? 'mode-tab-active' : ''}`}
              onClick={() => {
                setBuildMode('existing');
                setErrors({});
                setFormData((prev) => ({ ...prev, appPort: prev.appPort === '80' ? '3000' : prev.appPort }));
              }}
            >
              🐳 Existing Dockerfile
            </button>
          </div>
        </div>

        {/* Collapsible Accordion for Advanced Build & Environment Settings */}
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '0.6rem', overflow: 'hidden', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setIsAccordionOpen(!isAccordionOpen)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.25rem',
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <span>⚙️ Build & Output Settings</span>
            <span style={{ transition: 'transform 0.2s ease', transform: isAccordionOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: '#888888' }}>
              ▼
            </span>
          </button>

          {isAccordionOpen && (
            <div style={{ padding: '1.25rem', borderTop: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                {/* Image Tag */}
                <div className="form-group">
                  <label htmlFor="imageName" className="form-label">
                    Docker Image Tag
                  </label>
                  <input
                    id="imageName"
                    name="imageName"
                    type="text"
                    className={`form-input ${errors.imageName ? 'input-error' : ''}`}
                    placeholder="my-app"
                    value={formData.imageName}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                  {errors.imageName && <span className="error-hint">{errors.imageName}</span>}
                </div>

                {/* App Port */}
                {buildMode !== 'static' ? (
                  <div className="form-group">
                    <label htmlFor="appPort" className="form-label">
                      App Port (Container EXPOSE)
                    </label>
                    <input
                      id="appPort"
                      name="appPort"
                      type="number"
                      className={`form-input ${errors.appPort ? 'input-error' : ''}`}
                      placeholder="3000"
                      value={formData.appPort}
                      onChange={handleChange}
                      disabled={isLoading}
                    />
                    {errors.appPort && <span className="error-hint">{errors.appPort}</span>}
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">App Port</label>
                    <div className="form-input" style={{ opacity: 0.6 }}>Port 80 (Nginx)</div>
                  </div>
                )}
              </div>

              {/* Custom Command */}
              {buildMode === 'auto' && (
                <div className="form-group">
                  <label htmlFor="command" className="form-label">
                    <span>Custom Production Command</span>
                    <span className="label-hint">Optional override</span>
                  </label>
                  <input
                    id="command"
                    name="command"
                    type="text"
                    className="form-input"
                    placeholder="e.g. uvicorn main:app --host 0.0.0.0 --port 8000"
                    value={formData.command}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </div>
              )}

              {/* Immediate Deploy Toggle */}
              <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #161616' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={deployNow}
                    onChange={(e) => setDeployNow(e.target.checked)}
                    disabled={isLoading}
                    style={{ width: '16px', height: '16px', accentColor: '#ffffff' }}
                  />
                  <span>Deploy container instance immediately on host port</span>
                </label>

                {deployNow && (
                  <div style={{ marginTop: '0.85rem' }}>
                    <div className="form-group">
                      <label htmlFor="hostPort" className="form-label">
                        Host Free Port
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
                      />
                      {errors.hostPort && <span className="error-hint">{errors.hostPort}</span>}
                    </div>

                    {portStatus && !errors.hostPort && (
                      <div className="port-status-badge">
                        {portStatus.checking ? (
                          <span style={{ color: '#888888' }}>Checking host port...</span>
                        ) : portStatus.available ? (
                          <span style={{ color: '#10b981' }}>🟢 Port {formData.hostPort} is free and ready</span>
                        ) : (
                          <span style={{ color: '#f59e0b' }}>⚠️ Port {formData.hostPort} is in use!</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Environment Variables Builder */}
              {deployNow && (
                <div className="form-group" style={{ marginTop: '0.2rem' }}>
                  <label className="form-label">
                    <span>Environment Variables</span>
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={addEnvPair}
                      style={{ fontSize: '0.75rem' }}
                    >
                      + Add Pair
                    </button>
                  </label>
                  {envPairs.map((pair) => (
                    <div key={pair.id} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="KEY"
                        value={pair.key}
                        onChange={(e) => handleEnvChange(pair.id, 'key', e.target.value)}
                        disabled={isLoading}
                        style={{ flex: 1 }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        placeholder="VALUE"
                        value={pair.value}
                        onChange={(e) => handleEnvChange(pair.id, 'value', e.target.value)}
                        disabled={isLoading}
                        style={{ flex: 1 }}
                      />
                      {envPairs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEnvPair(pair.id)}
                          style={{ background: '#1a1a1a', color: '#ef4444', border: '1px solid #222222', borderRadius: '4px', padding: '0 0.65rem', cursor: 'pointer' }}
                        >
                          {'\u2715'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Submit Action Button */}
        <button type="submit" className="btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1rem', marginTop: '0.75rem', borderRadius: '0.5rem' }} disabled={isLoading}>
          {isLoading ? (
            <>
              <div className="spinner" />
              <span>Deploying Container...</span>
            </>
          ) : (
            <span>{deployNow ? '⚡ DEPLOY CONTAINER' : '🛠️ BUILD & STORE IMAGE'}</span>
          )}
        </button>
      </form>
    </div>
  );
}
