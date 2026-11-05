import React, { useState, useEffect } from 'react';

export default function DeploymentProgress({ imageName, isComplete }) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    { title: 'Cloning GitHub Repository', desc: 'Fetching code & branches into isolated workspace' },
    { title: 'Deep Framework Inspection', desc: 'Analyzing dependencies, entrypoints, and environment specs' },
    { title: 'Generating Optimized Dockerfile', desc: 'Creating multi-stage container build instructions' },
    { title: 'Executing Docker Build Engine', desc: 'Building image layers & caching dependencies' },
    { title: 'Container Launch & Health Verification', desc: 'Binding host ports & testing local HTTP reachability' }
  ];

  useEffect(() => {
    if (isComplete) {
      setCurrentStep(steps.length);
      return;
    }

    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < steps.length - 1) return prev + 1;
        return prev;
      });
    }, 2800);

    return () => clearInterval(interval);
  }, [isComplete, steps.length]);

  const progressPercent = isComplete ? 100 : Math.min(Math.round(((currentStep + 1) / steps.length) * 100), 95);

  return (
    <div className="glass-card deployment-progress-card" style={{ marginTop: '2rem', padding: '2rem 0', borderBottom: '1px solid #1a1a1a' }}>
      <div className="section-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h3 className="section-title">
            <span className="pulsing-dot" /> ⚡ Deploying {imageName || 'Project'}...
          </h3>
          <p className="section-desc">Automated build & container pipeline in progress</p>
        </div>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
          {progressPercent}%
        </div>
      </div>

      {/* Progress Bar */}
      <div className="progress-track" style={{ width: '100%', height: '4px', background: '#111111', borderRadius: '9999px', overflow: 'hidden', marginBottom: '1.5rem' }}>
        <div
          className="progress-fill"
          style={{
            width: `${progressPercent}%`,
            height: '100%',
            background: '#ffffff',
            transition: 'width 0.5s ease'
          }}
        />
      </div>

      {/* Steps List */}
      <div className="pipeline-steps" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {steps.map((step, idx) => {
          const isDone = idx < currentStep || isComplete;
          const isCurrent = idx === currentStep && !isComplete;

          return (
            <div
              key={idx}
              className={`pipeline-step ${isDone ? 'step-done' : ''} ${isCurrent ? 'step-current' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                background: isCurrent ? '#0a0a0a' : (isDone ? '#050505' : 'transparent'),
                border: isCurrent ? '1px solid #ffffff' : '1px solid #1a1a1a',
                transition: 'all 0.2s ease'
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: isDone ? '#ffffff' : (isCurrent ? '#ffffff' : '#1a1a1a'),
                  color: isDone || isCurrent ? '#000000' : '#888888'
                }}
              >
                {isDone ? '✓' : (isCurrent ? <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }} /> : (idx + 1))}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: isDone ? '#ffffff' : (isCurrent ? '#ffffff' : '#888888') }}>
                  {step.title}
                </div>
                <div style={{ fontSize: '0.775rem', color: '#666666' }}>
                  {step.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
