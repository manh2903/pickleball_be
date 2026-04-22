const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { getStats, getVenueStaffs, createVenueStaff, getReports, updateStaffPassword, updateStaff, getRevenueAnalytics, getOwnerCashflow } = require('../controllers/ownerController');
const { checkFeature } = require('../middleware/subscriptionMiddleware');
const { ownerGetVenueBookings, ownerGetBookingDetail } = require('../controllers/bookingController');
const { getOwnerVenues, getOwnerVenueById, createVenue, updateVenue, uploadVenueImage, deleteVenueImage } = require('../controllers/venueController');
const { ownerGetCourts, createCourt, updateCourt, deleteCourt } = require('../controllers/courtController');
const { getVenueReviewsForOwner } = require('../controllers/reviewController');
const upload = require('../middleware/uploadMiddleware');

// All routes here require 'owner' role
router.use(authenticate);
router.use(authorize('owner'));

// === Statistics ===
router.get('/stats', getStats);
router.get('/analytics', checkFeature('analytics'), getRevenueAnalytics);
router.get('/cashflow', getOwnerCashflow);
router.get('/venues/:id/reports', getReports);

// === Venues ===
router.get('/venues', getOwnerVenues);
router.get('/venues/:id', getOwnerVenueById);
router.get('/venue', getOwnerVenues); // Alias
router.post('/venues', createVenue);
router.put('/venues/:id', updateVenue);
router.put('/venue', updateVenue); // Alias
router.post('/venues/upload', upload.single('image'), uploadVenueImage);
router.delete('/venues/image', deleteVenueImage);

// === Bookings ===
router.get('/bookings', ownerGetVenueBookings);
router.get('/bookings/:id', ownerGetBookingDetail);

// === Courts (nested under venue) ===
router.get('/venues/:venueId/courts', ownerGetCourts);
router.post('/venues/:venueId/courts', createCourt);
router.put('/venues/:venueId/courts/:id', updateCourt);
router.delete('/venues/:venueId/courts/:id', deleteCourt);

// === Reviews ===
router.get('/venues/:venueId/reviews', getVenueReviewsForOwner);

// === Staff Management (Gated) ===
router.get('/venues/:id/staffs', checkFeature('staff_management'), getVenueStaffs);
router.post('/venues/:id/staffs', checkFeature('staff_management'), createVenueStaff);
router.put('/staffs/:id', checkFeature('staff_management'), updateStaff);
router.patch('/staffs/:id/password', checkFeature('staff_management'), updateStaffPassword);

module.exports = router;
