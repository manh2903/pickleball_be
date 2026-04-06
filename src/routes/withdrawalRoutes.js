const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { 
  requestWithdrawal, getMyWithdrawals, 
  adminGetAllWithdrawals, adminUpdateWithdrawal 
} = require('../controllers/withdrawalController');

// All withdrawal routes require authentication
router.use(authenticate);

// Owner: Manage their own payouts
router.post('/', authorize('owner'), requestWithdrawal);
router.get('/my', authorize('owner'), getMyWithdrawals);

// Admin: Manage all platform payouts
router.get('/admin/all', authorize('admin'), adminGetAllWithdrawals);
router.put('/admin/:id', authorize('admin'), adminUpdateWithdrawal);

module.exports = router;
