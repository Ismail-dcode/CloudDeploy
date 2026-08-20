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
        <ResultCard result={result} />
      </main>
      <footer className="app-footer">
        CloudDeploy Phase 1 &bull; Automated Docker Image Builder
      </footer>
    </div>
  );
}
