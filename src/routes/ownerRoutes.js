const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { getStats, getVenueStaffs, createVenueStaff, getReports, updateStaffPassword, updateStaff } = require('../controllers/ownerController');
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

// === Staff Management ===
router.get('/venues/:id/staffs', getVenueStaffs);
router.post('/venues/:id/staffs', createVenueStaff);
router.put('/staffs/:id', updateStaff);
router.patch('/staffs/:id/password', updateStaffPassword);

module.exports = router;
