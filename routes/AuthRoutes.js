const express = require('express');
const authRouter = express.Router();

// Import controllers
const { 
  register, 
  login, 
  getMe, 
  updateProfile 
} = require('../controllers/userController');



// Import middleware
const { protect } = require('../middleware/auth');

// ===== Auth Routes =====
// @route   POST /api/auth/register
authRouter.post('/register', register);

// @route   POST /api/auth/login
authRouter.post('/login', login);

// @route   GET /api/auth/me
authRouter.get('/me',  getMe);

// @route   PUT /api/auth/profile
authRouter.put('/profile',updateProfile);



module.exports = authRouter;