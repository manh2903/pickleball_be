const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const subscriptionController = require('../controllers/subscriptionController');

// Public
router.get('/plans', subscriptionController.getPlans);
router.get('/vnpay_return', subscriptionController.vnpayReturn);

// Owner
router.get('/my', authenticate, authorize('owner', 'staff'), subscriptionController.getMySubscription);
router.post('/purchase', authenticate, authorize('owner'), subscriptionController.purchasePlan);

// Admin
router.post('/admin/plans', authenticate, authorize('admin'), subscriptionController.adminCreatePlan);
router.put('/admin/plans/:id', authenticate, authorize('admin'), subscriptionController.adminUpdatePlan);

module.exports = router;
