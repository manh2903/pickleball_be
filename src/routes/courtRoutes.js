const express = require('express');
const router = express.Router();
const { getCourtsInVenue, getCourtById } = require('../controllers/courtController');
const { optionalAuth } = require('../middleware/authMiddleware');

// Public listing
// Usually venues/:venueId/courts, but we provide this for discovery
router.get('/venue/:venueId', optionalAuth, getCourtsInVenue);
router.get('/:id/venue/:venueId', optionalAuth, getCourtById);

module.exports = router;
