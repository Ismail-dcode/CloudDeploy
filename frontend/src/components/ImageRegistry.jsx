import React, { useState } from 'react';

export default function ImageRegistry({ images = [], onDeleteImage, onDeployImage, onPushToEcr, onDeployToEc2, isLoading }) {
  const [search, setSearch] = useState('');
  const [selectedDetails, setSelectedDetails] = useState(null);

  const filteredImages = images.filter(img =>
    (img.imageName && img.imageName.toLowerCase().includes(search.toLowerCase())) ||
    (img.projectType && img.projectType.toLowerCase().includes(search.toLowerCase())) ||
    (img.repoUrl && img.repoUrl.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="glass-card" style={{ padding: '0 0 3rem 0', borderBottom: '1px solid #1a1a1a' }}>
      <div className="section-header">
        <div>
          <h2 className="section-title">📦 Built Images Catalog</h2>
          <p className="section-desc">Mechanism 1: Saved Docker images built by CloudDeploy</p>
        </div>
        <div style={{ width: '260px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="🔍 Search images..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {filteredImages.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📦</p>
          <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            {search ? 'No images match your search.' : 'No built images in registry yet.'}
          </p>
          <p style={{ fontSize: '0.825rem', marginTop: '0.25rem' }}>
            Build your first Docker image using the Image Builder Studio!
          </p>
        </div>
      ) : (
        <div className="cards-grid">
          {filteredImages.map((img) => (
            <div key={img.id} className="registry-card">
              <div>
                <div className="card-top">
                  <div className="card-title">
                    🐳 {img.imageName}
                  </div>
                  <span className="card-tag">:{img.tag || 'latest'}</span>
                </div>

                <div className="card-meta" style={{ marginTop: '0.85rem' }}>
                  <div className="meta-row">
                    <span className="meta-label">Framework / Type:</span>
                    <span className="meta-value" style={{ textTransform: 'capitalize', color: '#ffffff' }}>
                      {img.projectType}
                    </span>
                  </div>

                  <div className="meta-row">
                    <span className="meta-label">Internal App Port:</span>
                    <span className="meta-value">Port {img.appPort || 80}</span>
                  </div>

                  {img.repoUrl && (
                    <div className="meta-row">
                      <span className="meta-label">Repository:</span>
                      <a
                        href={img.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="meta-value"
                        style={{ fontSize: '0.75rem', color: '#ffffff', textDecoration: 'underline', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '170px' }}
                      >
                        {img.repoUrl.replace('https://github.com/', '')}
                      </a>
                    </div>
                  )}

                  {img.ecrImageUri ? (
                    <div className="meta-row">
                      <span className="meta-label">ECR Image:</span>
                      <span
                        className="meta-value"
                        title={img.ecrImageUri}
                        style={{ fontSize: '0.7rem', color: '#10b981', fontFamily: 'var(--font-mono)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '170px' }}
                      >
                        {img.ecrTag || img.ecrImageUri}
                      </span>
                    </div>
                  ) : null}

                  <div className="meta-row">
                    <span className="meta-label">Created:</span>
                    <span className="meta-value" style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                      {new Date(img.createdAt).toLocaleDateString()} {new Date(img.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="card-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onDeployImage(img)}
                  style={{ flex: 1, fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}
                >
                  ⚡ Deploy Container
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSelectedDetails(img)}
                  style={{ fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}
                >
                  📜 Details
                </button>

                <button
                  type="button"
                  className="btn-secondary btn-danger"
                  onClick={() => onDeleteImage(img.id || img.imageName)}
                  title="Delete image from record & Docker"
                  style={{ padding: '0.5rem 0.65rem' }}
                >
                  🗑️ Delete
                </button>

                {img.ecrImageUri && onDeployToEc2 && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => onDeployToEc2(img)}
                    title="Configure and deploy this ECR image to an EC2 instance"
                    style={{ width: '100%', fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}
                  >
                    🚀 Deploy to EC2
                  </button>
                )}

                {onPushToEcr && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onPushToEcr(img)}
                    title={
                      img.ecrImageUri
                        ? `Already pushed as ${img.ecrImageUri}`
                        : 'Tag & push this image to Amazon ECR'
                    }
                    style={{ width: '100%', fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}
                  >
                    ☁️ {img.ecrImageUri ? 'Push New Tag to ECR' : 'Push to ECR'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image Details Modal */}
      {selectedDetails && (
        <div className="modal-backdrop" onClick={() => setSelectedDetails(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="section-header" style={{ marginBottom: '1rem' }}>
              <h3 className="section-title">🐳 Image Details: {selectedDetails.imageName}</h3>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedDetails(null)}
                style={{ padding: '0.2rem 0.6rem' }}
              >
                ✕
              </button>
            </div>

            {selectedDetails.dockerfileContent && (
              <div className="terminal-card" style={{ marginBottom: '1rem' }}>
                <div className="terminal-header">Generated Dockerfile</div>
                <div className="terminal-body">{selectedDetails.dockerfileContent}</div>
              </div>
            )}

            {selectedDetails.logs && (
              <div className="terminal-card">
                <div className="terminal-header">Build Logs Output</div>
                <div className="terminal-body">{selectedDetails.logs}</div>
              </div>
            )}

            {selectedDetails.ecrImageUri && (
              <div
                className="result-item"
                style={{ marginTop: '1rem', background: 'rgba(16, 185, 129, 0.08)' }}
              >
                <div className="result-item-label" style={{ color: '#10b981' }}>
                  Amazon ECR Image URI ({selectedDetails.ecrStatus || 'pushed'})
                </div>
                <div className="result-item-value" style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all', fontSize: '0.8rem' }}>
                  {selectedDetails.ecrImageUri}
                </div>
              </div>
            )}

            <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  const img = selectedDetails;
                  setSelectedDetails(null);
                  onDeployImage(img);
                }}
              >
                ⚡ Deploy Container Instance from this Image
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
