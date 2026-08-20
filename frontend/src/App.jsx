import React, { useState } from 'react';
import Header from './components/Header';
import BuildForm from './components/BuildForm';
import ResultCard from './components/ResultCard';

export default function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleBuild = async (formData) => {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/build', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      setResult(data);
    } catch (err) {
      console.error('Failed to communicate with CloudDeploy server:', err);
      setResult({
        success: false,
        message: 'Network error or CloudDeploy server unavailable.',
        error: err.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <Header />
      <main>
        <BuildForm onSubmit={handleBuild} isLoading={isLoading} />
        {isLoading && (
          <div className="glass-card" style={{ marginTop: '1.5rem', textAlign: 'center', padding: '2rem 1.5rem' }}>
            <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '3px', margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Building & Launching Container...
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '550px', margin: '0 auto' }}>
              Cloning repository, auto-detecting stack, executing <code>npm install</code> & <code>npm run build</code> inside multi-stage Docker builder. This may take 1 to 3 minutes.
            </p>
          </div>
        )}
        <ResultCard result={result} />
      </main>
      <footer className="app-footer">
        CloudDeploy Phase 1 &bull; Automated Docker Image Builder
      </footer>
    </div>
  );
}
