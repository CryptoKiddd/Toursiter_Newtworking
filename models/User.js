const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false // Don't return password by default
  },
  bio: {
    type: String,
    default: ''
  },
  enrichedBio: {
    type: String,
    default: ''
  },
  skills: {
    type: [String],
    default: []
  },
  enrichedSkills: {
    type: [String],
    default: []
  },
  interests: {
    type: [String],
    default: []
  },
  education: {
    type: [{
      school: String,
      degree: String,
      fieldOfStudy: String,
      startDate: String,
      endDate: String
    }],
    default: []
  },
  experience: {
    type: [{
      title: String,
      company: String,
      location: String,
      startDate: String,
      endDate: String,
      description: String
    }],
    default: []
  },
  role: {
    type: String,
    default: ''
  },
  businessType: {
    type: String,
    default: ''
  },
  industry: {
    type: String,
    default: ''
  },
  location: {
    type: String,
    default: ''
  },
  linkedinURL: {
    type: String,
    default: ''
  },
  linkedinSummary: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  clientId: {
    type: String,
    index: true,
    required: false // Optional for backward compatibility
  },
  collaborationTargets: [
    {
      type: {
        type: String,
        required: true
      },
      reason: {
        type: String,
        default: ''
      },
      potentialCollaboration: {
        type: String,
        default: ''
      },
      keywords: {
        type: [String],
        default: []
      },
      industries: {
        type: [String],
        default: []
      },
      roles: {
        type: [String],
        default: []
      },
      mutualBenefit: {
        type: String,
        default: ''
      },
      priority: {
        type: Number,
        default: 0,
        min: 0,
        max: 10
      }
    }
  ],
  profileEnrichedAt: {
    type: Date,
    default: null
  },
  connections: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
      },
      connectedAt: Date
    }
  ]
}, {
  timestamps: true
});

// Indexes for better query performance

userSchema.index({ 'collaborationTargets.keywords': 1 });
userSchema.index({ 'collaborationTargets.industries': 1 });
userSchema.index({ 'collaborationTargets.roles': 1 });
userSchema.index({ industry: 1, role: 1 });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to get safe user data (without password)
userSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);