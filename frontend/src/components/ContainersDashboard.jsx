import React, { useState } from 'react';

export default function ContainersDashboard({
  containers = [],
  onStopContainer,
  onStartContainer,
  onRemoveContainer,
  onOpenDeployModal,
  onRefresh
}) {
  const [selectedLogs, setSelectedLogs] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) await onRefresh();
    } catch (err) {
      console.error('Failed to refresh containers:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const handleAction = async (actionFn, containerName, actionKey) => {
    setActionLoading((prev) => ({ ...prev, [actionKey]: true }));
    try {
      await actionFn(containerName);
    } catch (err) {
      console.error(`Error performing ${actionKey}:`, err);
    } finally {
      setActionLoading((prev) => ({ ...prev, [actionKey]: false }));
    }
  };

  const fetchLogs = async (containerName) => {
    try {
      const res = await fetch(`/api/containers/${containerName}/logs`);
      const data = await res.json();
      if (data.success) {
        setSelectedLogs({ name: containerName, text: data.logs });
      } else {
        setSelectedLogs({ name: containerName, text: `Failed to fetch logs: ${data.message}` });
      }
    } catch (err) {
      setSelectedLogs({ name: containerName, text: `Error: ${err.message}` });
    }
  };

  return (
    <div className="glass-card" style={{ padding: '0 0 3rem 0', borderBottom: '1px solid #1a1a1a' }}>
      <div className="section-header">
        <div>
          <h2 className="section-title">🚀 Live Container Instances</h2>
          <p className="section-desc">Mechanism 2: Multi-container deployments running on custom ports</p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            style={{ fontSize: '0.85rem', padding: '0.5rem 0.9rem' }}
          >
            {isRefreshing ? '🔄 Refreshing...' : '🔄 Refresh Status'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onOpenDeployModal()}
            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
          >
            + Deploy New Instance
          </button>
        </div>
      </div>

      {containers.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🚀</p>
          <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No container instances deployed yet.</p>
          <p style={{ fontSize: '0.825rem', marginTop: '0.25rem' }}>
            Select a built image from the catalog and deploy it on any host free port!
          </p>
        </div>
      ) : (
        <div className="cards-grid">
          {containers.map((c) => {
            const targetName = c.containerName || c.name || c.id;
            const isRunning = c.status === 'running';
            const isBusy = actionLoading[targetName];

            return (
              <div key={c.id || targetName} className="container-card">
                <div>
                  <div className="card-top">
                    <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={isRunning ? 'pulsing-dot' : ''} style={{ background: isRunning ? '#10b981' : '#64748b' }} />
                      <span>{targetName}</span>
                    </div>
                    <span className={`status-badge ${isRunning ? 'status-success' : 'status-failed'}`}>
                      {c.status}
                    </span>
                  </div>

                  <div className="card-meta" style={{ marginTop: '0.85rem' }}>
                    <div className="meta-row">
                      <span className="meta-label">Source Image:</span>
                      <span className="meta-value">{c.imageName}</span>
                    </div>

                    <div className="meta-row">
                      <span className="meta-label">Port Mapping:</span>
                      <span className="meta-value" style={{ color: '#ffffff' }}>
                        Host {c.hostPort} ➔ App {c.appPort}
                      </span>
                    </div>

                    {(c.localUrl || c.url) && (
                      <div className="meta-row">
                        <span className="meta-label">Local URL:</span>
                        <a
                          href={c.localUrl || c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="meta-value"
                          style={{ color: '#ffffff', textDecoration: 'underline' }}
                        >
                          {c.localUrl || c.url} ↗
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div className="card-actions">
                  {isRunning ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={isBusy}
                      onClick={() => handleAction(onStopContainer, targetName, targetName)}
                      style={{ flex: 1, fontSize: '0.8rem', padding: '0.45rem' }}
                    >
                      {isBusy ? '...' : '⏸️ Stop'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={isBusy}
                      onClick={() => handleAction(onStartContainer, targetName, targetName)}
                      style={{ flex: 1, fontSize: '0.8rem', padding: '0.45rem' }}
                    >
                      {isBusy ? '...' : '▶️ Start'}
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => fetchLogs(targetName)}
                    style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}
                  >
                    📄 Logs
                  </button>

                  <button
                    type="button"
                    className="btn-secondary btn-danger"
                    disabled={isBusy}
                    onClick={() => handleAction(onRemoveContainer, targetName, targetName)}
                    title="Remove container instance"
                    style={{ padding: '0.45rem 0.65rem' }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Logs Modal */}
      {selectedLogs && (
        <div className="modal-backdrop" onClick={() => setSelectedLogs(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="section-header" style={{ marginBottom: '1rem' }}>
              <h3 className="section-title">📄 Logs: {selectedLogs.name}</h3>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedLogs(null)}
                style={{ padding: '0.2rem 0.6rem' }}
              >
                ✕
              </button>
            </div>

            <div className="terminal-card">
              <div className="terminal-header">Container Logs Stream</div>
              <div className="terminal-body">{selectedLogs.text}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
