const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { createIncident, getVenueIncidents, updateIncidentStatus } = require('../controllers/incidentController');

// All incident routes require authentication
router.use(authenticate);

// Staff/Owner: List for a specific venue
router.get('/venue/:venue_id', getVenueIncidents);

// Staff: Create incident
router.post('/', authorize('staff', 'owner'), createIncident);

// Owner: Resolve/Update
router.put('/:id/status', authorize('owner'), updateIncidentStatus);

module.exports = router;
