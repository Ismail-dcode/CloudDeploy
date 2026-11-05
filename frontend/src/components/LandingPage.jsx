import React, { useState } from 'react';

export default function LandingPage({ onGoToConsole }) {
  const [openFaq, setOpenFaq] = useState(null);
  const [copied, setCopied] = useState(false);

  const toggleFaq = (idx) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  const handleCopyCmd = async () => {
    try {
      if (navigator && navigator.clipboard) {
        await navigator.clipboard.writeText('npx create-clouddeploy-app@latest');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Copy to clipboard failed:', err);
    }
  };

  const faqs = [
    {
      q: 'Why was CloudDeploy created?',
      a: 'CloudDeploy was created to eliminate manual Dockerfile writing, complex environment setup, and port configuration headaches when deploying or demonstrating projects from GitHub.'
    },
    {
      q: 'How does it help freelancers presenting to clients?',
      a: 'Freelancers can instantly deploy live working apps on isolated host ports and send direct demo URLs to clients without sharing source code, server credentials, or requiring client-side setup!'
    },
    {
      q: 'Can I run multiple container instances from the same image?',
      a: "Yes! CloudDeploy's Multi-Container Engine allows launching multiple container instances on distinct host ports (e.g. 8080, 8081, 8082) with separate environment variables from a single built image."
    },
    {
      q: 'Which frameworks and languages are automatically supported?',
      a: 'Zero-config support for FastAPI, Django, Flask, Streamlit, Gradio, Node.js/Express, React/Vite SPAs, Go web servers, and static Nginx web sites.'
    },
    {
      q: 'Are my built images and container states persistent?',
      a: 'Yes! Image records and container deployment metadata are stored locally in images.json and containers.json, keeping your deployments intact across backend restarts.'
    }
  ];

  const supportedStacks = [
    { name: 'FastAPI', category: 'Python', defaultPort: 8000, icon: '⚡' },
    { name: 'Django', category: 'Python', defaultPort: 8000, icon: '🐍' },
    { name: 'Flask', category: 'Python', defaultPort: 5000, icon: '🧪' },
    { name: 'Streamlit', category: 'Python ML/AI', defaultPort: 8501, icon: '📊' },
    { name: 'Gradio', category: 'Python AI', defaultPort: 7860, icon: '🤖' },
    { name: 'Node.js / Express', category: 'Backend', defaultPort: 3000, icon: '🟢' },
    { name: 'React / Vite', category: 'Frontend SPA', defaultPort: 80, icon: '⚛️' },
    { name: 'Go Web Server', category: 'Backend', defaultPort: 8080, icon: '🐹' },
    { name: 'Static Nginx', category: 'Web Server', defaultPort: 80, icon: '🌐' }
  ];

  const pricingTiers = [
    {
      name: 'Developer Free',
      price: '$0',
      period: 'forever',
      desc: 'Ideal for local container testing and multi-stack experiments.',
      features: [
        'Unlimited GitHub Repository Clones',
        'Automatic Framework Detection',
        'Up to 5 Active Local Containers',
        'Built Images Registry Datafile Storage',
        'Real-Time Host Port Checker'
      ],
      buttonText: 'Start Free Deployments',
      highlighted: false
    },
    {
      name: 'Pro Builder',
      price: '$19',
      period: 'per month',
      desc: 'For freelancers & power developers running client demo containers.',
      features: [
        'Everything in Free Plan',
        'Unlimited Multi-Instance Containers',
        'Custom Environment Secrets Injection',
        'Live Terminal Log Streaming',
        'Multi-Stage Nginx Build Optimization',
        'Priority Container Reachability Checks'
      ],
      buttonText: 'Launch Pro Console',
      highlighted: true
    },
    {
      name: 'Enterprise Cluster',
      price: '$99',
      period: 'per month',
      desc: 'Dedicated local container orchestrator for engineering teams.',
      features: [
        'Everything in Pro Plan',
        'Multi-Node Container Clustering',
        'Custom Docker Registry Mirrors',
        'Dedicated Health Check Webhooks',
        '24/7 SLA & Team Support'
      ],
      buttonText: 'Contact Sales',
      highlighted: false
    }
  ];

  return (
    <div className="landing-page" style={{ color: '#ffffff' }}>
      {/* Aether-Style Expansive Hero Section */}
      <section className="hero-section" style={{ padding: '4rem 0 5rem 0', textAlign: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
        {/* Top Pill Announcement */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 1.1rem', background: '#0a0d20', border: '1px solid rgba(99, 102, 241, 0.35)', borderRadius: '9999px', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '2.5rem', boxShadow: '0 0 20px rgba(99, 102, 241, 0.15)' }}>
          <span className="pulsing-dot" />
          <span>Announcing CloudDeploy 2.0 with Real-Time Multi-Container Workflows →</span>
        </div>

        {/* Main Headline */}
        <h1 style={{ fontSize: '3.8rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1, maxWidth: '900px', margin: '0 auto 1.5rem auto', color: '#ffffff' }}>
          Orchestrate Multi-Stack Workloads at{' '}
          <span style={{ background: 'linear-gradient(135deg, #6366f1 0%, #38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Production Scale
          </span>
        </h1>

        {/* Subtext */}
        <p style={{ fontSize: '1.15rem', color: '#94a3b8', maxWidth: '740px', margin: '0 auto 2.5rem auto', lineHeight: 1.6 }}>
          Build, run, and scale self-healing multi-container workloads with sub-second setup, zero-trust port sandboxing, and real-time observability for modern engineering teams & freelancers.
        </p>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'center', alignItems: 'center', marginBottom: '2.5rem' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onGoToConsole()}
            style={{ fontSize: '1rem', padding: '0.9rem 2rem', borderRadius: '0.6rem', boxShadow: 'var(--btn-glow)' }}
          >
            Start Building Free →
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onGoToConsole()}
            style={{ fontSize: '1rem', padding: '0.9rem 2rem', borderRadius: '0.6rem', background: '#0e1124', border: '1px solid #1a1e3b' }}
          >
            ▷ Book Live Demo
          </button>
        </div>

        {/* Terminal Command Pill */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 1.25rem', background: '#070917', border: '1px solid #1a1e3b', borderRadius: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#38bdf8', marginBottom: '3.5rem' }}>
          <span>$ npx create-clouddeploy-app@latest</span>
          <button
            type="button"
            onClick={handleCopyCmd}
            title="Copy command"
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem', padding: '0.1rem 0.3rem' }}
          >
            {copied ? '✓' : '📋'}
          </button>
        </div>

        {/* Aether-Style Mac Terminal Emulator Block */}
        <div style={{ maxWidth: '880px', margin: '0 auto', background: '#080a18', border: '1px solid #1c2140', borderRadius: '0.85rem', overflow: 'hidden', textAlign: 'left', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 1.1rem', background: '#0d1024', borderBottom: '1px solid #1c2140' }}>
            <div style={{ display: 'flex', gap: '0.45rem' }}>
              <div style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#ef4444' }} />
              <div style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#f59e0b' }} />
              <div style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#10b981' }} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#94a3b8' }}>
              ⚡ clouddeploy-engine v2.4.0 (us-east-1)
            </div>
            <div style={{ fontSize: '0.725rem', color: '#64748b', fontFamily: 'var(--font-mono)', background: 'rgba(255,255,255,0.05)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              Running ||
            </div>
          </div>

          <div style={{ padding: '1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.825rem', lineHeight: 1.7, color: '#e2e8f0', background: '#060713' }}>
            <div style={{ color: '#38bdf8', marginBottom: '0.4rem' }}>
              $ clouddeploy deploy --repo https://github.com/user/ai-microservice --port 8080
            </div>
            <div style={{ color: '#94a3b8' }}>
              [00:01] 🚀 Initializing multi-stack topology: 4 Workers + 1 Orchestrator...
            </div>
            <div style={{ color: '#10b981' }}>
              [00:02] 🔒 Sandboxing host port 8080: TCP Socket verified free & ready
            </div>
            <div style={{ color: '#a5b4fc' }}>
              [00:03] ⚡ Auto-Detected Framework: FastAPI (Python 3.11 + Uvicorn)
            </div>
            <div style={{ color: '#38bdf8' }}>
              [00:04] 🐳 Multi-Stage Dockerfile generated & image built: ai-microservice:latest
            </div>
            <div style={{ color: '#10b981', fontWeight: 700 }}>
              [00:05] ✓ Container instance running on http://localhost:8080 (Probe 200 OK)
            </div>
          </div>
        </div>
      </section>

      {/* WHY I BUILT & WHAT PROBLEM IT SOLVES DOCUMENTATION SECTION */}
      <section id="why-i-built" style={{ padding: '5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#ffffff', marginBottom: '0.75rem' }}>
            Project Story & Purpose
          </h2>
          <p style={{ fontSize: '1rem', color: '#94a3b8', maxWidth: '720px', lineHeight: 1.6 }}>
            Why CloudDeploy was built and the core developer & freelancer problems it solves
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
          {/* Card 1: Why I Built */}
          <div className="registry-card" style={{ padding: '2.25rem' }}>
            <div>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem' }}>💡</div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: '700', color: '#ffffff', marginBottom: '0.75rem' }}>
                Why I Built CloudDeploy
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#94a3b8', lineHeight: 1.7 }}>
                Writing custom Dockerfiles, troubleshooting missing runtime dependencies, and managing local environment configs for every new project takes hours of setup.
              </p>
              <p style={{ fontSize: '0.9rem', color: '#94a3b8', lineHeight: 1.7, marginTop: '0.75rem' }}>
                I built CloudDeploy to give developers a <strong style={{ color: '#ffffff' }}>1-click automated deployment workflow</strong> for any GitHub repository right on their machine.
              </p>
            </div>
          </div>

          {/* Card 2: What Problem Solved */}
          <div className="registry-card" style={{ padding: '2.25rem' }}>
            <div>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem' }}>🛠️</div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: '700', color: '#ffffff', marginBottom: '0.75rem' }}>
                What Problems It Solves
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                  <span style={{ color: '#6366f1', fontWeight: '700', lineHeight: 1.4 }}>✓</span>
                  <span><strong style={{ color: '#ffffff' }}>Zero Manual Dockerfiles:</strong> Auto-detects Python, Node.js, Vite, and Go to write multi-stage Dockerfiles.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                  <span style={{ color: '#6366f1', fontWeight: '700', lineHeight: 1.4 }}>✓</span>
                  <span><strong style={{ color: '#ffffff' }}>No Port Collisions:</strong> Real-time TCP port availability checking before container spin-up.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                  <span style={{ color: '#6366f1', fontWeight: '700', lineHeight: 1.4 }}>✓</span>
                  <span><strong style={{ color: '#ffffff' }}>Multi-Instance Scaling:</strong> Run multiple container instances from the same built image with custom env secrets.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Card 3: Useful For */}
          <div className="registry-card" style={{ padding: '2.25rem' }}>
            <div>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem' }}>💼</div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: '700', color: '#ffffff', marginBottom: '0.75rem' }}>
                Who It Is Useful For
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                  <span style={{ color: '#38bdf8', fontWeight: '700', lineHeight: 1.4 }}>⚡</span>
                  <span><strong style={{ color: '#ffffff' }}>Quick Demo & Deployments:</strong> Spin up working URLs in under 30 seconds straight from Git.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                  <span style={{ color: '#38bdf8', fontWeight: '700', lineHeight: 1.4 }}>💼</span>
                  <span><strong style={{ color: '#ffffff' }}>Freelancers & Agencies:</strong> Show live working results to customers without handing over full source code or complex setup scripts.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                  <span style={{ color: '#38bdf8', fontWeight: '700', lineHeight: 1.4 }}>🧪</span>
                  <span><strong style={{ color: '#ffffff' }}>AI & Full-Stack Developers:</strong> Test Streamlit/Gradio AI models, FastAPI microservices, and React SPAs side-by-side.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Pipeline Section */}
      <section id="how-it-works" style={{ padding: '5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#ffffff', marginBottom: '0.5rem' }}>
            How CloudDeploy Works
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#94a3b8' }}>
            Three simple steps to transform raw code into running container instances
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
          <div className="registry-card" style={{ padding: '2rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.85rem' }}>
              Step 01
            </div>
            <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.5rem' }}>
              Import GitHub Repository
            </h4>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.6 }}>
              Paste your public GitHub URL. CloudDeploy automatically extracts your project slug name and pre-fills build configurations.
            </p>
          </div>

          <div className="registry-card" style={{ padding: '2rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.85rem' }}>
              Step 02
            </div>
            <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.5rem' }}>
              Auto-Scan & Build Docker Image
            </h4>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.6 }}>
              The engine deep-scans dependencies, generates an optimized Dockerfile, builds the Docker image, and saves metadata to images.json.
            </p>
          </div>

          <div className="registry-card" style={{ padding: '2rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.85rem' }}>
              Step 03
            </div>
            <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.5rem' }}>
              Launch Multi-Port Containers
            </h4>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.6 }}>
              Run isolated container instances on custom host free ports with custom environment secrets and test live HTTP reachability.
            </p>
          </div>
        </div>
      </section>

      {/* Supported Stacks & Documentation Section */}
      <section id="docs" style={{ padding: '5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#ffffff', marginBottom: '0.5rem' }}>
            Supported Framework Specs
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#94a3b8' }}>
            Zero-config support for web, ML, and microservice stacks
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1.25rem' }}>
          {supportedStacks.map((stack, idx) => (
            <div key={idx} className="registry-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '1.5rem' }}>{stack.icon}</span>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>{stack.name}</div>
                <div style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
                  {stack.category} &bull; EXPOSE {stack.defaultPort}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" style={{ padding: '5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#ffffff', marginBottom: '0.5rem' }}>
            Pricing Plans
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#94a3b8' }}>
            Simple, transparent plans for individual developers and teams
          </p>
        </div>

        <div className="cards-grid">
          {pricingTiers.map((tier, idx) => (
            <div
              key={idx}
              className="registry-card"
              style={{
                border: tier.highlighted ? '1px solid #6366f1' : '1px solid var(--border-subtle)',
                boxShadow: tier.highlighted ? '0 8px 30px rgba(99, 102, 241, 0.25)' : 'none',
                position: 'relative'
              }}
            >
              {tier.highlighted && (
                <div style={{ position: 'absolute', top: '-12px', right: '15px', background: 'var(--btn-gradient)', color: '#ffffff', padding: '0.15rem 0.65rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', boxShadow: '0 2px 10px rgba(99, 102, 241, 0.4)' }}>
                  Popular
                </div>
              )}

              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.35rem' }}>
                  {tier.name}
                </h3>
                <p style={{ fontSize: '0.825rem', color: '#94a3b8', marginBottom: '1.25rem', minHeight: '38px' }}>
                  {tier.desc}
                </p>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', marginBottom: '1.5rem' }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#ffffff' }}>{tier.price}</span>
                  <span style={{ fontSize: '0.825rem', color: '#94a3b8' }}>/ {tier.period}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.75rem' }}>
                  {tier.features.map((feat, fIdx) => (
                    <div key={fIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem', color: '#cbd5e1' }}>
                      <span style={{ color: '#6366f1', fontWeight: 700 }}>✓</span>
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className={tier.highlighted ? 'btn-primary' : 'btn-secondary'}
                onClick={() => onGoToConsole()}
                style={{ width: '100%', padding: '0.75rem' }}
              >
                {tier.buttonText}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faqs" style={{ padding: '5rem 0' }}>
        <div style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#ffffff', marginBottom: '0.5rem' }}>
            Frequently Asked Questions
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#94a3b8' }}>
            Everything you need to know about CloudDeploy
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;

            return (
              <div
                key={idx}
                className="registry-card"
                style={{
                  padding: 0,
                  overflow: 'hidden'
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1.25rem 1.5rem',
                    background: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <span>{faq.q}</span>
                  <span style={{ transition: 'transform 0.2s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: '#94a3b8', marginLeft: '1rem' }}>
                    ▼
                  </span>
                </button>

                {isOpen && (
                  <div style={{ padding: '0 1.5rem 1.25rem 1.5rem', fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.6, borderTop: '1px solid var(--border-subtle)', paddingTop: '0.85rem' }}>
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
