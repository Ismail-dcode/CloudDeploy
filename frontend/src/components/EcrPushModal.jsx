import React, { useState, useEffect } from 'react';

/**
 * EcrPushModal
 *
 * Shown after a successful Docker build to let the user push the image to
 * Amazon ECR. Displays ECR config status, push progress, and the final
 * ECR image URI on success.
 *
 * Props:
 *   isOpen         {boolean}   – Whether the modal is visible
 *   onClose        {function}  – Called when the user closes the modal
 *   onPushed       {function}  – Called after a successful push (for refresh)
 *   onDeployNow    {function}  – Called on "Deploy Now" with the push result
 *   imageName      {string}    – Local Docker image name to push
 *   deploymentId   {string}    – Unique ID used as part of the ECR image tag
 */
export default function EcrPushModal({ isOpen, onClose, onPushed, onDeployNow, imageName, deploymentId }) {
  const [ecrConfig, setEcrConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);

  const [pushState, setPushState] = useState('idle'); // 'idle' | 'pushing' | 'success' | 'error'
  const [pushResult, setPushResult] = useState(null);

  // Fetch ECR configuration status whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;

    setPushState('idle');
    setPushResult(null);

    const fetchConfig = async () => {
      setConfigLoading(true);
      try {
        const res = await fetch('/api/ecr/config');
        const data = await res.json();
        setEcrConfig(data);
      } catch (err) {
        setEcrConfig({ success: false, configured: false, missing: ['(Could not reach backend)'] });
      } finally {
        setConfigLoading(false);
      }
    };

    fetchConfig();
  }, [isOpen]);

  const handlePush = async () => {
    if (!imageName || !deploymentId) return;

    setPushState('pushing');
    setPushResult(null);

    try {
      const res = await fetch('/api/ecr/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageName, deploymentId })
      });
      const data = await res.json();

      if (data.success) {
        setPushState('success');
        setPushResult(data);
        if (typeof onPushed === 'function') onPushed(data);
      } else {
        setPushState('error');
        setPushResult(data);
      }
    } catch (err) {
      setPushState('error');
      setPushResult({ error: err.message || 'Network error — could not reach backend.' });
    }
  };

  const handleClose = () => {
    setPushState('idle');
    setPushResult(null);
    onClose();
  };

  if (!isOpen) return null;

  const isPushing = pushState === 'pushing';
  const isSuccess = pushState === 'success';
  const isError = pushState === 'error';

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '620px', width: '100%' }}
      >
        {/* ── Header ── */}
        <div className="section-header" style={{ marginBottom: '1.5rem' }}>
          <div>
            <h3 className="section-title" style={{ fontSize: '1.2rem' }}>
              ☁️ Push to Amazon ECR
            </h3>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Tag &amp; push <strong style={{ color: '#fff' }}>{imageName}:latest</strong> to your ECR repository
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleClose}
            style={{ padding: '0.2rem 0.65rem' }}
          >
            ✕
          </button>
        </div>

        {/* ── ECR Config Status ── */}
        <div
          style={{
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: '0.5rem',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem'
          }}
        >
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ECR Configuration
          </div>

          {configLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              <div className="spinner" style={{ width: '14px', height: '14px' }} />
              Checking ECR configuration…
            </div>
          ) : ecrConfig ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Registry URI (non-secret) */}
              {ecrConfig.registry && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Registry</span>
                  <code style={{ color: '#e2e8f0', fontFamily: 'var(--font-mono)', fontSize: '0.775rem' }}>
                    {ecrConfig.registry}
                  </code>
                </div>
              )}
              {ecrConfig.ecrRepository && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Repository</span>
                  <code style={{ color: '#e2e8f0', fontFamily: 'var(--font-mono)', fontSize: '0.775rem' }}>
                    {ecrConfig.ecrRepository}
                  </code>
                </div>
              )}
              {/* Image tag preview */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Image Tag</span>
                <code style={{ color: '#e2e8f0', fontFamily: 'var(--font-mono)', fontSize: '0.775rem' }}>
                  deploy-{deploymentId}
                </code>
              </div>

              {/* Config status indicator */}
              {ecrConfig.configured ? (
                <div
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(16,185,129,0.08)',
                    border: '1px solid rgba(16,185,129,0.2)',
                    borderRadius: '0.4rem',
                    fontSize: '0.8rem',
                    color: '#10b981'
                  }}
                >
                  🟢 All ECR environment variables are configured
                </div>
              ) : (
                <div
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: '0.4rem',
                    fontSize: '0.8rem',
                    color: '#ef4444'
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>
                    ⚠️ Missing environment variables in backend <code>.env</code>:
                  </div>
                  {(ecrConfig.missing || []).map((v) => (
                    <div key={v} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.775rem', marginLeft: '0.5rem' }}>
                      • {v}
                    </div>
                  ))}
                  <div style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Copy <code>backend/.env.example</code> → <code>backend/.env</code> and fill in your AWS credentials.
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '0.875rem', color: '#ef4444' }}>
              Could not fetch ECR configuration status.
            </div>
          )}
        </div>

        {/* ── Push Result ── */}
        {isSuccess && pushResult && (
          <div
            style={{
              padding: '1rem 1.25rem',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.25)',
              borderRadius: '0.5rem',
              marginBottom: '1.25rem'
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#10b981', marginBottom: '0.6rem' }}>
              ✅ Image pushed to ECR successfully
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              <span>
                Status:{' '}
                <strong style={{ color: '#10b981' }}>{pushResult.ecrStatus || 'pushed'}</strong>
              </span>
              <span>
                Deployment ID:{' '}
                <strong style={{ color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                  {pushResult.deploymentId || deploymentId}
                </strong>
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>ECR Image URI</div>
              <code
                style={{
                  display: 'block',
                  background: '#111111',
                  border: '1px solid #222222',
                  borderRadius: '0.35rem',
                  padding: '0.6rem 0.75rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.775rem',
                  color: '#e2e8f0',
                  wordBreak: 'break-all'
                }}
              >
                {pushResult.imageUri}
              </code>
            </div>
            {pushResult.output && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Push Output</div>
                <div
                  className="terminal-body"
                  style={{ maxHeight: '140px', overflowY: 'auto', fontSize: '0.72rem' }}
                >
                  {pushResult.output}
                </div>
              </div>
            )}
          </div>
        )}

        {isError && pushResult && (
          <div
            style={{
              padding: '1rem 1.25rem',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: '0.5rem',
              marginBottom: '1.25rem'
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#ef4444', marginBottom: '0.5rem' }}>
              ✕ {pushResult.message || 'ECR push failed'}
            </div>
            {pushResult.step && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Failed at step: <strong style={{ color: '#fff' }}>{pushResult.step}</strong>
              </div>
            )}
            {pushResult.error && (
              <div
                className="error-text"
                style={{ fontSize: '0.775rem', fontFamily: 'var(--font-mono)', marginTop: '0.4rem', maxHeight: '120px', overflowY: 'auto' }}
              >
                {pushResult.error}
              </div>
            )}
          </div>
        )}

        {/* ── Push in progress ── */}
        {isPushing && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '1rem 1.25rem',
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: '0.5rem',
              marginBottom: '1.25rem',
              fontSize: '0.875rem',
              color: 'var(--text-secondary)'
            }}
          >
            <div className="spinner" style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            <span>Authenticating to ECR → tagging image → pushing layers… This may take a few minutes for large images.</span>
          </div>
        )}

        {/* ── Action Buttons ── */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleClose}
            disabled={isPushing}
          >
            {isSuccess ? 'Close' : 'Cancel'}
          </button>

          {isSuccess && pushResult && typeof onDeployNow === 'function' && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => onDeployNow({ ...pushResult, imageName })}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              🚀 Deploy Your Application
            </button>
          )}

          {!isSuccess && (
            <button
              type="button"
              className="btn-primary"
              onClick={handlePush}
              disabled={isPushing || configLoading || (ecrConfig && !ecrConfig.configured)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {isPushing ? (
                <>
                  <div className="spinner" style={{ width: '14px', height: '14px' }} />
                  Pushing to ECR…
                </>
              ) : isError ? (
                '🔄 Retry Push'
              ) : (
                '☁️ Push to ECR'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
