const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { 
  getOwnerCoupons, createCoupon, 
  updateCouponStatus, validateCoupon,
  adminGetAllCoupons, adminCreateCoupon
} = require('../controllers/couponController');

// Public route to validate coupon during checkout
router.post('/validate', validateCoupon);

// All following routes require authentication
router.use(authenticate);

const { checkFeature } = require('../middleware/subscriptionMiddleware');

// Owner routes
router.get('/owner', authorize('owner'), checkFeature('custom_coupons'), getOwnerCoupons);
router.post('/owner', authorize('owner'), checkFeature('custom_coupons'), createCoupon);
router.put('/owner/:id/status', authorize('owner'), checkFeature('custom_coupons'), updateCouponStatus);

// Admin routes
router.get('/admin', authorize('admin'), adminGetAllCoupons);
router.post('/admin', authorize('admin'), adminCreateCoupon);
router.put('/admin/:id/status', authorize('admin'), updateCouponStatus); // Shared update logic

module.exports = router;
