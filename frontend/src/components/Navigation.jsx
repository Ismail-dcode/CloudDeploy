import React from 'react';

export default function Navigation({ activeTab, setActiveTab, imageCount = 0, containerCount = 0, deploymentCount = 0 }) {
  return (
    <nav className="nav-switcher">
      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'builder' ? 'nav-tab-btn-active' : ''}`}
        onClick={() => setActiveTab('builder')}
      >
        <span>🛠️ Image Builder Studio</span>
      </button>

      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'registry' ? 'nav-tab-btn-active' : ''}`}
        onClick={() => setActiveTab('registry')}
      >
        <span>📦 Image Registry</span>
        {imageCount > 0 && <span className="badge-count">{imageCount}</span>}
      </button>

      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'containers' ? 'nav-tab-btn-active' : ''}`}
        onClick={() => setActiveTab('containers')}
      >
        <span>🚀 Containers & Deployments</span>
        {containerCount > 0 && <span className="badge-count">{containerCount}</span>}
      </button>

      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'deployments' ? 'nav-tab-btn-active' : ''}`}
        onClick={() => setActiveTab('deployments')}
      >
        <span>🚀 EC2 Deploy</span>
        {deploymentCount > 0 && <span className="badge-count">{deploymentCount}</span>}
      </button>
    </nav>
  );
}
