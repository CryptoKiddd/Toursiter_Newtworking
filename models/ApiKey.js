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
const ApiKey = mongoose.model('ApiKey', apiKeySchema);

module.exports = {
  ApiKey,
   }