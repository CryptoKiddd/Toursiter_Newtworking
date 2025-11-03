const mongoose = require('mongoose');

/**
 * API Key Model
 */
const apiKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  clientId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  rateLimit: {
    type: Number,
    default: 100 // requests per hour
  },
  usageCount: {
    type: Number,
    default: 0
  },
  lastUsed: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date
  },
  allowedIPs: [String],
  metadata: {
    type: Map,
    of: String
  },
  contactEmail: String,
  notes: String
});

// Index for performance
apiKeySchema.index({ isActive: 1, expiresAt: 1 });

/**
 * Rate Limit Model (for tracking requests)
 */
const rateLimitSchema = new mongoose.Schema({
  clientId: {
    type: String,
    required: true,
    index: true
  },
  endpoint: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
    expires: 3600 // Auto-delete after 1 hour
  }
});

// Compound index for efficient rate limit queries
rateLimitSchema.index({ clientId: 1, timestamp: 1 });

/**
 * Updated User Model (add clientId field)
 * 
 * Add this to your existing User model:
 */
const updatedUserFields = {
  clientId: {
    type: String,
    index: true,
    // For existing users from web app, this can be null
    // For API-created profiles, this is required
  }
};

const RateLimit = mongoose.model('RateLimit', rateLimitSchema);

module.exports = {
  RateLimit,

  updatedUserFields }