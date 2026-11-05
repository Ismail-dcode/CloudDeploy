import React, { useState } from 'react';

export default function ResultCard({ result, onDeployImage, onPushToEcr }) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'dockerfile' | 'logs'

  if (!result) return null;

  const {
    success,
    message,
    projectType,
    imageName,
    tag,
    deployed,
    hostPort,
    appPort,
    containerUrl,
    reachability,
    dockerfileContent,
    logs,
    error,
    savedImage,
    image
  } = result;

  // The saved image record carries the deployment ID used to tag the ECR image
  const builtImage = savedImage || image || (imageName ? { imageName, tag } : null);

  return (
    <div className="glass-card result-card" style={{ padding: '2rem 0', borderBottom: '1px solid #1a1a1a' }}>
      <div className="result-header">
        <div>
          <span className={`status-badge ${success ? 'status-success' : 'status-failed'}`}>
            {success ? '✓ Build & Deployment Successful' : '✕ Build Execution Failed'}
          </span>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.5rem', color: '#ffffff' }}>
            {message}
          </h3>
        </div>

        {success && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {onPushToEcr && builtImage && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onPushToEcr(builtImage)}
                style={{ fontSize: '0.85rem', padding: '0.6rem 1.1rem' }}
                title="Tag & push this image to your Amazon ECR repository"
              >
                ☁️ Push to ECR
              </button>
            )}

            <button
              type="button"
              className="btn-primary"
              onClick={() => onDeployImage(builtImage || { imageName, tag, appPort })}
              style={{ fontSize: '0.85rem', padding: '0.6rem 1.1rem' }}
            >
              ⚡ Launch Another Instance
            </button>
          </div>
        )}
      </div>

      <div className="tab-navigation">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'overview' ? 'tab-btn-active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Deployment Overview
        </button>
        {dockerfileContent && (
          <button
            type="button"
            className={`tab-btn ${activeTab === 'dockerfile' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('dockerfile')}
          >
            🐳 Generated Dockerfile
          </button>
        )}
        {logs && (
          <button
            type="button"
            className={`tab-btn ${activeTab === 'logs' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            📋 Build Logs
          </button>
        )}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="result-grid">
            {projectType && (
              <div className="result-item">
                <div className="result-item-label">Framework Spec</div>
                <div className="result-item-value" style={{ textTransform: 'capitalize' }}>
                  {projectType}
                </div>
              </div>
            )}

            {imageName && (
              <div className="result-item">
                <div className="result-item-label">Docker Image Built</div>
                <div className="result-item-value">{imageName}:{tag || 'latest'}</div>
              </div>
            )}

            {result.ecrImageUri && (
              <div className="result-item" style={{ gridColumn: '1 / -1' }}>
                <div className="result-item-label">Amazon ECR Image URI ({result.ecrStatus || 'pushed'})</div>
                <div className="result-item-value" style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                  {result.ecrImageUri}
                </div>
              </div>
            )}

            {deployed && (
              <>
                <div className="result-item">
                  <div className="result-item-label">Port Mapping</div>
                  <div className="result-item-value">Host {hostPort} ➔ Container {appPort}</div>
                </div>

                <div className="result-item">
                  <div className="result-item-label">Live Local URL</div>
                  <div className="result-item-value">
                    <a
                      href={containerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#ffffff', textDecoration: 'underline' }}
                    >
                      {containerUrl} ↗
                    </a>
                  </div>
                </div>
              </>
            )}
          </div>

          {reachability && (
            <div className="result-item" style={{ background: reachability.reachable ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)', border: '1px solid #1a1a1a' }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: reachability.reachable ? '#10b981' : '#f59e0b' }}>
                {reachability.reachable ? '🟢 Container HTTP Probe Passed' : '⚠️ Container HTTP Probe Pending'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                {reachability.message || `Tested reachability at ${reachability.testedUrl}`}
              </div>
            </div>
          )}

          {error && (
            <div className="result-item" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
              <div className="result-item-label" style={{ color: '#ef4444' }}>Error Traceback</div>
              <div className="error-text" style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                {typeof error === 'object' ? JSON.stringify(error, null, 2) : error}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'dockerfile' && dockerfileContent && (
        <div className="terminal-card">
          <div className="terminal-header">Dockerfile Output</div>
          <div className="terminal-body">{dockerfileContent}</div>
        </div>
      )}

      {activeTab === 'logs' && logs && (
        <div className="terminal-card">
          <div className="terminal-header">Build Logs Stream</div>
          <div className="terminal-body">{logs}</div>
        </div>
      )}
    </div>
  );
}
