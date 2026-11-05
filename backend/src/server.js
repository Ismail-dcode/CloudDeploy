const express = require('express');
const cors = require('cors');
require('dotenv').config();

const buildRouter = require('./routes/build');
const containersRouter = require('./routes/containers');
const ecrRouter = require('./routes/ecr');
const deploymentsRouter = require('./routes/deployments');
const { reconcileInterruptedDeployments } = require('./services/ec2DeployService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', buildRouter);
app.use('/api/containers', containersRouter);
app.use('/api/ecr', ecrRouter);
app.use('/api/deployments', deploymentsRouter);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'CloudDeploy Engine', version: '1.0.0' });
});

// Resume/fail any deployment that was in-flight when the backend restarted
try {
  reconcileInterruptedDeployments();
} catch (err) {
  console.error('[EC2-DEPLOY] Could not reconcile interrupted deployments:', err.message);
}

// Start Server
app.listen(PORT, () => {
  console.log(`CloudDeploy Backend running on port ${PORT}`);
});
