const db = require("../models");
const vnpay = require("../utils/vnpay");
const { ApiError } = require("../middleware/errorMiddleware");

/**
 * VNPay Payment Controller
 */
const createVNPayUrl = async (req, res, next) => {
  try {
    const { bookingId } = req.body;

    const isCode = isNaN(Number(bookingId));
    const where = isCode ? { booking_code: bookingId } : { id: bookingId };

    const booking = await db.Booking.findOne({ where });
    if (!booking) throw new ApiError(404, "Không tìm thấy đơn đặt sân");
    if (booking.payment_status === "paid") throw new ApiError(400, "Đơn đặt sân đã được thanh toán");

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
 * GET /api/payments/my - Get user's payment history
 */
const getMyPayments = async (req, res, next) => {
  try {
    const payments = await db.Payment.findAll({
      where: { user_id: req.user.id },
      include: [
        { 
          model: db.SubscriptionOption, 
          as: 'option',
          include: [{ model: db.SubscriptionPlan, as: 'plan' }]
        }
      ],
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: payments });
  } catch (err) {
    next(err);
  }
};

/**
 * Handle VNPAY Return URL (User Redirect)
 * VNPay calls this when user is redirected back after payment
 */
const vnpayReturn = async (req, res, next) => {
  try {
    const query = req.query;
    const isValid = vnpay.verifyReturnUrl(query);
    const bookingId = query.vnp_TxnRef;
    const responseCode = query.vnp_ResponseCode;

    if (isValid && responseCode === "00") {
      await handlePaymentSuccess(req, bookingId, query.vnp_TransactionNo);
      res.redirect(`${process.env.FRONTEND_URL}/bookings/${bookingId}?payment=success`);
    } else {
      res.redirect(`${process.env.FRONTEND_URL}/bookings/${bookingId}?payment=fail`);
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Handle VNPAY IPN (Server-to-Server Callback)
 * VNPay calls this independently — may run concurrently with vnpayReturn!
 */
const vnpayIPN = async (req, res, next) => {
  try {
    const query = req.query;
    const isValid = vnpay.verifyReturnUrl(query);
    if (!isValid) return res.json({ RspCode: "97", Message: "Fail checksum" });

    const bookingId = query.vnp_TxnRef;
    const responseCode = query.vnp_ResponseCode;

    if (responseCode === "00") {
      await handlePaymentSuccess(req, bookingId, query.vnp_TransactionNo);
      res.json({ RspCode: "00", Message: "Success" });
    } else {
      // Mark booking payment as failed (optional)
      res.json({ RspCode: "00", Message: "Fail recorded" });
    }
  } catch (err) {
    next(err);
  }
};

const { sendNotification } = require("../services/notificationService");
const { sendEmail } = require("../utils/mailer");

/**
 * Core payment success handler — IDEMPOTENT & RACE-CONDITION SAFE
 * 
 * Strategy: Use DB Transaction + Pessimistic Lock (SELECT FOR UPDATE) to ensure
 * that even if vnpayReturn and vnpayIPN fire simultaneously, only ONE will
 * actually process the payment. The second will see payment_status = 'paid'
 * inside the locked transaction and safely exit.
 */
async function handlePaymentSuccess(req, bookingId, transactionId) {
  const t = await db.sequelize.transaction();
  try {
    const isCode = isNaN(Number(bookingId));
    const where = isCode ? { booking_code: bookingId } : { id: bookingId };

    // --- CRITICAL: SELECT FOR UPDATE (Pessimistic Lock) ---
    // Locks this booking row in DB. Any concurrent call will WAIT here
    // until the first transaction commits or rolls back.
    // This is the ONLY safe way to prevent double-processing.
    const booking = await db.Booking.findOne({
      where,
      include: [{ model: db.User, as: "user" }],
      lock: t.LOCK.UPDATE,   // ← SELECT FOR UPDATE
      transaction: t,
    });

    if (!booking) {
      await t.rollback();
      console.warn(`[Payment] Booking not found: ${bookingId}`);
      return;
    }

    // --- IDEMPOTENCY CHECK (inside the lock) ---
    // Now this check is safe — no concurrent call can sneak past here
    if (booking.payment_status === "paid") {
      await t.rollback();
      console.log(`[Payment] Already processed (idempotent skip): ${bookingId}`);
      return;
    }

    // 1. Mark booking as paid (inside transaction)
    await booking.update(
      { payment_status: "paid", status: "confirmed" },
      { transaction: t }
    );

    // 2. Create Payment Record
    await db.Payment.create({
      booking_id: booking.id,
      amount: booking.total_price,
      method: "vnpay",
      status: "completed",
      transaction_id: transactionId,
      note: "Thanh toán qua VNPAY",
    }, { transaction: t });

    // 3. Credit Owner's Wallet (inside same transaction — atomic with step 1&2)
    const venue = await db.Venue.findByPk(booking.venue_id, { transaction: t });
    let owner = null;
    let amountToCredit = 0;

    if (venue) {
      owner = await db.User.findByPk(venue.owner_id, { transaction: t });
      amountToCredit = parseFloat(booking.owner_revenue || booking.total_price || 0);
      if (owner && amountToCredit > 0) {
        await owner.increment("wallet_balance", { by: amountToCredit, transaction: t });
      }
    }

    // Commit everything atomically — if any step above fails, ALL roll back
    await t.commit();
    console.log(`[Payment] ✅ Success: ${bookingId} | +${amountToCredit}đ → owner #${owner?.id}`);

    // --- Side effects AFTER commit (non-critical, can fail without data loss) ---
    const io = req.app.get("io");

    if (owner && amountToCredit > 0) {
      sendNotification(io, {
        userId: owner.id,
        type: 'booking_confirmed',
        title: '🔔 Đơn đặt sân mới đã thanh toán',
        body: `Đơn ${booking.booking_code} đã thanh toán. +${amountToCredit.toLocaleString()}đ vào ví.`,
        data: { booking_id: booking.id }
      }).catch(e => console.error('[Notify owner]', e));
    }

    sendNotification(io, {
      userId: 1,
      type: 'payment_received',
      title: '💰 Giao dịch thành công',
      body: `${booking.total_price.toLocaleString()} VNĐ — ${booking.booking_code}`,
      data: { booking_id: booking.id }
    }).catch(e => console.error('[Notify admin]', e));

    io?.to(`venue-${booking.venue_id}`).emit("booking-status-updated", { id: booking.id, status: "paid" });
    io?.to("admin-room").emit("booking-status-updated", { id: booking.id, status: "paid" });

    if (booking.user?.email) {
      sendEmail({
        to: booking.user.email,
        subject: "✅ Thanh toán thành công (VNPAY) - Pickleball Court Marketplace",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p>Chào <strong>${booking.user.name}</strong>,</p>
            <p>Đơn đặt sân <strong>${booking.booking_code}</strong> đã được thanh toán thành công qua VNPAY.</p>
            <p>Số tiền: <strong>${new Intl.NumberFormat('vi-VN').format(booking.total_price)}đ</strong></p>
            <p>Hẹn gặp bạn tại sân! 🏸</p>
          </div>
        `,
      }).catch((e) => console.error("Payment Email failed", e));
    }
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error(`[Payment] ❌ Error processing ${bookingId}:`, err.message);
    throw err;
  }
}

module.exports = {
  createVNPayUrl,
  getMyPayments,
  vnpayReturn,
  vnpayIPN,
};
