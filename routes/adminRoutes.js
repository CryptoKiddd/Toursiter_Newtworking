// routes/adminRoutes.js

const express = require('express');
const router = express.Router();
const {
  createApiKey,
  listApiKeys,
  getApiKey,
  updateApiKey,
  deleteApiKey,
  regenerateApiKey,
  getStats
} = require('../controllers/adminController');

/**
 * Admin routes for managing API keys
 * All routes require JWT authentication (protect middleware applied in server.js)
 */

// Get overview statistics
router.get('/stats', getStats);

// API Key management
router.post('/keys', createApiKey);
router.get('/keys', listApiKeys);
router.get('/keys/:clientId', getApiKey);
router.put('/keys/:clientId', updateApiKey);
router.delete('/keys/:clientId', deleteApiKey);
router.post('/keys/:clientId/regenerate', regenerateApiKey);

module.exports = router;