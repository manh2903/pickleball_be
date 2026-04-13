const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const venueRoutes = require('./venueRoutes');
const courtRoutes = require('./courtRoutes');
const bookingRoutes = require('./bookingRoutes');
const userRoutes = require('./userRoutes');
const adminRoutes = require('./adminRoutes');
const ownerRoutes = require('./ownerRoutes');
const staffRoutes = require('./staffRoutes');
const notificationRoutes = require('./notificationRoutes');
const reviewRoutes = require('./reviewRoutes');
const paymentRoutes = require('./paymentRoutes');
const incidentRoutes = require('./incidentRoutes');
const withdrawalRoutes = require('./withdrawalRoutes');
const locationRoutes = require('./locationRoutes');
const couponRoutes = require('./couponRoutes');
const systemRoutes = require('./systemRoutes');
const subscriptionRoutes = require('./subscriptionRoutes');

// Public routes
router.use('/auth', authRoutes);
router.use('/venues', venueRoutes);
router.use('/courts', courtRoutes);
router.use('/reviews', reviewRoutes);
router.use('/payments', paymentRoutes); // Includes VNPay return/IPN
router.use('/incidents', incidentRoutes); // All routes protected
router.use('/withdrawals', withdrawalRoutes);
router.use('/locations', locationRoutes);
router.use('/coupons', couponRoutes);
router.use('/system', systemRoutes);
router.use('/subscriptions', subscriptionRoutes);

// Protected routes
router.use('/user', userRoutes);
router.use('/bookings', bookingRoutes);
router.use('/owner', ownerRoutes);
router.use('/admin', adminRoutes);
router.use('/staff', staffRoutes);
router.use('/notifications', notificationRoutes);

module.exports = router;
