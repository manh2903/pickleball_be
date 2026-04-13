const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const paymentController = require('../controllers/paymentController');

// Initiation (Authenticated)
router.post('/create-vnpay-url', authenticate, paymentController.createVNPayUrl);

// History
router.get('/my', authenticate, paymentController.getMyPayments);

// Public callbacks from VNPAY
router.get('/vnpay-return', paymentController.vnpayReturn);
router.get('/vnpay-ipn', paymentController.vnpayIPN);

module.exports = router;
