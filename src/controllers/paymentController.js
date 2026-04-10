const db = require('../models');
const vnpay = require('../utils/vnpay');
const { ApiError } = require('../middleware/errorMiddleware');

/**
 * VNPay Payment Controller
 */
const createVNPayUrl = async (req, res, next) => {
  try {
    const { bookingId } = req.body;
    
    // 1. Get booking
    const isCode = isNaN(Number(bookingId));
    const where = isCode ? { booking_code: bookingId } : { id: bookingId };
    
    const booking = await db.Booking.findOne({ where });
    if (!booking) throw new ApiError(404, 'Không tìm thấy đơn đặt sân');
    if (booking.payment_status === 'paid') throw new ApiError(400, 'Đơn đặt sân đã được thanh toán');

    // 2. Create VNPay URL
    const paymentUrl = vnpay.createPaymentUrl(req, {
      orderId: booking.booking_code,
      amount: booking.total_price,
    });

    res.json({ success: true, data: paymentUrl });
  } catch (err) {
    next(err);
  }
};

/**
 * Handle VNPAY Return URL (User Redirect)
 */
const vnpayReturn = async (req, res, next) => {
  try {
    const query = req.query;
    const isValid = vnpay.verifyReturnUrl(query);
    const bookingId = query.vnp_TxnRef;
    const responseCode = query.vnp_ResponseCode;

    if (isValid && responseCode === '00') {
      // Success
      await handlePaymentSuccess(req, bookingId, query.vnp_TransactionNo);
      // Redirect to frontend success page
      res.redirect(`${process.env.FRONTEND_URL}/bookings/${bookingId}?payment=success`);
    } else {
      // Fail
      res.redirect(`${process.env.FRONTEND_URL}/bookings/${bookingId}?payment=fail`);
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Handle VNPAY IPN (Backend Callback)
 */
const vnpayIPN = async (req, res, next) => {
  try {
    const query = req.query;
    const isValid = vnpay.verifyReturnUrl(query);
    if (!isValid) return res.json({ RspCode: '97', Message: 'Fail checksum' });

    const bookingId = query.vnp_TxnRef;
    const responseCode = query.vnp_ResponseCode;

    const isCode = isNaN(Number(bookingId));
    const where = isCode ? { booking_code: bookingId } : { id: bookingId };
    const booking = await db.Booking.findOne({ where });
    if (!booking) return res.json({ RspCode: '01', Message: 'Order not found' });
    if (booking.payment_status === 'paid') return res.json({ RspCode: '02', Message: 'Order already confirmed' });

    if (responseCode === '00') {
      await handlePaymentSuccess(req, bookingId, query.vnp_TransactionNo);
      res.json({ RspCode: '00', Message: 'Success' });
    } else {
      res.json({ RspCode: '00', Message: 'Fail recorded' });
    }
  } catch (err) {
    next(err);
  }
};

const { sendEmail } = require('../utils/mailer');

async function handlePaymentSuccess(req, bookingId, transactionId) {
  const isCode = isNaN(Number(bookingId));
  const where = isCode ? { booking_code: bookingId } : { id: bookingId };
  
  const booking = await db.Booking.findOne({
    where,
    include: [{ model: db.User, as: 'user' }]
  });
  if (!booking) return;

  // Anti-duplicate: If already paid, don't process again
  if (booking.payment_status === 'paid') {
    console.log(`Payment for booking ${bookingId} already processed.`);
    return;
  }

  // 1. Update Booking
  await booking.update({ payment_status: 'paid', status: 'confirmed' });

  // 2. Create Payment Record (Tier-based financial tracking)
  await db.Payment.create({
    booking_id: booking.id,
    amount: booking.total_price,
    method: 'vnpay',
    status: 'completed',
    transaction_id: transactionId,
    note: 'Thanh toán qua VNPAY'
  });

  // 3. Update Owner's Wallet (Tier 1)
  const venue = await db.Venue.findByPk(booking.venue_id);
  if (venue) {
    const owner = await db.User.findByPk(venue.owner_id);
    if (owner && booking.owner_revenue > 0) {
      await owner.increment('wallet_balance', { by: booking.owner_revenue });
    }
  }

  // Socket notifications
  const io = req.app.get('io');
  io?.to(`venue-${booking.venue_id}`).emit('booking-status-updated', { id: booking.id, status: 'paid' });
  io?.to('admin-room').emit('booking-status-updated', { id: booking.id, status: 'paid' });

  // 4. Send confirmation email
  if (booking.user?.email) {
    sendEmail({
      to: booking.user.email,
      subject: '✅ Thanh toán thành công (VNPAY) - Pickleball Hub',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <p>Chào <strong>${booking.user.name}</strong>,</p>
          <p>Đơn đặt sân <strong>${booking.booking_code}</strong> đã được thanh toán thành công qua VNPAY.</p>
          <p>Hẹn gặp bạn tại sân!</p>
        </div>
      `
    }).catch(e => console.error('Payment Email failed', e));
  }
}

module.exports = {
  createVNPayUrl,
  vnpayReturn,
  vnpayIPN
};
