# Implementation Guide: Transforming to Service API

## Overview

This guide walks you through converting your existing user-based application into a **service-oriented API** that clients can integrate with using API keys.

## Architecture Changes

### Before (User-based)
```
User → Register → JWT Token → Use App
```

### After (Service API)
```
Client → API Key → Send LinkedIn URL + Name → Get Profile + Matches
```

## Step-by-Step Implementation

### 1. Install New Dependencies

```bash
npm install helmet morgan
```

### 2. Update User Model

Add `clientId` field to your existing User model:

```javascript
// models/User.js

const userSchema = new mongoose.Schema({
  // ... existing fields ...
  
  // NEW: Add this field
  clientId: {
    type: String,
    index: true,
    required: false // Optional for backward compatibility
  }
});

// Add compound index for client queries
userSchema.index({ clientId: 1, createdAt: -1 });
```

### 3. Create New Models

Create these new model files:

**models/ApiKey.js**
```javascript
const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  clientId: { type: String, required: true, unique: true, index: true },
  isActive: { type: Boolean, default: true },
  rateLimit: { type: Number, default: 100 },
  usageCount: { type: Number, default: 0 },
  lastUsed: Date,
  createdAt: { type: Date, default: Date.now },
  expiresAt: Date,
  allowedIPs: [String],
  contactEmail: String,
  notes: String
});

module.exports = mongoose.model('ApiKey', apiKeySchema);
```

**models/RateLimit.js**
```javascript
const mongoose = require('mongoose');

const rateLimitSchema = new mongoose.Schema({
  clientId: { type: String, required: true, index: true },
  endpoint: { type: String, required: true },
  timestamp: { type: Date, default: Date.now, index: true, expires: 3600 }
});

rateLimitSchema.index({ clientId: 1, timestamp: 1 });

module.exports = mongoose.model('RateLimit', rateLimitSchema);
```

### 4. Create Directory Structure

```
your-project/
├── controllers/
│   ├── authController.js (existing)
│   ├── matchController.js (existing)
│   ├── serviceController.js (NEW)
│   └── adminController.js (NEW)
├── middleware/
│   ├── auth.js (existing - JWT)
│   └── apiKeyAuth.js (NEW)
├── models/
│   ├── User.js (updated)
│   ├── ApiKey.js (NEW)
│   └── RateLimit.js (NEW)
├── routes/
│   ├── authRoutes.js (existing)
│   ├── matchRoutes.js (existing)
│   ├── serviceRoutes.js (NEW)
│   └── adminRoutes.js (NEW)
├── services/
│   ├── linkedinService.js (existing)
│   ├── openaiService.js (existing)
│   └── matchService.js (updated)
└── server.js (updated)
```

### 5. Update Match Service

Update your `services/matchService.js` to support client isolation (see artifact "Updated Match Service").

### 6. Update Environment Variables

Add to your `.env` file:

```env
# Existing variables
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
OPENAI_API_KEY=your_openai_key

# NEW: Service API configuration
ALLOWED_ORIGINS=http://localhost:3000,https://your-client-domain.com
NODE_ENV=development

# Optional: Admin credentials for creating first API key
ADMIN_EMAIL=admin@yourcompany.com
ADMIN_PASSWORD=secure_password
```

### 7. Create First API Key (Manual)

After deploying, create your first API key using MongoDB directly or through a script:

**scripts/createApiKey.js**
```javascript
require('dotenv').config();
const mongoose = require('mongoose');
const { ApiKey } = require('../models/ApiKey');
const { generateApiKey } = require('../middleware/apiKeyAuth');

async function createFirstApiKey() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const key = generateApiKey('sk');
  
  const apiKey = await ApiKey.create({
    key,
    name: 'Test Client',
    clientId: 'test_client_001',
    rateLimit: 100,
    contactEmail: 'test@example.com',
    notes: 'Initial test API key'
  });
  
  console.log('\n✅ API Key Created!');
  console.log('═══════════════════════════════════════');
  console.log('API Key:', key);
  console.log('Client ID:', apiKey.clientId);
  console.log('Rate Limit:', apiKey.rateLimit, 'requests/hour');
  console.log('═══════════════════════════════════════\n');
  console.log('⚠️  SAVE THIS KEY SECURELY - IT WILL NOT BE SHOWN AGAIN!\n');
  
  process.exit(0);
}

createFirstApiKey();
```

Run it:
```bash
node scripts/createApiKey.js
```

### 8. Test the API

**Test Profile Creation:**
```bash
curl -X POST http://localhost:5000/api/v1/profiles \
  -H "X-API-Key: sk_your_generated_key" \
  -H "Content-Type: application/json" \
  -d '{
    "linkedinURL": "https://www.linkedin.com/in/example",
    "name": "Test User"
  }'
```

**Test Finding Matches:**
```bash
curl -X POST http://localhost:5000/api/v1/matches \
  -H "X-API-Key: sk_your_generated_key" \
  -H "Content-Type: application/json" \
  -d '{
    "profileId": "YOUR_PROFILE_ID",
    "limit": 10,
    "minScore": 50
  }'
```

## Managing API Keys (Admin Panel)

### Create Admin User

First, create an admin user using your existing registration:

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin",
    "email": "admin@yourcompany.com",
    "password": "secure_password_123"
  }'
```

### Manage API Keys

Once logged in, use the JWT token to manage API keys:

**Create API Key:**
```bash
curl -X POST http://localhost:5000/api/admin/keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Client Company Name",
    "clientId": "client_company_001",
    "rateLimit": 200,
    "contactEmail": "contact@clientcompany.com",
    "notes": "Enterprise customer"
  }'
```

**List All API Keys:**
```bash
curl http://localhost:5000/api/admin/keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Get Statistics:**
```bash
curl http://localhost:5000/api/admin/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Migration Strategy

### For Existing Users

If you have existing users in your database:

1. **Keep existing routes** - Your `/api/auth` and `/api/matches` routes still work
2. **Add new service routes** - New `/api/v1` routes for API clients
3. **Separate concerns** - Existing users use JWT, new clients use API keys

### Gradual Migration

```javascript
// Example: Support both authentication methods
const flexibleAuth = (req, res, next) => {
  // Check for API key first
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    return authenticateApiKey(req, res, next);
  }
  
  // Fall back to JWT
  return protect(req, res, next);
};
```

## Pricing & Billing Integration

Add a billing system by integrating with Stripe:

```javascript
// middleware/checkUsageLimit.js
const checkUsageLimit = async (req, res, next) => {
  const subscription = await Subscription.findOne({ 
    clientId: req.apiClient.clientId 
  });
  
  if (!subscription || subscription.status !== 'active') {
    return res.status(403).json({
      success: false,
      error: 'Subscription required',
      code: 'SUBSCRIPTION_REQUIRED'
    });
  }
  
  if (subscription.profilesCreated >= subscription.planLimit) {
    return res.status(429).json({
      success: false,
      error: 'Plan limit reached',
      code: 'PLAN_LIMIT_REACHED'
    });
  }
  
  next();
};
```

## Monitoring & Analytics

Track API usage:

```javascript
// middleware/analytics.js
const trackApiUsage = async (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', async () => {
    await Analytics.create({
      clientId: req.apiClient.clientId,
      endpoint: req.path,
      method: req.method,
      statusCode: res.statusCode,
      responseTime: Date.now() - startTime,
      timestamp: new Date()
    });
  });
  
  next();
};
```

## Security Best Practices

1. **Rate Limiting**: Implement per-endpoint rate limits
2. **IP Whitelisting**: Allow clients to restrict by IP
3. **API Key Rotation**: Provide key regeneration
4. **Audit Logging**: Track all API key actions
5. **HTTPS Only**: Enforce SSL in production
6. **Input Validation**: Validate all inputs
7. **Error Handling**: Never expose sensitive data in errors

## Production Deployment

### Environment Variables

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
JWT_SECRET=long_random_secret_key
OPENAI_API_KEY=sk-...
ALLOWED_ORIGINS=https://client1.com,https://client2.com
PORT=5000
```

### Docker Deployment

**Dockerfile:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
```

### Health Checks

```javascript
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});
```

## Support & Documentation

- Create a documentation site using tools like Swagger/OpenAPI
- Set up a status page for API uptime
- Provide SDKs in popular languages (Python, Node.js, Ruby)
- Create example integrations and tutorials
- Set up customer support channels

## Next Steps

1. ✅ Implement the core service API
2. ✅ Create admin panel for API key management
3. ⏭️ Add webhook support for real-time notifications
4. ⏭️ Implement usage-based billing
5. ⏭️ Create client dashboard for analytics
6. ⏭️ Build SDKs for popular languages
7. ⏭️ Set up monitoring and alerting
8. ⏭️ Create comprehensive documentation