const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');

router.get('/provinces', locationController.getProvinces);
router.get('/provinces/:ma_tinh/wards', locationController.getWards);

module.exports = router;
