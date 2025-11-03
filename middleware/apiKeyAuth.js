const crypto = require('crypto');
const { ApiKey } = require('../models/ApiKey');

/**
 * API Key Model Schema (add to your models)
 * 
 * const apiKeySchema = new mongoose.Schema({
 *   key: { type: String, required: true, unique: true },
 *   name: { type: String, required: true },
 *   clientId: { type: String, required: true },
 *   isActive: { type: Boolean, default: true },
 *   rateLimit: { type: Number, default: 100 }, // requests per hour
 *   usageCount: { type: Number, default: 0 },
 *   lastUsed: { type: Date },
 *   createdAt: { type: Date, default: Date.now },
 *   expiresAt: { type: Date },
 *   allowedIPs: [String],
 *   metadata: { type: Map, of: String }
 * });
 */

/**
 * Generate a secure API key
 */
const generateApiKey = (prefix = 'sk') => {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `${prefix}_${randomBytes}`;
};

/**
 * API Key Authentication Middleware
 */
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key is required',
        code: 'MISSING_API_KEY'
      });
    }

    // Import your ApiKey model here
   
    
    const keyDoc = await ApiKey.findOne({ key: apiKey });

    if (!keyDoc) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
    }

    // Check if key is active
    if (!keyDoc.isActive) {
      return res.status(403).json({
        success: false,
        error: 'API key is disabled',
        code: 'DISABLED_API_KEY'
      });
    }

    // Check expiration
    if (keyDoc.expiresAt && new Date() > keyDoc.expiresAt) {
      return res.status(403).json({
        success: false,
        error: 'API key has expired',
        code: 'EXPIRED_API_KEY'
      });
    }

    // Check IP whitelist if configured
    if (keyDoc.allowedIPs && keyDoc.allowedIPs.length > 0) {
      const clientIP = req.ip || req.connection.remoteAddress;
      if (!keyDoc.allowedIPs.includes(clientIP)) {
        return res.status(403).json({
          success: false,
          error: 'IP address not allowed',
          code: 'IP_NOT_ALLOWED'
        });
      }
    }

    // Update usage stats
    keyDoc.usageCount += 1;
    keyDoc.lastUsed = new Date();
    await keyDoc.save();

    // Attach client info to request
    req.apiClient = {
      clientId: keyDoc.clientId,
      name: keyDoc.name,
      rateLimit: keyDoc.rateLimit
    };

    next();
  } catch (error) {
    console.error('API Key authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Rate limiting middleware for API keys
 */
const rateLimitByApiKey = async (req, res, next) => {
  try {
    
   const { RateLimit } = require('../models/RateLimit');
    const clientId = req.apiClient.clientId;
    const now = new Date();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);

    // Count requests in the last hour
    const requestCount = await RateLimit.countDocuments({
      clientId,
      timestamp: { $gte: oneHourAgo }
    });

    if (requestCount >= req.apiClient.rateLimit) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        limit: req.apiClient.rateLimit,
        retryAfter: 3600 // seconds
      });
    }

    // Log this request
    await RateLimit.create({
      clientId,
      endpoint: req.path,
      timestamp: now
    });

    next();
  } catch (error) {
    console.error('Rate limit error:', error);
    next(); // Continue even if rate limiting fails
  }
};

module.exports = {
  generateApiKey,
  authenticateApiKey,
  rateLimitByApiKey
};