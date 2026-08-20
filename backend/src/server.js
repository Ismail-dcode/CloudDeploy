const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const buildRouter = require('./routes/build');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', buildRouter);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'CloudDeploy Backend', version: 'Phase 1' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`CloudDeploy Phase 1 Backend running on port ${PORT}`);
});
