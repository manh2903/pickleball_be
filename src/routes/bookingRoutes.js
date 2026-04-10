const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const {
  getAvailability, createBooking, getMyBookings, getBookingById, cancelBooking, createWalkInBooking
} = require('../controllers/bookingController');

// Customer booking routes
router.get('/availability', getAvailability);               // public
router.post('/', authenticate, createBooking);
router.get('/my', authenticate, getMyBookings);
router.post('/walk-in', authenticate, authorize('owner', 'staff', 'admin'), createWalkInBooking);
router.get('/:id', authenticate, getBookingById);
router.post('/:id/cancel', authenticate, cancelBooking);
router.post('/:id/confirm-payment', authenticate, authorize('owner', 'staff', 'admin'), require('../controllers/bookingController').confirmPayment);

module.exports = router;
