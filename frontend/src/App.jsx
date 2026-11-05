import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Navigation from './components/Navigation';
import BuildForm from './components/BuildForm';
import ResultCard from './components/ResultCard';
import ImageRegistry from './components/ImageRegistry';
import ContainersDashboard from './components/ContainersDashboard';
import DeployModal from './components/DeployModal';
import DeploymentProgress from './components/DeploymentProgress';
import EcrPushModal from './components/EcrPushModal';
import Ec2DeployConsole from './components/Ec2DeployConsole';
import LandingPage from './components/LandingPage';

export default function App() {
  // Persist active view across page refreshes (F5)
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem('clouddeploy_view') || 'landing';
    } catch (e) {
      return 'landing';
    }
  });

  // Persist active tab across page refreshes (F5)
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem('clouddeploy_tab') || 'builder';
    } catch (e) {
      return 'builder';
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [activeBuildingImage, setActiveBuildingImage] = useState('');
  const [result, setResult] = useState(null);

  const [images, setImages] = useState([]);
  const [containers, setContainers] = useState([]);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [preselectedImage, setPreselectedImage] = useState(null);

  // ECR push modal: holds the local image + deployment ID to tag/push with
  const [ecrPushTarget, setEcrPushTarget] = useState(null); // { imageName, deploymentId }

  // EC2 deployments (status list + prefill for the deploy console)
  const [deployments, setDeployments] = useState([]);
  const [ec2DeployPrefill, setEc2DeployPrefill] = useState(null);

  // Sync state changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('clouddeploy_view', view);
    } catch (e) {}
  }, [view]);

  useEffect(() => {
    try {
      localStorage.setItem('clouddeploy_tab', activeTab);
    } catch (e) {}
  }, [activeTab]);

  // Fetch images catalog
  const fetchImages = async () => {
    try {
      const res = await fetch('/api/images');
      const data = await res.json();
      if (data.success) {
        setImages(data.images || []);
      }
    } catch (err) {
      console.error('Failed to fetch images:', err);
    }
  };

  // Fetch containers catalog
  const fetchContainers = async () => {
    try {
      const res = await fetch('/api/containers');
      const data = await res.json();
      if (data.success) {
        setContainers(data.containers || []);
      }
    } catch (err) {
      console.error('Failed to fetch containers:', err);
    }
  };

  // Fetch EC2 deployments catalog
  const fetchDeployments = async () => {
    try {
      const res = await fetch('/api/deployments');
      const data = await res.json();
      if (data.success) {
        setDeployments(data.deployments || []);
      }
    } catch (err) {
      console.error('Failed to fetch deployments:', err);
    }
  };

  useEffect(() => {
    fetchImages();
    fetchContainers();
    fetchDeployments();

    const timer = setInterval(() => {
      fetchContainers();
    }, 10000);

    return () => clearInterval(timer);
  }, []);

  // Lifecycle statuses that are still in flight (API returns them uppercase)
  const IN_FLIGHT_STATUSES = ['PENDING', 'PROVISIONING', 'INSTANCE_RUNNING', 'DOCKER_INSTALLING', 'PULLING_IMAGE', 'STARTING_CONTAINER', 'HEALTH_CHECK'];

  // Poll deployments while any is in flight (progress tracking)
  const hasActiveDeployment = deployments.some((d) => IN_FLIGHT_STATUSES.includes(d.status));
  useEffect(() => {
    if (!hasActiveDeployment) return undefined;
    const timer = setInterval(fetchDeployments, 5000);
    return () => clearInterval(timer);
  }, [hasActiveDeployment]);

  // Mechanism 1: Build Docker Image
  const handleBuild = async (formData) => {
    setIsLoading(true);
    setActiveBuildingImage(formData.imageName || 'Project');
    setResult(null);

    try {
      const response = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      setResult(data);
      await fetchImages();
      await fetchContainers();
    } catch (err) {
      console.error('Failed to build image:', err);
      setResult({
        success: false,
        message: 'Network error or CloudDeploy server unavailable.',
        error: err.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Delete Image
  const handleDeleteImage = async (imageId) => {
    try {
      const res = await fetch(`/api/images/${imageId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await fetchImages();
      }
    } catch (err) {
      console.error('Failed to delete image:', err);
    }
  };

  // Open deploy modal for a specific image
  const handleOpenDeployModal = (imageObj = null) => {
    setView('console');
    setPreselectedImage(imageObj);
    setDeployModalOpen(true);
  };

  // Mechanism 3: Push a built image to Amazon ECR (GitHub → Docker → ECR)
  const handleOpenEcrPush = (imageObj = null) => {
    if (!imageObj || !imageObj.imageName) return;
    setEcrPushTarget({
      imageName: imageObj.imageName,
      // Unique deployment ID used as the ECR image tag
      deploymentId: imageObj.id || `dep_${Date.now()}`
    });
  };

  // Refresh registry after a successful push so the ECR URI is persisted,
  // and mirror the ECR status onto the current build result card.
  const handleEcrPushed = async (pushData) => {
    await fetchImages();
    if (pushData && pushData.deploymentId) {
      setResult((prev) =>
        prev && prev.image && prev.image.id === pushData.deploymentId
          ? {
              ...prev,
              ecrImageUri: pushData.imageUri,
              ecrTag: pushData.tag,
              ecrStatus: pushData.ecrStatus || 'pushed'
            }
          : prev
      );
    }
  };

  // Opens the EC2 deploy console pre-filled for an image that has an ECR URI
  const handleOpenEc2Deploy = (imageObj) => {
    if (!imageObj || !imageObj.ecrImageUri) return;
    setEcrPushTarget(null);
    setEc2DeployPrefill({
      imageUri: imageObj.ecrImageUri,
      appPort: imageObj.appPort || null
    });
    setView('console');
    setActiveTab('deployments');
  };

  // Mechanism 4: After a successful ECR push, open the EC2 deploy console
  const handleDeployNow = (pushData = {}) => {
    const record = images.find((img) => img.id === pushData.deploymentId)
      || images.find((img) => img.ecrImageUri === pushData.imageUri)
      || null;

    handleOpenEc2Deploy({
      ecrImageUri: pushData.imageUri || (record && record.ecrImageUri) || '',
      appPort: record ? record.appPort : null
    });
  };

  // Mechanism 2: Deploy Container Instance
  const handleDeployContainer = async (deployPayload) => {
    try {
      const res = await fetch('/api/containers/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deployPayload)
      });
      const data = await res.json();
      if (data.success) {
        await fetchContainers();
        setActiveTab('containers');
        return true;
      } else {
        alert(`Failed to deploy container: ${data.message} ${data.error ? `(${data.error})` : ''}`);
        return false;
      }
    } catch (err) {
      console.error('Deploy container failed:', err);
      alert(`Deploy container error: ${err.message}`);
      return false;
    }
  };

  // Stop Container
  const handleStopContainer = async (containerName) => {
    try {
      const res = await fetch(`/api/containers/${containerName}/stop`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        alert(`Failed to stop container: ${data.message || data.error}`);
      }
      await fetchContainers();
    } catch (err) {
      console.error('Failed to stop container:', err);
    }
  };

  // Start Container
  const handleStartContainer = async (containerName) => {
    try {
      const res = await fetch(`/api/containers/${containerName}/start`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        alert(`Failed to start container: ${data.message || data.error}`);
      }
      await fetchContainers();
    } catch (err) {
      console.error('Failed to start container:', err);
    }
  };

  // Remove Container
  const handleRemoveContainer = async (containerName) => {
    try {
      const res = await fetch(`/api/containers/${containerName}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        alert(`Failed to remove container: ${data.message || data.error}`);
      }
      await fetchContainers();
    } catch (err) {
      console.error('Failed to remove container:', err);
    }
  };

  return (
    <div className="app-container">
      <Header
        activeView={view}
        onSwitchView={setView}
        imageCount={images.length}
        containerCount={containers.filter((c) => c.status === 'running').length}
        onOpenDeployModal={() => handleOpenDeployModal(null)}
      />

      {view === 'landing' ? (
        <LandingPage onGoToConsole={() => setView('console')} />
      ) : (
        <>
          <Navigation
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            imageCount={images.length}
            containerCount={containers.length}
            deploymentCount={deployments.length}
          />

          <main>
            {activeTab === 'builder' && (
              <>
                <BuildForm onSubmit={handleBuild} isLoading={isLoading} />
                {isLoading && (
                  <DeploymentProgress imageName={activeBuildingImage} isComplete={false} />
                )}
                <ResultCard
                  result={result}
                  onDeployImage={handleOpenDeployModal}
                  onPushToEcr={handleOpenEcrPush}
                />
              </>
            )}

            {activeTab === 'registry' && (
              <ImageRegistry
                images={images}
                onDeleteImage={handleDeleteImage}
                onDeployImage={handleOpenDeployModal}
                onPushToEcr={handleOpenEcrPush}
                onDeployToEc2={handleOpenEc2Deploy}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'deployments' && (
              <Ec2DeployConsole
                images={images}
                deployments={deployments}
                onRefresh={fetchDeployments}
                prefill={ec2DeployPrefill}
                onPrefillUsed={() => setEc2DeployPrefill(null)}
              />
            )}

            {activeTab === 'containers' && (
              <ContainersDashboard
                containers={containers}
                onStopContainer={handleStopContainer}
                onStartContainer={handleStartContainer}
                onRemoveContainer={handleRemoveContainer}
                onOpenDeployModal={() => handleOpenDeployModal(null)}
                onRefresh={fetchContainers}
              />
            )}
          </main>
        </>
      )}

      <DeployModal
        isOpen={deployModalOpen}
        onClose={() => setDeployModalOpen(false)}
        images={images}
        preselectedImage={preselectedImage}
        onDeployContainer={handleDeployContainer}
      />

      <EcrPushModal
        isOpen={Boolean(ecrPushTarget)}
        onClose={() => setEcrPushTarget(null)}
        onPushed={handleEcrPushed}
        onDeployNow={handleDeployNow}
        imageName={ecrPushTarget ? ecrPushTarget.imageName : ''}
        deploymentId={ecrPushTarget ? ecrPushTarget.deploymentId : ''}
      />

      <footer className="app-footer">
        ⚡ CloudDeploy Platform &bull; Automated Multi-Stack Container Orchestration Engine
      </footer>
    </div>
  );
}
