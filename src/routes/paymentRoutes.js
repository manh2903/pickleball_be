const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { createVNPayUrl, vnpayReturn, vnpayIPN } = require('../controllers/paymentController');

// Initiation (Authenticated)
router.post('/create-vnpay-url', authenticate, createVNPayUrl);

// Public callbacks from VNPAY
router.get('/vnpay-return', vnpayReturn);
router.get('/vnpay-ipn', vnpayIPN);

module.exports = router;
