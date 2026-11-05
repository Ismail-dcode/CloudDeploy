import React from 'react';

export default function Header({
  activeView,
  onSwitchView,
  imageCount = 0,
  containerCount = 0,
  onOpenDeployModal
}) {
  return (
    <header className="top-nav" style={{ flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.25rem' }}>
      <div className="brand-section" style={{ cursor: 'pointer' }} onClick={() => onSwitchView('landing')}>
        <div className="brand-icon">⚡</div>
        <div>
          <h1 className="brand-title" style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.03em' }}>CloudDeploy</h1>
        </div>
      </div>

      {/* Main Aether-Style Navigation Links */}
      <nav className="header-links" style={{ display: 'flex', alignItems: 'center', gap: '1.75rem', fontSize: '0.875rem', fontWeight: 500 }}>
        <a
          href="#why-i-built"
          onClick={() => { if (activeView !== 'landing') onSwitchView('landing'); }}
          style={{ color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.15s ease' }}
          onMouseEnter={(e) => e.target.style.color = '#ffffff'}
          onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
        >
          Features
        </a>
        <a
          href="#how-it-works"
          onClick={() => { if (activeView !== 'landing') onSwitchView('landing'); }}
          style={{ color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.15s ease' }}
          onMouseEnter={(e) => e.target.style.color = '#ffffff'}
          onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
        >
          How It Works
        </a>
        <a
          href="#docs"
          onClick={() => { if (activeView !== 'landing') onSwitchView('landing'); }}
          style={{ color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.15s ease' }}
          onMouseEnter={(e) => e.target.style.color = '#ffffff'}
          onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
        >
          Docs
        </a>
        <a
          href="#pricing"
          onClick={() => { if (activeView !== 'landing') onSwitchView('landing'); }}
          style={{ color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.15s ease' }}
          onMouseEnter={(e) => e.target.style.color = '#ffffff'}
          onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
        >
          Pricing
        </a>
        <a
          href="#faqs"
          onClick={() => { if (activeView !== 'landing') onSwitchView('landing'); }}
          style={{ color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.15s ease' }}
          onMouseEnter={(e) => e.target.style.color = '#ffffff'}
          onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
        >
          FAQ
        </a>
      </nav>

      <div className="nav-stats" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {activeView === 'console' ? (
          <>
            <div className="stat-pill">
              <span style={{ color: 'var(--text-muted)' }}>Images:</span>
              <span className="stat-number">{imageCount}</span>
            </div>
            <div className="stat-pill">
              <span className="pulsing-dot" />
              <span style={{ color: 'var(--text-muted)' }}>Containers:</span>
              <span className="stat-number">{containerCount}</span>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onSwitchView('landing')}
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              Home
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={() => onSwitchView('console')}
            style={{ fontSize: '0.875rem', padding: '0.55rem 1.25rem', borderRadius: '0.5rem' }}
          >
            Launch Console &rarr;
          </button>
        )}
      </div>
    </header>
  );
}
