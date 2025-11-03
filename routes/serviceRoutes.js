const express = require('express');
const router = express.Router();
const { authenticateApiKey, rateLimitByApiKey } = require('../middleware/apiKeyAuth');
const {
  createProfile,
  getProfile,
  listProfiles,
  findMatches,
  compareProfiles
} = require('../controllers/serviceController');

/**
 * Apply API key authentication and rate limiting to all routes
 */

router.use(authenticateApiKey);
router.use(rateLimitByApiKey);

/**
 * Profile Management Routes
 */

// Create new profile from LinkedIn
router.post('/profiles', createProfile);

// Get specific profile
router.get('/profiles/:profileId', getProfile);

// List all profiles for this client
router.get('/profiles', listProfiles);

/**
 * Matching Routes
 */

// Find collaboration matches for a profile
router.post('/matches', findMatches);

// Compare two profiles
router.post('/matches/compare', compareProfiles);

/**
 * Health check endpoint (no auth required)
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

module.exports = router;