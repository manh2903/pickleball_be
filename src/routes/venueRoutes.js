const express = require('express');
const router = express.Router();
const { getVenues, getVenueById } = require('../controllers/venueController');
const { getCourtsInVenue, getCourtById } = require('../controllers/courtController');
const { optionalAuth } = require('../middleware/authMiddleware');

// Public listing
router.get('/', optionalAuth, getVenues);
router.get('/:id', optionalAuth, getVenueById);

// Courts under a venue (nested)
router.get('/:venueId/courts', getCourtsInVenue);
router.get('/:venueId/courts/:id', getCourtById);

module.exports = router;
