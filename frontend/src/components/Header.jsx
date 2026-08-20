import React from 'react';

export default function Header() {
  return (
    <header className="app-header">
      <div className="brand-badge">
        <span>⚡ CloudDeploy</span>
        <span style={{ opacity: 0.5 }}>|</span>
        <span>Phase 1</span>
      </div>
      <h1 className="app-title">CloudDeploy</h1>
      <p className="app-subtitle">Build your GitHub project into a Docker image.</p>
    </header>
  );
}
