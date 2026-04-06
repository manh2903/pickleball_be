const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { checkIn, createWalkInBooking } = require('../controllers/bookingController');

// All staff routes require auth + staff or owner role
router.use(authenticate, authorize('staff', 'owner'));

router.post('/bookings/checkin', checkIn);
router.post('/bookings/walkin', createWalkInBooking);

module.exports = router;
