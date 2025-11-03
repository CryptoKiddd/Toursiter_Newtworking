const User = require('../models/User');
const { scrapeLinkedIn } = require('../services/linkedinService');
const { enrichProfile } = require('../services/openaiService');
const { findCollaborationMatches, getMutualMatchScore } = require('../services/matchService');

/**
 * Helper functions
 */
const ensureArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const mergeArrays = (...arrays) => {
  const merged = arrays.flat().filter(Boolean);
  return [...new Set(merged)];
};

/**
 * @route   POST /api/v1/profiles
 * @desc    Create and enrich profile from LinkedIn URL
 * @access  API Key Required
 * @body    { linkedinURL, name, additionalData?: {} }
 */
const createProfile = async (req, res) => {
  try {
    const {
      linkedinURL,
      name,
      email, // Optional: for unique identification
      additionalData = {}
    } = req.body;

    // Validation
    if (!linkedinURL || !name) {
      return res.status(400).json({
        success: false,
        error: 'linkedinURL and name are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    console.log(`\n📝 Profile creation started for: ${name}`);
    console.log(`👤 Client: ${req.apiClient.name} (${req.apiClient.clientId})`);

    // Check if profile already exists (by LinkedIn URL or email)
    const existingProfile = await User.findOne({
      $or: [
        { linkedinURL: linkedinURL.trim() },
        ...(email ? [{ email }] : [])
      ],
      clientId: req.apiClient.clientId
    });

    if (existingProfile) {
      return res.status(409).json({
        success: false,
        error: 'Profile already exists',
        code: 'PROFILE_EXISTS',
        data: {
          profileId: existingProfile._id,
          createdAt: existingProfile.createdAt
        }
      });
    }

    // Initialize profile data
    let profileData = {
      name,
      email: email || `${Date.now()}@generated.local`, // Generate email if not provided
      clientId: req.apiClient.clientId, // Track which client created this
      linkedinURL: linkedinURL.trim(),
      bio: additionalData.bio || '',
      skills: ensureArray(additionalData.skills),
      interests: ensureArray(additionalData.interests),
      role: additionalData.role || '',
      businessType: additionalData.businessType || '',
      industry: additionalData.industry || '',
      location: additionalData.location || '',
      education: [],
      experience: [],
      linkedinSummary: {},
      password: Math.random().toString(36).slice(-16) // Random password (not used for API access)
    };

    // STEP 1: Scrape LinkedIn
    console.log(`🔍 Step 1: Scraping LinkedIn profile...`);
    try {
      const linkedinData = await scrapeLinkedIn(linkedinURL.trim());
      
      if (linkedinData) {
        profileData.linkedinSummary = linkedinData;
        profileData.bio = profileData.bio || linkedinData.about || '';
        profileData.role = profileData.role || linkedinData.title || linkedinData.headline || '';
        profileData.industry = profileData.industry || linkedinData.industry || '';
        profileData.location = profileData.location || linkedinData.location || '';
        profileData.skills = mergeArrays(profileData.skills, linkedinData.skills);
        profileData.interests = mergeArrays(profileData.interests, linkedinData.interests);
        profileData.education = linkedinData.education || [];
        profileData.experience = linkedinData.experience || [];

        console.log(`✅ LinkedIn data scraped: ${profileData.skills.length} skills, ${profileData.experience.length} experiences`);
      }
    } catch (error) {
      console.log(`⚠️  LinkedIn scraping failed: ${error.message}`);
    }

    // STEP 2: AI Profile Enrichment
    console.log(`🤖 Step 2: Enriching profile with AI...`);
    try {
      const enrichedData = await enrichProfile({
        name: profileData.name,
        bio: profileData.bio,
        skills: profileData.skills,
        interests: profileData.interests,
        role: profileData.role,
        industry: profileData.industry,
        businessType: profileData.businessType,
        location: profileData.location,
        education: profileData.education,
        linkedinSummary: profileData.linkedinSummary
      });

      profileData.enrichedBio = enrichedData.enrichedBio || profileData.bio;
      profileData.enrichedSkills = enrichedData.enrichedSkills.length > 0 
        ? enrichedData.enrichedSkills 
        : profileData.skills;
      profileData.role = enrichedData.role || profileData.role;
      profileData.industry = enrichedData.industry || profileData.industry;
      profileData.businessType = enrichedData.businessType || profileData.businessType;
      profileData.location = enrichedData.location || profileData.location;
      profileData.interests = mergeArrays(profileData.interests, enrichedData.analyzedInterests);
      profileData.collaborationTargets = enrichedData.collaborationTargets || [];
      profileData.profileEnrichedAt = new Date();

      console.log(`✅ Profile enriched: ${profileData.collaborationTargets.length} collaboration targets`);
    } catch (error) {
      console.error(`❌ Profile enrichment failed:`, error.message);
      profileData.enrichedBio = profileData.bio;
      profileData.enrichedSkills = profileData.skills;
      profileData.collaborationTargets = [];
    }

    // STEP 3: Save to database
    console.log(`💾 Step 3: Saving profile to database...`);
    const profile = await User.create(profileData);

    console.log(`✅ Profile created: ${profile._id}`);

    res.status(201).json({
      success: true,
      message: 'Profile created and enriched successfully',
      data: {
        profileId: profile._id,
        name: profile.name,
        role: profile.role,
        industry: profile.industry,
        location: profile.location,
        bio: profile.enrichedBio,
        skills: profile.enrichedSkills,
        interests: profile.interests,
        collaborationTargets: profile.collaborationTargets,
        linkedinURL: profile.linkedinURL,
        profileEnriched: !!profile.profileEnrichedAt,
        createdAt: profile.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Profile creation error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      error: 'Profile creation failed',
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @route   GET /api/v1/profiles/:profileId
 * @desc    Get profile by ID
 * @access  API Key Required
 */
const getProfile = async (req, res) => {
  try {
    const { profileId } = req.params;

    const profile = await User.findOne({
      _id: profileId,
      clientId: req.apiClient.clientId // Ensure client can only access their own profiles
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
        code: 'PROFILE_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: {
        profileId: profile._id,
        name: profile.name,
        role: profile.role,
        industry: profile.industry,
        location: profile.location,
        bio: profile.enrichedBio || profile.bio,
        skills: profile.enrichedSkills || profile.skills,
        interests: profile.interests,
        collaborationTargets: profile.collaborationTargets,
        linkedinURL: profile.linkedinURL,
        createdAt: profile.createdAt,
        profileEnriched: !!profile.profileEnrichedAt
      }
    });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * @route   GET /api/v1/profiles
 * @desc    List all profiles for this client
 * @access  API Key Required
 */
const listProfiles = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const profiles = await User.find({ clientId: req.apiClient.clientId })
      .select('-password -linkedinSummary')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments({ clientId: req.apiClient.clientId });

    res.json({
      success: true,
      data: profiles.map(p => ({
        profileId: p._id,
        name: p.name,
        role: p.role,
        industry: p.industry,
        location: p.location,
        createdAt: p.createdAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ List profiles error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list profiles',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * @route   POST /api/v1/matches
 * @desc    Find collaboration matches for a profile with bidirectional reasoning
 * @access  API Key Required
 * @body    { profileId, limit?, minScore?, includeMutualReasoning? }
 */
const findMatches = async (req, res) => {
  try {
    const {
      profileId,
      limit = 5,
      minScore = 30,
      includeMutualReasoning = true // Include bidirectional match reasoning
    } = req.body;

    if (!profileId) {
      return res.status(400).json({
        success: false,
        error: 'profileId is required',
        code: 'MISSING_PROFILE_ID'
      });
    }

    // Verify profile belongs to this client
    const profile = await User.findOne({
      _id: profileId,
      clientId: req.apiClient.clientId
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
        code: 'PROFILE_NOT_FOUND'
      });
    }

    console.log(`🔍 Finding matches for: ${profile.name}`);

    const matches = await findCollaborationMatches(profileId, {
      limit: parseInt(limit),
      minScore: parseInt(minScore) / 100,
      excludeConnected: true,
      clientId: req.apiClient.clientId,
      includeMutualReasoning // Pass flag to matching service
    });

    // Format response
    const formattedMatches = matches.map(match => {
      const baseMatch = {
        matchedProfileId: match._id,
        matchedProfileName: match.name,
        matchScore: match.matchScore,
        role: match.role,
        industry: match.industry,
        location: match.location,
        bio: match.bio,
        skills: match.skills,
        collaborationSuggestions: match.collaborationSuggestions
      };

      // If mutual reasoning is included, structure it properly
      if (includeMutualReasoning && match.mutualReasoning) {
        return {
          ...baseMatch,
          reasoning: {
            mutualScore: match.mutualReasoning.mutualScore,
            whyTheyMatchYou: {
              score: match.mutualReasoning.yourScoreToThem,
              reasons: match.mutualReasoning.reasonsYouToThem
            },
            whyYouMatchThem: {
              score: match.mutualReasoning.theirScoreToYou,
              reasons: match.mutualReasoning.reasonsThemToYou
            }
          }
        };
      } else {
        // Basic unidirectional reasons
        return {
          ...baseMatch,
          reasons: match.matchReasons
        };
      }
    });

    res.json({
      success: true,
      profileId,
      profileName: profile.name,
      matchCount: formattedMatches.length,
      includesMutualReasoning: includeMutualReasoning,
      matches: formattedMatches
    });
  } catch (error) {
    console.error('❌ Find matches error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find matches',
      code: 'INTERNAL_ERROR',
      message: error.message
    });
  }
};

/**
 * @route   POST /api/v1/matches/compare
 * @desc    Get detailed match score between two profiles
 * @access  API Key Required
 * @body    { profileId1, profileId2 }
 */
const compareProfiles = async (req, res) => {
  try {
    const { profileId1, profileId2 } = req.body;

    if (!profileId1 || !profileId2) {
      return res.status(400).json({
        success: false,
        error: 'Both profileId1 and profileId2 are required',
        code: 'MISSING_PROFILE_IDS'
      });
    }

    // Verify both profiles belong to this client
    const [profile1, profile2] = await Promise.all([
      User.findOne({ _id: profileId1, clientId: req.apiClient.clientId }),
      User.findOne({ _id: profileId2, clientId: req.apiClient.clientId })
    ]);

    if (!profile1 || !profile2) {
      return res.status(404).json({
        success: false,
        error: 'One or both profiles not found',
        code: 'PROFILE_NOT_FOUND'
      });
    }

    const matchData = await getMutualMatchScore(profileId1, profileId2);

    res.json({
      success: true,
      data: {
        profile1: {
          profileId: profile1._id,
          name: profile1.name,
          role: profile1.role
        },
        profile2: {
          profileId: profile2._id,
          name: profile2.name,
          role: profile2.role
        },
        mutualScore: matchData.mutualScore,
        breakdown: {
          profile1ToProfile2Score: matchData.user1ToUser2Score,
          profile2ToProfile1Score: matchData.user2ToUser1Score
        },
        profile1Reasons: matchData.reasons1to2,
        profile2Reasons: matchData.reasons2to1
      }
    });
  } catch (error) {
    console.error('❌ Compare profiles error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare profiles',
      code: 'INTERNAL_ERROR',
      message: error.message
    });
  }
};

module.exports = {
  createProfile,
  getProfile,
  listProfiles,
  findMatches,
  compareProfiles
};