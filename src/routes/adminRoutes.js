const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');

const {
  adminGetAllVenues, adminUpdateVenueStatus, adminSetCommission,
} = require('../controllers/venueController');

const {
  adminGetStats, adminGetUsers, adminUpdateUserStatus,
  adminGetSubscriptionPayments
} = require('../controllers/adminController');
const { getAllBookings } = require('../controllers/bookingController');
const { adminGetAllIncidents, adminUpdateIncidentStatus } = require('../controllers/incidentController');

const  {
  adminGetSettings, adminUpdateSetting
} = require('../controllers/adminController');

// All admin routes
router.use(authenticate, authorize('admin'));

// === Dashboard Statistics ===
router.get('/stats', adminGetStats);

// === Owner/Venue management ===
router.get('/venues', adminGetAllVenues);
router.put('/venues/:id/status', adminUpdateVenueStatus);
router.put('/venues/:id/commission', adminSetCommission);

// === Users management ===
router.get('/users', adminGetUsers);
router.put('/users/:id/status', adminUpdateUserStatus);

// === Bookings management ===
router.get('/bookings', getAllBookings);

// === Incidents management ===
router.get('/incidents', adminGetAllIncidents);
router.put('/incidents/:id/status', adminUpdateIncidentStatus);

// === Platform Settings ===
router.get('/settings', adminGetSettings);
router.put('/settings/:key', adminUpdateSetting);

// === Financials ===
router.get('/payments/subscriptions', adminGetSubscriptionPayments);

module.exports = router;
