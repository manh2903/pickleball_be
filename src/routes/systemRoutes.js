const express = require('express');
const router = express.Router();
const systemController = require('../controllers/systemController');

router.get('/settings', systemController.getPublicSettings);

module.exports = router;
