const User = require('../models/User');

/**
 * Find potential collaboration matches for a user
 * @param {string} userId - User ID to find matches for
 * @param {Object} options - Matching options
 * @returns {Array} Array of matched users with scores
 */
async function findCollaborationMatches(userId, options = {}) {
  try {
    const {
      limit = 5,
      minScore = 0.3,
      excludeConnected = true,
      clientId = null,
      includeMutualReasoning = false // NEW: Include bidirectional reasoning
    } = options;

    // Get the user and their collaboration targets
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    console.log(`🔍 Finding matches for ${user.name}...`);

    // Build query to find potential matches
    const query = { _id: { $ne: userId } };

    // Filter by clientId if provided
    if (clientId) {
      query.clientId = clientId;
    }

    // Exclude already connected users if requested
    if (excludeConnected && user.connections && user.connections.length > 0) {
      const connectedIds = user.connections
        .filter(c => c.status === 'accepted')
        .map(c => c.userId);
      if (connectedIds.length > 0) {
        query._id = { ...query._id, $nin: connectedIds };
      }
    }

    // Get all potential matches
    const potentialMatches = await User.find(query);

    console.log(`📊 Analyzing ${potentialMatches.length} potential matches...`);

    // Score each potential match
    const scoredMatches = potentialMatches
      .map(match => {
        const userToMatchScore = calculateMatchScore(user, match);
        const userToMatchReasons = getMatchReasons(user, match);
        
        let matchData = {
          user: match,
          score: userToMatchScore,
          reasons: userToMatchReasons
        };

        // Calculate mutual reasoning if requested
        if (includeMutualReasoning) {
          const matchToUserScore = calculateMatchScore(match, user);
          const matchToUserReasons = getMatchReasons(match, user);
          const mutualScore = (userToMatchScore + matchToUserScore) / 2;

          matchData.mutualReasoning = {
            mutualScore: Math.round(mutualScore * 100),
            yourScoreToThem: Math.round(userToMatchScore * 100),
            theirScoreToYou: Math.round(matchToUserScore * 100),
            reasonsYouToThem: userToMatchReasons,
            reasonsThemToYou: matchToUserReasons
          };
        }

        return matchData;
      })
      .filter(match => match.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    console.log(`✅ Found ${scoredMatches.length} matches above threshold`);

    return scoredMatches.map(match => ({
      _id: match.user._id,
      name: match.user.name,
      role: match.user.role,
      industry: match.user.industry,
      location: match.user.location,
      bio: match.user.enrichedBio || match.user.bio,
      skills: match.user.enrichedSkills || match.user.skills,
      matchScore: Math.round(match.score * 100),
      matchReasons: match.reasons,
      collaborationSuggestions: generateCollaborationSuggestions(user, match.user),
      ...(includeMutualReasoning && { mutualReasoning: match.mutualReasoning })
    }));

  } catch (error) {
    console.error('❌ Matching error:', error);
    throw error;
  }
}

/**
 * Calculate match score between two users (0–1)
 * Focuses on complementary connections rather than identical profiles
 */
function calculateMatchScore(user1, user2) {
  let totalScore = 0;
  let weights = 0;

  // 1️⃣ Collaboration target match (35%)
  const targetScore = calculateTargetMatch(user1, user2);
  totalScore += targetScore * 0.35;
  weights += 0.35;

  // 2️⃣ Complementary skills (40%)
  const skillScore = calculateComplementarySkills(user1, user2);
  totalScore += skillScore * 0.4;
  weights += 0.4;

  // 3️⃣ Industry complementarity (15%)
  const industryScore = calculateIndustryComplement(user1, user2);
  totalScore += industryScore * 0.15;
  weights += 0.15;

  // 4️⃣ Location proximity (5%)
  const locationScore = calculateLocationMatch(user1, user2);
  totalScore += locationScore * 0.05;
  weights += 0.05;

  // 5️⃣ Shared interests (5%)
  const interestScore = calculateInterestOverlap(user1, user2);
  totalScore += interestScore * 0.05;
  weights += 0.05;

  // 🧩 Penalize identical roles (too similar = less complementary)
  if (user1.role && user2.role && user1.role.toLowerCase() === user2.role.toLowerCase()) {
    totalScore *= 0.7; // reduce score by 30%
  }

  return weights > 0 ? totalScore / weights : 0;
}

/**
 * Check if user2 matches user1's collaboration targets
 */
function calculateTargetMatch(user1, user2) {
  if (!user1.collaborationTargets || user1.collaborationTargets.length === 0) {
    return 0;
  }

  let maxScore = 0;

  user1.collaborationTargets.forEach(target => {
    let score = 0;

    // Role match (primary factor)
    if (target.roles && target.roles.length > 0) {
      const roleMatch = target.roles.some(role =>
        user2.role?.toLowerCase().includes(role.toLowerCase()) ||
        role.toLowerCase().includes(user2.role?.toLowerCase())
      );
      if (roleMatch) score += 0.5;
    }

    // Keyword/skill match
    if (target.keywords && target.keywords.length > 0) {
      const user2Skills = (user2.enrichedSkills || user2.skills || []).map(s => s.toLowerCase());
      const keywordMatches = target.keywords.filter(keyword =>
        user2Skills.some(skill =>
          skill.includes(keyword.toLowerCase()) ||
          keyword.toLowerCase().includes(skill)
        )
      ).length;

      score += (keywordMatches / target.keywords.length) * 0.4;
    }

    // Reward cross-industry (complementary)
    if (user1.industry && user2.industry && user1.industry.toLowerCase() !== user2.industry.toLowerCase()) {
      score += 0.1;
    }

    // Priority weight
    const priorityMultiplier = (target.priority || 5) / 10;
    score *= priorityMultiplier;

    maxScore = Math.max(maxScore, score);
  });

  return Math.min(maxScore, 1);
}

/**
 * Calculate complementary skills score
 */
function calculateComplementarySkills(user1, user2) {
  const skills1 = new Set((user1.enrichedSkills || user1.skills || []).map(s => s.toLowerCase()));
  const skills2 = new Set((user2.enrichedSkills || user2.skills || []).map(s => s.toLowerCase()));

  if (skills1.size === 0 || skills2.size === 0) return 0;

  const overlap = [...skills1].filter(s => skills2.has(s)).length;
  const complementary = [...skills2].filter(s => !skills1.has(s)).length;

  const overlapRatio = overlap / Math.max(skills1.size, skills2.size);

  // Ideal: small overlap + large complementarity
  const overlapScore = overlapRatio >= 0.1 && overlapRatio <= 0.3 ? 0.5 : 0.3;
  const complementaryScore = (complementary / skills2.size) * 0.5;

  return overlapScore + complementaryScore;
}

/**
 * Calculate industry alignment score
 */
function calculateIndustryComplement(user1, user2) {
  if (!user1.industry || !user2.industry) return 0.5;

  const industry1 = user1.industry.toLowerCase();
  const industry2 = user2.industry.toLowerCase();

  // Penalize identical industries (too similar)
  if (industry1 === industry2) return 0.4;

  // Reward related or synergistic industries
  const complementPairs = [
    ['hospitality', 'marketing'],
    ['tourism', 'advertising'],
    ['technology', 'finance'],
    ['education', 'consulting'],
    ['real estate', 'architecture'],
    ['healthcare', 'wellness'],
    ['food', 'event management']
  ];

  for (const [a, b] of complementPairs) {
    if ((industry1.includes(a) && industry2.includes(b)) || 
        (industry1.includes(b) && industry2.includes(a))) {
      return 1;
    }
  }

  // Partial or neutral industries
  return 0.6;
}

/**
 * Calculate location match score
 */
function calculateLocationMatch(user1, user2) {
  if (!user1.location || !user2.location) return 0.5;

  const loc1 = user1.location.toLowerCase();
  const loc2 = user2.location.toLowerCase();

  // Same city/location
  if (loc1 === loc2) return 1;

  // Same country or state
  const loc1Parts = loc1.split(',').map(p => p.trim());
  const loc2Parts = loc2.split(',').map(p => p.trim());

  if (loc1Parts.some(p => loc2Parts.includes(p))) {
    return 0.7;
  }

  // Remote work is common, so different locations aren't a major penalty
  return 0.4;
}

/**
 * Calculate shared interests overlap
 */
function calculateInterestOverlap(user1, user2) {
  const interests1 = new Set((user1.interests || []).map(i => i.toLowerCase()));
  const interests2 = new Set((user2.interests || []).map(i => i.toLowerCase()));

  if (interests1.size === 0 || interests2.size === 0) return 0;

  const overlap = [...interests1].filter(i => interests2.has(i)).length;
  const union = new Set([...interests1, ...interests2]).size;

  return overlap / union;
}

/**
 * Get human-readable match reasons
 */
function getMatchReasons(user1, user2) {
  const reasons = [];

  // Check collaboration target matches
  if (user1.collaborationTargets && user1.collaborationTargets.length > 0) {
    user1.collaborationTargets.forEach(target => {
      const roleMatch = target.roles?.some(role =>
        user2.role?.toLowerCase().includes(role.toLowerCase())
      );
      
      if (roleMatch) {
        reasons.push({
          type: 'target_match',
          reason: `Matches your target: ${target.type}`,
          detail: target.reason
        });
      }
    });
  }

  // Complementary skills
  const skills1 = new Set((user1.enrichedSkills || user1.skills || []).map(s => s.toLowerCase()));
  const skills2 = (user2.enrichedSkills || user2.skills || []).map(s => s.toLowerCase());
  const complementarySkills = skills2.filter(s => !skills1.has(s)).slice(0, 3);

  if (complementarySkills.length > 0) {
    reasons.push({
      type: 'complementary_skills',
      reason: 'Has complementary skills you might need',
      detail: complementarySkills.join(', ')
    });
  }

  // Same industry
  if (user1.industry && user2.industry && 
      user1.industry.toLowerCase() === user2.industry.toLowerCase()) {
    reasons.push({
      type: 'industry',
      reason: `Both in ${user1.industry} industry`,
      detail: 'Shared industry knowledge and network'
    });
  }

  return reasons.slice(0, 3); // Top 3 reasons
}

/**
 * Generate specific collaboration suggestions
 */
function generateCollaborationSuggestions(user1, user2) {
  const suggestions = [];

  // Find matching collaboration targets
  if (user1.collaborationTargets && user1.collaborationTargets.length > 0) {
    user1.collaborationTargets.forEach(target => {
      const roleMatch = target.roles?.some(role =>
        user2.role?.toLowerCase().includes(role.toLowerCase())
      );

      if (roleMatch && target.potentialCollaboration) {
        suggestions.push({
          type: 'project',
          title: `Collaborate on: ${target.type}`,
          description: target.potentialCollaboration,
          mutualBenefit: target.mutualBenefit
        });
      }
    });
  }

  // Add generic suggestions based on roles
  if (suggestions.length === 0) {
    suggestions.push({
      type: 'general',
      title: 'Knowledge Exchange',
      description: `Share expertise between ${user1.role} and ${user2.role}`,
      mutualBenefit: 'Learn from each other\'s experiences and expand professional networks'
    });
  }

  return suggestions;
}

/**
 * Get mutual match score (bidirectional)
 * Now used primarily for the /compare endpoint
 */
async function getMutualMatchScore(userId1, userId2) {
  const user1 = await User.findById(userId1);
  const user2 = await User.findById(userId2);

  if (!user1 || !user2) {
    throw new Error('One or both users not found');
  }

  const score1to2 = calculateMatchScore(user1, user2);
  const score2to1 = calculateMatchScore(user2, user1);

  // Average the bidirectional scores
  const mutualScore = (score1to2 + score2to1) / 2;

  return {
    mutualScore: Math.round(mutualScore * 100),
    user1ToUser2Score: Math.round(score1to2 * 100),
    user2ToUser1Score: Math.round(score2to1 * 100),
    reasons1to2: getMatchReasons(user1, user2),
    reasons2to1: getMatchReasons(user2, user1)
  };
}

module.exports = {
  findCollaborationMatches,
  getMutualMatchScore,
  calculateMatchScore
};