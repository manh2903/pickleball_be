const express = require('express');
const router = express.Router();

const {
  register, registerOwner, login, refreshToken, logout,
  getMe, updateProfile, changePassword,
} = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/register-owner', registerOwner);
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateProfile);
router.put('/change-password', authenticate, changePassword);

module.exports = router;
