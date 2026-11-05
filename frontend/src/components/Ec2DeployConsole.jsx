import React, { useState, useEffect } from 'react';

/**
 * Ec2DeployConsole — "Deploy Your Application"
 *
 * Configuration step after an ECR push: pick the image, instance type, AWS
 * region, ports (host + container), container count, optional instance name
 * and dynamic environment variables (with per-variable "secret" flag).
 *
 * The backend launches the EC2 instance, installs Docker, pulls the image
 * and starts the containers via user-data; progress below reflects the REAL
 * lifecycle states reported by the backend (EC2 status checks, SSM bootstrap
 * markers, HTTP health check) — no fake progress.
 */

// Canonical lifecycle (matches backend status tokens, returned uppercase)
const LIFECYCLE = [
  { key: 'PENDING', label: 'Queued' },
  { key: 'PROVISIONING', label: 'Creating EC2 instance' },
  { key: 'INSTANCE_RUNNING', label: 'Instance running (status checks)' },
  { key: 'DOCKER_INSTALLING', label: 'Installing Docker on the instance' },
  { key: 'PULLING_IMAGE', label: 'Pulling image from ECR' },
  { key: 'STARTING_CONTAINER', label: 'Starting containers' },
  { key: 'HEALTH_CHECK', label: 'Performing health check' },
  { key: 'DEPLOYED', label: 'Deployed' }
];
const IN_FLIGHT = LIFECYCLE.slice(0, -1).map((s) => s.key);

const FALLBACK_INSTANCE_TYPES = ['t3.micro', 't3.small', 't3.medium', 't2.micro', 't2.small', 't2.medium'];
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export default function Ec2DeployConsole({ images = [], deployments = [], onRefresh, prefill, onPrefillUsed }) {
  const [infra, setInfra] = useState(null);
  const [infraLoading, setInfraLoading] = useState(false);

  // Form state
  const [imageUri, setImageUri] = useState('');
  const [instanceType, setInstanceType] = useState('t3.micro');
  const [region, setRegion] = useState('');
  const [containers, setContainers] = useState(1);
  const [containerPort, setContainerPort] = useState('');
  const [hostPort, setHostPort] = useState('80');
  const [instanceName, setInstanceName] = useState('');
  const [envRows, setEnvRows] = useState([{ id: 1, key: '', value: '', secret: false }]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [expandedLogs, setExpandedLogs] = useState({});
  const [copiedUrl, setCopiedUrl] = useState(null);

  // Prefill from an ECR push / registry "Deploy" button
  useEffect(() => {
    if (!prefill) return;
    if (prefill.imageUri) setImageUri(prefill.imageUri);
    if (prefill.appPort) setContainerPort(String(prefill.appPort));
    onPrefillUsed && onPrefillUsed();
  }, [prefill]);

  // Load infra status + defaults when the console mounts
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setInfraLoading(true);
      try {
        const res = await fetch('/api/deployments/config');
        const data = await res.json();
        if (mounted) {
          setInfra(data);
          if (data.registry) {
            setInstanceType(data.registry.defaultInstanceType || 't3.micro');
            setRegion(data.registry.region || '');
          }
        }
      } catch (err) {
        if (mounted) setInfra({ configured: false, error: err.message });
      } finally {
        if (mounted) setInfraLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const ecrImages = images.filter((img) => img.ecrImageUri);
  const instanceTypes = (infra && infra.registry && infra.registry.allowedInstanceTypes) || FALLBACK_INSTANCE_TYPES;

  // ── Dynamic environment variable rows ─────────────────────────────────────
  const addEnvRow = () => setEnvRows((rows) => [
    ...rows,
    { id: Date.now() + Math.floor(Math.random() * 1000), key: '', value: '', secret: false }
  ]);
  const removeEnvRow = (id) => setEnvRows((rows) => rows.filter((r) => r.id !== id));
  const updateEnvRow = (id, patch) => setEnvRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!imageUri) {
      setFormError('Select or paste an ECR image URI (push the image to ECR first).');
      return;
    }
    if (!containerPort) {
      setFormError('Enter the port your app listens on inside the container.');
      return;
    }
    const cPort = Number(containerPort);
    const hPort = Number(hostPort);
    if (!Number.isInteger(cPort) || cPort < 1 || cPort > 65535) {
      setFormError('Container port must be between 1 and 65535.');
      return;
    }
    if (!Number.isInteger(hPort) || hPort < 1 || hPort > 65533) {
      setFormError('Host port must be between 1 and 65533.');
      return;
    }
    if (hPort + Number(containers) - 1 > 65535) {
      setFormError('Host port + containers exceeds the valid port range.');
      return;
    }

    // Split rows into plain vs secret variables; validate names client-side
    const environmentVariables = {};
    const secretVariables = {};
    for (const row of envRows) {
      const key = row.key.trim();
      if (!key && !row.value.trim()) continue;
      if (!ENV_NAME_RE.test(key)) {
        setFormError(`Invalid environment variable name: "${key}" (letters, digits, underscore; must not start with a digit).`);
        return;
      }
      if (key in environmentVariables || key in secretVariables) {
        setFormError(`Duplicate environment variable: "${key}".`);
        return;
      }
      if (row.secret) secretVariables[key] = row.value;
      else environmentVariables[key] = row.value;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUri: imageUri.trim(),
          instanceType,
          region,
          containers: Number(containers),
          containerPort: cPort,
          hostPort: hPort,
          instanceName: instanceName.trim(),
          environmentVariables,
          secretVariables
        })
      });
      const data = await res.json();
      if (!data.success) {
        setFormError((data.errors || [data.message]).filter(Boolean).join(' · '));
      } else {
        setEnvRows([{ id: 1, key: '', value: '', secret: false }]);
        setInstanceName('');
        onRefresh && onRefresh();
      }
    } catch (err) {
      setFormError(`Request failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Terminate the EC2 instance and delete this deployment?')) return;
    try {
      const res = await fetch(`/api/deployments/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        alert(`Delete failed: ${data.message || ''} ${(data.warnings || []).join('; ')}`);
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
    onRefresh && onRefresh();
  };

  const copyUrl = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 1500);
    } catch (_) {}
  };

  const statusColor = (status) => {
    if (status === 'DEPLOYED') return '#10b981';
    if (status === 'FAILED') return '#ef4444';
    if (IN_FLIGHT.includes(status)) return '#f59e0b';
    return 'var(--text-secondary)';
  };

  const stageLabel = (status) => {
    const stage = LIFECYCLE.find((s) => s.key === status);
    return stage ? stage.label : status;
  };

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '0.35rem' }}>🚀 Deploy Your Application</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Push your image to ECR, configure the deployment below, and the backend launches an EC2
        instance that installs Docker, pulls the image and runs your containers. You get the
        instance's public IP and application URL once the health check passes.
      </p>

      {/* Infra status banner */}
      {infraLoading ? (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          <div className="spinner" style={{ width: '14px', height: '14px' }} /> Checking EC2 deployment config…
        </div>
      ) : infra && !infra.configured ? (
        <div
          style={{
            padding: '0.85rem 1rem', marginBottom: '1rem', fontSize: '0.8rem',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '0.45rem', color: '#ef4444'
          }}
        >
          <strong>⚠️ EC2 deployment not configured.</strong>
          <div style={{ marginTop: '0.35rem', color: 'var(--text-secondary)' }}>
            Missing in <code>backend/.env</code>: {(infra.missing || []).join(', ')}
          </div>
          {infra.error && (
            <div style={{ marginTop: '0.35rem', fontFamily: 'var(--font-mono)', fontSize: '0.725rem' }}>{infra.error}</div>
          )}
        </div>
      ) : infra && infra.registry ? (
        <div
          style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.3rem 1rem', padding: '0.85rem 1rem',
            background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '0.45rem', marginBottom: '1rem',
            fontSize: '0.775rem', fontFamily: 'var(--font-mono)'
          }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>Region</span><span>{infra.registry.region}</span>
          <span style={{ color: 'var(--text-secondary)' }}>Subnet</span><span>{infra.registry.subnetId}</span>
          <span style={{ color: 'var(--text-secondary)' }}>AMI</span><span>{infra.registry.amiId}</span>
          <span style={{ color: 'var(--text-secondary)' }}>Instance profile</span><span>{infra.registry.instanceProfile}</span>
        </div>
      ) : null}

      {/* Launch form */}
      <form onSubmit={handleSubmit} style={{ padding: '1.1rem', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '0.5rem', marginBottom: '1.25rem' }}>
        <div className="form-group">
          <label htmlFor="deploy-image" className="form-label">ECR Image</label>
          {ecrImages.length > 0 ? (
            <select
              id="deploy-image"
              className="form-input"
              value={ecrImages.some((img) => img.ecrImageUri === imageUri) ? imageUri : ''}
              onChange={(e) => setImageUri(e.target.value)}
              disabled={submitting}
            >
              <option value="">— select a pushed image —</option>
              {ecrImages.map((img) => (
                <option key={img.id} value={img.ecrImageUri}>
                  {img.imageName} — {img.ecrTag || img.ecrImageUri}
                </option>
              ))}
            </select>
          ) : (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
              No images pushed to ECR yet — build and push one first.
            </p>
          )}
          <input
            type="text"
            className="form-input"
            style={{ marginTop: '0.5rem' }}
            placeholder="…or paste a full ECR URI: 123456789012.dkr.ecr.us-east-1.amazonaws.com/repo:tag"
            value={imageUri}
            onChange={(e) => setImageUri(e.target.value)}
            disabled={submitting}
          />
        </div>

        {/* Instance type + region */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="deploy-instance-type" className="form-label">EC2 Instance Type</label>
            <select
              id="deploy-instance-type"
              className="form-input"
              value={instanceType}
              onChange={(e) => setInstanceType(e.target.value)}
              disabled={submitting}
            >
              {instanceTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <span className="label-hint" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              t3.micro is free-tier eligible
            </span>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="deploy-region" className="form-label">AWS Region</label>
            <select
              id="deploy-region"
              className="form-input"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              disabled={submitting || (infra && infra.registry && infra.registry.region)}
            >
              {region ? <option value={region}>{region}</option> : <option value="">—</option>}
            </select>
            <span className="label-hint" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              fixed: your VPC, subnet and ECR image live here
            </span>
          </div>
        </div>

        {/* Containers + ports */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="deploy-containers" className="form-label">Containers</label>
            <select
              id="deploy-containers"
              className="form-input"
              value={containers}
              onChange={(e) => setContainers(Number(e.target.value))}
              disabled={submitting}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="deploy-port" className="form-label">Container Port</label>
            <input
              id="deploy-port"
              type="number"
              className="form-input"
              placeholder="3000"
              value={containerPort}
              onChange={(e) => setContainerPort(e.target.value)}
              disabled={submitting}
              min="1"
              max="65535"
            />
            <span className="label-hint" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              the port your app listens on
            </span>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="deploy-host-port" className="form-label">Host Port</label>
            <input
              id="deploy-host-port"
              type="number"
              className="form-input"
              placeholder="80"
              value={hostPort}
              onChange={(e) => setHostPort(e.target.value)}
              disabled={submitting}
              min="1"
              max="65533"
            />
            <span className="label-hint" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              public: {hostPort || '?'} … {Number(hostPort || 0) + Number(containers) - 1}
            </span>
          </div>
        </div>

        {/* Instance name (optional) */}
        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="deploy-instance-name" className="form-label">
            EC2 Instance Name
            <span className="label-hint" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>optional — Name tag on the instance</span>
          </label>
          <input
            id="deploy-instance-name"
            type="text"
            className="form-input"
            placeholder="my-app-prod"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            disabled={submitting}
            maxLength={128}
          />
        </div>

        {/* Dynamic environment variables */}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">
            Environment Variables
            <span className="label-hint" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              optional — mark a variable as <strong>secret</strong> to store it in SSM Parameter Store (SecureString); values are never returned by the API
            </span>
          </label>

          {envRows.map((row, idx) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto auto auto', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' }}>
              <input
                type="text"
                className="form-input"
                placeholder={idx === 0 ? 'NODE_ENV' : 'KEY'}
                value={row.key}
                onChange={(e) => updateEnvRow(row.id, { key: e.target.value })}
                disabled={submitting}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}
              />
              <input
                type={row.secret ? 'password' : 'text'}
                className="form-input"
                placeholder={idx === 0 ? 'production' : 'value'}
                value={row.value}
                onChange={(e) => updateEnvRow(row.id, { value: e.target.value })}
                disabled={submitting}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={row.secret}
                  onChange={(e) => updateEnvRow(row.id, { secret: e.target.checked })}
                  disabled={submitting}
                />
                secret
              </label>
              <button
                type="button"
                onClick={() => addEnvRow()}
                disabled={submitting}
                title="Add variable"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', borderRadius: '0.3rem', cursor: 'pointer', background: 'transparent', border: '1px solid #262626', color: '#10b981' }}
              >
                +
              </button>
              <button
                type="button"
                onClick={() => removeEnvRow(row.id)}
                disabled={submitting || envRows.length === 1}
                title="Remove variable"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', borderRadius: '0.3rem', cursor: 'pointer', background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}
              >
                −
              </button>
            </div>
          ))}
        </div>

        {formError && (
          <div style={{ padding: '0.6rem 0.8rem', marginBottom: '0.75rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '0.4rem', color: '#ef4444', fontSize: '0.8rem' }}>
            {formError}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary"
          disabled={submitting || infraLoading || (infra && !infra.configured)}
          style={{ width: '100%' }}
        >
          {submitting ? 'Starting deployment…' : '🚀 Deploy Application to EC2'}
        </button>
      </form>

      {/* Deployments list */}
      <h3 style={{ marginBottom: '0.6rem' }}>Deployments</h3>
      {deployments.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No deployments yet.</p>
      ) : (
        deployments.map((d) => {
          const inFlight = IN_FLIGHT.includes(d.status);
          const stageIdx = LIFECYCLE.findIndex((s) => s.key === d.status);
          return (
          <div
            key={d.deploymentId || d.id}
            style={{
              padding: '0.9rem 1rem', marginBottom: '0.75rem', background: '#0a0a0a',
              border: '1px solid #1a1a1a', borderRadius: '0.5rem', fontSize: '0.8rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    padding: '0.15rem 0.55rem', borderRadius: '999px', fontWeight: 700, fontSize: '0.7rem',
                    color: '#0a0a0a', background: statusColor(d.status)
                  }}
                >
                  {d.status}
                </span>
                <code style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{d.deploymentId || d.id}</code>
                {d.instanceType && (
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{d.instanceType}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(d.deploymentId || d.id)}
                disabled={d.status === 'DELETING'}
                style={{
                  padding: '0.25rem 0.7rem', fontSize: '0.72rem', borderRadius: '0.35rem', cursor: 'pointer',
                  background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)'
                }}
              >
                🗑 Terminate
              </button>
            </div>

            <div style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
              {d.imageUri && (
                <>
                  {d.containers} × {d.imageUri}
                  {' '}· host {d.hostPort ?? '?'} → container {d.containerPort ?? '?'}
                  {d.config && d.config.secretKeys && d.config.secretKeys.length > 0 && <> · secrets: {d.config.secretKeys.join(', ')}</>}
                  {d.config && d.config.environmentVariables && Object.keys(d.config.environmentVariables).length > 0 && (
                    <> · env: {Object.keys(d.config.environmentVariables).join(', ')}</>
                  )}
                </>
              )}
            </div>

            {/* Real lifecycle progress */}
            {inFlight && (
              <div style={{ marginTop: '0.6rem' }}>
                <div style={{ height: '6px', background: '#161616', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${d.progress || 0}%`, background: '#f59e0b', transition: 'width 0.6s ease' }} />
                </div>
                <div style={{ marginTop: '0.3rem', fontSize: '0.72rem', color: '#f59e0b' }}>
                  {d.progress || 0}% — {stageLabel(d.status)}
                </div>
                {/* Step checklist */}
                <div style={{ marginTop: '0.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.2rem 0.75rem' }}>
                  {LIFECYCLE.map((s, i) => (
                    <div
                      key={s.key}
                      style={{
                        fontSize: '0.68rem',
                        color: i < stageIdx ? '#10b981' : i === stageIdx ? '#f59e0b' : 'var(--text-secondary)',
                        opacity: i > stageIdx ? 0.55 : 1
                      }}
                    >
                      {i < stageIdx ? '✓' : i === stageIdx ? '●' : '○'} {s.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deployment result card */}
            {d.status === 'DEPLOYED' && (
              <div
                style={{
                  marginTop: '0.6rem', padding: '0.75rem 0.85rem',
                  background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '0.45rem'
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 1rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                  <span style={{ color: '#10b981', fontWeight: 700 }}>DEPLOYED</span>
                  <span style={{ color: 'var(--text-secondary)' }}>Instance</span>
                  <span>{d.instanceId || '—'}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>Public IP</span>
                  <span>{d.publicIp || '—'}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>Ports</span>
                  <span>host {d.hostPort ?? '?'} → container {d.containerPort ?? '?'}{Number(d.containers) > 1 ? ` (+${Number(d.containers) - 1} more)` : ''}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>Image</span>
                  <span style={{ wordBreak: 'break-all' }}>{d.imageUri || '—'}</span>
                </div>

                {(d.urls && d.urls.length > 0 ? d.urls : (d.applicationUrl ? [d.applicationUrl] : [])).map((url, i) => (
                  <div key={url} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#10b981', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700 }}>
                      {url} ↗
                    </a>
                    {Number(d.containers) > 1 && <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>(container {i})</span>}
                    <button
                      type="button"
                      onClick={() => copyUrl(url)}
                      style={{ fontSize: '0.66rem', padding: '0.1rem 0.4rem', borderRadius: '0.3rem', cursor: 'pointer', background: 'transparent', border: '1px solid #262626', color: 'var(--text-secondary)' }}
                    >
                      {copiedUrl === url ? 'copied ✓' : 'copy'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {d.status === 'FAILED' && (
              <div style={{ marginTop: '0.5rem', color: '#ef4444', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                {d.failureStep && <div>Failed at step: {d.failureStep}</div>}
                <div>{d.error}</div>
                <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Partial resources were cleaned up automatically (instance terminated, security group rules and secrets removed).
                </div>
              </div>
            )}

            <div style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setExpandedLogs((prev) => ({ ...prev, [d.deploymentId || d.id]: !expandedLogs[d.deploymentId || d.id] }))}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.72rem', padding: 0 }}
              >
                {expandedLogs[d.deploymentId || d.id] ? '▾ hide logs' : '▸ show logs'}
              </button>
              {expandedLogs[d.deploymentId || d.id] && (
                <pre
                  style={{
                    marginTop: '0.4rem', padding: '0.6rem', background: '#050505', border: '1px solid #161616',
                    borderRadius: '0.35rem', fontSize: '0.68rem', maxHeight: '220px', overflow: 'auto', whiteSpace: 'pre-wrap'
                  }}
                >
                  {(d.logs || []).map((l) => `[${new Date(l.ts).toLocaleTimeString()}] ${l.level.toUpperCase()} ${l.message}`).join('\n') || '(no logs)'}
                </pre>
              )}
            </div>
          </div>
          );
        })
      )}

      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
        ⚠️ Each deployment runs on a billable EC2 instance (t3.micro is free-tier eligible).
        Use <strong>Terminate</strong> to stop it when you are done.
      </p>
    </div>
  );
}
