import React, { useState, useEffect } from 'react';

export default function DeployModal({ isOpen, onClose, images = [], preselectedImage = null, onDeployContainer }) {
  if (!isOpen) return null;

  const [selectedImageName, setSelectedImageName] = useState(preselectedImage ? preselectedImage.imageName : (images[0]?.imageName || ''));
  const [containerName, setContainerName] = useState('');
  const [hostPort, setHostPort] = useState('8080');
  const [appPort, setAppPort] = useState('8000');
  const [envPairs, setEnvPairs] = useState([{ key: '', value: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [portStatus, setPortStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Auto update containerName & appPort when image changes
  useEffect(() => {
    if (selectedImageName) {
      const imgObj = images.find(img => img.imageName === selectedImageName);
      if (imgObj) {
        if (imgObj.appPort) setAppPort(String(imgObj.appPort));
        setContainerName(`${imgObj.imageName}-inst-${Math.floor(100 + Math.random() * 900)}`);
      } else {
        setContainerName(`${selectedImageName}-inst-1`);
      }
    }
  }, [selectedImageName, images]);

  // Check host port availability
  useEffect(() => {
    const portNum = parseInt(hostPort, 10);
    if (!hostPort || isNaN(portNum) || portNum < 1 || portNum > 65535) {
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
  }, [hostPort]);

  const addEnvPair = () => setEnvPairs(prev => [...prev, { key: '', value: '' }]);
  const removeEnvPair = (idx) => setEnvPairs(prev => prev.filter((_, i) => i !== idx));
  const handleEnvChange = (idx, field, val) => {
    setEnvPairs(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: val };
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedImageName) {
      setErrorMsg('Please select or specify a Docker image.');
      return;
    }
    if (!hostPort || isNaN(Number(hostPort))) {
      setErrorMsg('Please specify a valid Host Port number.');
      return;
    }

    const envVarsObj = {};
    envPairs.forEach(pair => {
      if (pair.key && pair.key.trim()) {
        envVarsObj[pair.key.trim()] = pair.value ? pair.value.trim() : '';
      }
    });

    setIsSubmitting(true);
    setErrorMsg(null);

    const success = await onDeployContainer({
      imageName: selectedImageName,
      containerName: containerName.trim(),
      hostPort: Number(hostPort),
      appPort: Number(appPort || hostPort),
      envVars: envVarsObj
    });

    setIsSubmitting(false);
    if (success) {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="section-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h3 className="section-title">🚀 Deploy Multi-Container Instance</h3>
            <p className="section-desc">Mechanism 2: Run separate container on custom host port & env vars</p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose} style={{ padding: '0.25rem 0.6rem' }}>
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="terminal-card" style={{ marginBottom: '1rem', borderColor: '#ef4444' }}>
            <div className="terminal-body error-text" style={{ padding: '0.6rem' }}>
              ⚠️ {errorMsg}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Image Selection */}
          <div className="form-group">
            <label className="form-label">
              Select Docker Image
              <span className="label-hint">Choose from built images</span>
            </label>
            {images.length > 0 ? (
              <select
                className="form-select"
                value={selectedImageName}
                onChange={(e) => setSelectedImageName(e.target.value)}
                disabled={isSubmitting}
              >
                {images.map(img => (
                  <option key={img.id} value={img.imageName}>
                    {img.imageName}:{img.tag || 'latest'} ({img.projectType})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="form-input"
                placeholder="e.g. my-app-image"
                value={selectedImageName}
                onChange={(e) => setSelectedImageName(e.target.value)}
                disabled={isSubmitting}
              />
            )}
          </div>

          {/* Container Instance Name */}
          <div className="form-group">
            <label className="form-label">
              Container Instance Name
              <span className="label-hint">Unique name (e.g., app-prod-1, app-staging)</span>
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. my-node-app-instance-1"
              value={containerName}
              onChange={(e) => setContainerName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* Dual Port Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">
                App Port (Container Internal)
              </label>
              <input
                type="number"
                className="form-input"
                placeholder="8000"
                value={appPort}
                onChange={(e) => setAppPort(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                Host Port (Machine Local Port)
              </label>
              <input
                type="number"
                className="form-input"
                placeholder="8080"
                value={hostPort}
                onChange={(e) => setHostPort(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Live Port Status */}
          {portStatus && (
            <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>
              {portStatus.checking ? (
                <span style={{ color: 'var(--text-muted)' }}>🔍 Checking host port {hostPort}...</span>
              ) : portStatus.available ? (
                <span style={{ color: '#10b981' }}>🟢 Host Port {hostPort} is free and ready (-p {hostPort}:{appPort})</span>
              ) : (
                <span style={{ color: '#f59e0b' }}>⚠️ Host Port {hostPort} is in use! Choose another port (e.g. 8081, 8082, 9000).</span>
              )}
            </div>
          )}

          {/* Environment Variables Builder */}
          <div className="form-group">
            <label className="form-label">
              <span>🔐 Custom Environment Variables</span>
              <button
                type="button"
                className="copy-btn"
                onClick={addEnvPair}
                style={{ fontSize: '0.725rem' }}
              >
                + Add Variable
              </button>
            </label>
            {envPairs.map((pair, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="KEY (e.g. PORT)"
                  value={pair.key}
                  onChange={(e) => handleEnvChange(idx, 'key', e.target.value)}
                  disabled={isSubmitting}
                  style={{ flex: 1 }}
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="VALUE"
                  value={pair.value}
                  onChange={(e) => handleEnvChange(idx, 'value', e.target.value)}
                  disabled={isSubmitting}
                  style={{ flex: 1 }}
                />
                {envPairs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeEnvPair(idx)}
                    style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: 'none', borderRadius: '4px', padding: '0 0.5rem', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              style={{ flex: 1 }}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: 2 }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="spinner" />
                  <span>Launching Instance...</span>
                </>
              ) : (
                <span>🚀 Launch Container Instance</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
