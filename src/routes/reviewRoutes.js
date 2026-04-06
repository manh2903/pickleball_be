const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { createReview, getVenueReviews } = require('../controllers/reviewController');

// Public listing
router.get('/venue/:venueId', getVenueReviews);

// Protected posting
router.post('/', authenticate, createReview);

module.exports = router;
