const { ApiKey } = require('../models/ApiKey');
const { generateApiKey } = require('../middleware/apiKeyAuth');

/**
 * @route   POST /api/admin/keys
 * @desc    Create new API key
 * @access  Admin only
 */
const createApiKey = async (req, res) => {
  try {
    const {
      name,
      clientId,
      rateLimit = 100,
      expiresInDays,
      allowedIPs = [],
      contactEmail,
      notes
    } = req.body;

    if (!name || !clientId) {
      return res.status(400).json({
        success: false,
        error: 'name and clientId are required'
      });
    }

    // Check if clientId already exists
    const existing = await ApiKey.findOne({ clientId });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Client ID already exists'
      });
    }

    const key = generateApiKey('sk');
    
    const expiresAt = expiresInDays 
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const apiKey = await ApiKey.create({
      key,
      name,
      clientId,
      rateLimit,
      expiresAt,
      allowedIPs,
      contactEmail,
      notes
    });

    console.log(`✅ API Key created for: ${name} (${clientId})`);

    res.status(201).json({
      success: true,
      message: 'API key created successfully',
      data: {
        apiKey: key, // Show only once!
        clientId: apiKey.clientId,
        name: apiKey.name,
        rateLimit: apiKey.rateLimit,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt
      },
      warning: 'Save this API key securely. It will not be shown again.'
    });
  } catch (error) {
    console.error('❌ Create API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create API key',
      message: error.message
    });
  }
};

/**
 * @route   GET /api/admin/keys
 * @desc    List all API keys
 * @access  Admin only
 */
const listApiKeys = async (req, res) => {
  try {
    const { active, search } = req.query;

    const query = {};
    if (active !== undefined) {
      query.isActive = active === 'true';
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { clientId: { $regex: search, $options: 'i' } }
      ];
    }

    const keys = await ApiKey.find(query)
      .select('-key') // Never return the actual key
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: keys.length,
      data: keys.map(k => ({
        id: k._id,
        name: k.name,
        clientId: k.clientId,
        isActive: k.isActive,
        rateLimit: k.rateLimit,
        usageCount: k.usageCount,
        lastUsed: k.lastUsed,
        createdAt: k.createdAt,
        expiresAt: k.expiresAt,
        contactEmail: k.contactEmail,
        keyPreview: '••••••••' + k.key.slice(-8)
      }))
    });
  } catch (error) {
    console.error('❌ List API keys error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list API keys'
    });
  }
};

/**
 * @route   GET /api/admin/keys/:clientId
 * @desc    Get API key details
 * @access  Admin only
 */
const getApiKey = async (req, res) => {
  try {
    const { clientId } = req.params;

    const apiKey = await ApiKey.findOne({ clientId }).select('-key');

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: apiKey._id,
        name: apiKey.name,
        clientId: apiKey.clientId,
        isActive: apiKey.isActive,
        rateLimit: apiKey.rateLimit,
        usageCount: apiKey.usageCount,
        lastUsed: apiKey.lastUsed,
        createdAt: apiKey.createdAt,
        expiresAt: apiKey.expiresAt,
        allowedIPs: apiKey.allowedIPs,
        contactEmail: apiKey.contactEmail,
        notes: apiKey.notes,
        keyPreview: '••••••••' + apiKey.key.slice(-8)
      }
    });
  } catch (error) {
    console.error('❌ Get API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch API key'
    });
  }
};

/**
 * @route   PUT /api/admin/keys/:clientId
 * @desc    Update API key settings
 * @access  Admin only
 */
const updateApiKey = async (req, res) => {
  try {
    const { clientId } = req.params;
    const allowedUpdates = ['name', 'isActive', 'rateLimit', 'expiresAt', 'allowedIPs', 'contactEmail', 'notes'];
    
    const updates = {};
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const apiKey = await ApiKey.findOneAndUpdate(
      { clientId },
      updates,
      { new: true, runValidators: true }
    ).select('-key');

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    console.log(`✅ API Key updated: ${apiKey.name} (${clientId})`);

    res.json({
      success: true,
      message: 'API key updated successfully',
      data: apiKey
    });
  } catch (error) {
    console.error('❌ Update API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update API key'
    });
  }
};

/**
 * @route   DELETE /api/admin/keys/:clientId
 * @desc    Delete API key (soft delete - just deactivate)
 * @access  Admin only
 */
const deleteApiKey = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { hardDelete = false } = req.query;

    if (hardDelete === 'true') {
      // Permanent deletion
      await ApiKey.findOneAndDelete({ clientId });
      console.log(`🗑️  API Key permanently deleted: ${clientId}`);
    } else {
      // Soft delete - just deactivate
      await ApiKey.findOneAndUpdate(
        { clientId },
        { isActive: false }
      );
      console.log(`🔒 API Key deactivated: ${clientId}`);
    }

    res.json({
      success: true,
      message: hardDelete === 'true' ? 'API key deleted permanently' : 'API key deactivated'
    });
  } catch (error) {
    console.error('❌ Delete API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete API key'
    });
  }
};

/**
 * @route   POST /api/admin/keys/:clientId/regenerate
 * @desc    Regenerate API key
 * @access  Admin only
 */
const regenerateApiKey = async (req, res) => {
  try {
    const { clientId } = req.params;

    const apiKey = await ApiKey.findOne({ clientId });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    const newKey = generateApiKey('sk');
    apiKey.key = newKey;
    apiKey.usageCount = 0;
    apiKey.lastUsed = null;
    await apiKey.save();

    console.log(`🔄 API Key regenerated for: ${apiKey.name} (${clientId})`);

    res.json({
      success: true,
      message: 'API key regenerated successfully',
      data: {
        apiKey: newKey, // Show only once!
        clientId: apiKey.clientId,
        name: apiKey.name
      },
      warning: 'Save this API key securely. The old key is now invalid.'
    });
  } catch (error) {
    console.error('❌ Regenerate API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate API key'
    });
  }
};

/**
 * @route   GET /api/admin/stats
 * @desc    Get usage statistics
 * @access  Admin only
 */
const getStats = async (req, res) => {
  try {
    const User = require('../models/User');

    const [
      totalKeys,
      activeKeys,
      totalProfiles,
      profilesLast30Days
    ] = await Promise.all([
      ApiKey.countDocuments(),
      ApiKey.countDocuments({ isActive: true }),
      User.countDocuments({ clientId: { $exists: true, $ne: null } }),
      User.countDocuments({
        clientId: { $exists: true, $ne: null },
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      })
    ]);

    const topClients = await ApiKey.find({ isActive: true })
      .sort({ usageCount: -1 })
      .limit(10)
      .select('-key');

    res.json({
      success: true,
      data: {
        apiKeys: {
          total: totalKeys,
          active: activeKeys,
          inactive: totalKeys - activeKeys
        },
        profiles: {
          total: totalProfiles,
          last30Days: profilesLast30Days
        },
        topClients: topClients.map(c => ({
          name: c.name,
          clientId: c.clientId,
          usageCount: c.usageCount,
          lastUsed: c.lastUsed
        }))
      }
    });
  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
};

module.exports = {
  createApiKey,
  listApiKeys,
  getApiKey,
  updateApiKey,
  deleteApiKey,
  regenerateApiKey,
  getStats
};