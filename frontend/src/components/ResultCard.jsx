import React, { useState } from 'react';

export default function ResultCard({ result }) {
  if (!result) return null;

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'dockerfile' | 'logs'
  const [copiedField, setCopiedField] = useState(null);

  const {
    success,
    projectType,
    imageName,
    tag,
    port,
    appPort,
    hostPort,
    localUrl,
    containerRunning,
    containerId,
    runCommand,
    runError,
    message,
    error,
    logs,
    dockerfileContent
  } = result;

  const targetAppPort = appPort || port;
  const targetHostPort = hostPort || port;
  const displayUrl = localUrl || (targetHostPort ? `http://localhost:${targetHostPort}` : null);
  const defaultRunCommand = runCommand || (targetHostPort && targetAppPort && imageName ? `docker run -d -p ${targetHostPort}:${targetAppPort} --name ${imageName}-container ${imageName}:latest` : null);

  const copyToClipboard = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Format display project type
  const formatProjectType = (type) => {
    if (!type) return 'Unknown';
    switch (type.toLowerCase()) {
      case 'react-vite':
      case 'react':
        return 'React + Vite';
      case 'node':
        return 'Node.js';
      case 'python':
        return 'Python';
      case 'go':
        return 'Go';
      case 'existing-dockerfile':
      case 'existing dockerfile':
        return 'Existing Dockerfile';
      case 'unsupported':
        return 'Unsupported';
      default:
        return type;
    }
  };

  // Case 1: Unsupported project
  if (projectType === 'unsupported') {
    return (
      <div className="glass-card result-card">
        <div className="result-header">
          <span className="status-badge status-unsupported">
            ⚠️ Unsupported Project
          </span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          {message || 'This project type is not supported in Phase 1.'}
        </p>
      </div>
    );
  }

  // Case 2: Build Failed
  if (!success) {
    return (
      <div className="glass-card result-card">
        <div className="result-header">
          <span className="status-badge status-failed">
            ❌ Build Failed
          </span>
        </div>
        <div style={{ color: 'var(--status-error-text)', fontSize: '0.95rem', fontWeight: 500 }}>
          {message || 'Docker build failed.'}
        </div>
        {error && (
          <div className="terminal-card">
            <div className="terminal-header">Build Error Output</div>
            <div className="terminal-body error-text">{error}</div>
          </div>
        )}
      </div>
    );
  }

  // Case 3: Build Successful
  return (
    <div className="glass-card result-card">
      <div className="result-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span className="status-badge status-success">
            ✅ Build Successful
          </span>
          {containerRunning && (
            <span className="status-badge status-success" style={{ fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.15)' }}>
              🟢 Container Live ({containerId})
            </span>
          )}
        </div>
      </div>

      {/* Tabs Header */}
      <div className="tab-navigation">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'overview' ? 'tab-btn-active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          🚀 Overview & Details
        </button>
        {dockerfileContent && (
          <button
            type="button"
            className={`tab-btn ${activeTab === 'dockerfile' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('dockerfile')}
          >
            🐳 Dockerfile
          </button>
        )}
        {logs && (
          <button
            type="button"
            className={`tab-btn ${activeTab === 'logs' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            📟 Terminal Output Logs
          </button>
        )}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <>
          <div className="result-grid">
            <div className="result-item">
              <div className="result-item-label">Detected Technology</div>
              <div className="result-item-value">{formatProjectType(projectType)}</div>
            </div>

            <div className="result-item">
              <div className="result-item-label">Docker Image Tag</div>
              <div className="result-item-value">{imageName}:{tag || 'latest'}</div>
            </div>

            {displayUrl && (
              <div className="result-item">
                <div className="result-item-label">Application Local URL</div>
                <div className="result-item-value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <a
                    href={displayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#60a5fa', textDecoration: 'underline text-underline-offset-4' }}
                  >
                    {displayUrl} 🔗
                  </a>
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => copyToClipboard(displayUrl, 'url')}
                  >
                    {copiedField === 'url' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            <div className="result-item">
              <div className="result-item-label">Port Binding (-p)</div>
              <div className="result-item-value">{targetHostPort}:{targetAppPort}</div>
            </div>
          </div>

          {defaultRunCommand && (
            <div className="terminal-card" style={{ marginTop: '1.25rem' }}>
              <div className="terminal-header">
                <span>Docker Container Run Command</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => copyToClipboard(defaultRunCommand, 'runCmd')}
                >
                  {copiedField === 'runCmd' ? '✓ Copied' : 'Copy Command'}
                </button>
              </div>
              <div className="terminal-body" style={{ color: '#93c5fd' }}>{defaultRunCommand}</div>
            </div>
          )}

          {containerRunning && (
            <div className="terminal-card" style={{ marginTop: '1rem' }}>
              <div className="terminal-header">
                <span>Quick Management Commands</span>
              </div>
              <div className="terminal-body" style={{ color: '#d1d5db', fontSize: '0.8rem' }}>
                <p><strong>View Logs:</strong> <code>docker logs {imageName}-container</code></p>
                <p style={{ marginTop: '0.4rem' }}><strong>Stop Container:</strong> <code>docker stop {imageName}-container</code></p>
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: DOCKERFILE */}
      {activeTab === 'dockerfile' && dockerfileContent && (
        <div className="terminal-card">
          <div className="terminal-header">
            <span>Generated Dockerfile</span>
            <button
              type="button"
              className="copy-btn"
              onClick={() => copyToClipboard(dockerfileContent, 'dockerfile')}
            >
              {copiedField === 'dockerfile' ? '✓ Copied' : 'Copy Dockerfile'}
            </button>
          </div>
          <div className="terminal-body">{dockerfileContent}</div>
        </div>
      )}

      {/* TAB 3: LOGS */}
      {activeTab === 'logs' && logs && (
        <div className="terminal-card">
          <div className="terminal-header">
            <span>Docker Build Terminal Output</span>
            <button
              type="button"
              className="copy-btn"
              onClick={() => copyToClipboard(logs, 'logs')}
            >
              {copiedField === 'logs' ? '✓ Copied' : 'Copy Logs'}
            </button>
          </div>
          <div className="terminal-body">{logs}</div>
        </div>
      )}
    </div>
  );
}
