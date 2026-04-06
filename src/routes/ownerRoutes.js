const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { getStats, getVenueStaffs, createVenueStaff } = require('../controllers/ownerController');
const { ownerGetVenueBookings, ownerGetBookingDetail } = require('../controllers/bookingController');
const { getOwnerVenues, createVenue, updateVenue } = require('../controllers/venueController');
const { ownerGetCourts, createCourt, updateCourt, deleteCourt } = require('../controllers/courtController');

// All routes here require 'owner' role
router.use(authenticate);
router.use(authorize('owner'));

// === Statistics ===
router.get('/stats', getStats);

// === Venues ===
router.get('/venues', getOwnerVenues);
router.get('/venue', getOwnerVenues); // Alias
router.post('/venues', createVenue);
router.put('/venues/:id', updateVenue);
router.put('/venue', updateVenue); // Alias

// === Bookings ===
router.get('/bookings', ownerGetVenueBookings);
router.get('/bookings/:id', ownerGetBookingDetail);

// === Courts (nested under venue) ===
router.get('/venues/:venueId/courts', ownerGetCourts);
router.post('/venues/:venueId/courts', createCourt);
router.put('/venues/:venueId/courts/:id', updateCourt);
router.delete('/venues/:venueId/courts/:id', deleteCourt);

// === Staff Management ===
router.get('/venues/:id/staffs', getVenueStaffs);
router.post('/venues/:id/staffs', createVenueStaff);

module.exports = router;
