const db = require('../models');
const { ApiError } = require('../middleware/errorMiddleware');
const { getActiveSubscription } = require('../utils/subscriptionHelper');
const vnpay = require('../utils/vnpay');
const { sendEmail } = require('../utils/mailer');

/**
 * GET /api/subscriptions/plans - Public listing of available plans with options
 */
const getPlans = async (req, res, next) => {
  try {
    const plans = await db.SubscriptionPlan.findAll({
      where: { is_active: true },
      include: [{
        model: db.SubscriptionOption,
        as: 'options',
        where: { is_active: true }
      }],
      order: [['id', 'ASC']]
    });
    res.json({ success: true, data: plans });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/subscriptions/my - Get current active subscription for owner
 */
const getMySubscription = async (req, res, next) => {
  try {
    const sub = await getActiveSubscription(req.user.id);
    res.json({ success: true, data: sub });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/subscriptions/purchase - Initiate VNPay payment for an option
 */
const purchasePlan = async (req, res, next) => {
  try {
    const { option_id } = req.body;
    const user_id = req.user.id;

    const option = await db.SubscriptionOption.findOne({
      where: { id: option_id, is_active: true },
      include: [{ model: db.SubscriptionPlan, as: 'plan' }]
    });

    if (!option) throw new ApiError(404, 'Không tìm thấy tùy chọn thanh toán');

    const amount = parseFloat(option.price);
    
    // If it's the free plan, we just assign it directly
    if (amount === 0) {
      const now = new Date();
      const endDate = new Date();
      endDate.setMonth(now.getMonth() + option.duration_months);

      await db.OwnerSubscription.update({ status: 'cancelled' }, { where: { owner_id: user_id, status: 'active' } });

      const newSub = await db.OwnerSubscription.create({
        owner_id: user_id,
        plan_id: option.plan_id,
        option_id: option.id,
        start_date: now,
        end_date: endDate,
        status: 'active'
      });

      return res.json({ success: true, message: 'Đã kích hoạt gói miễn phí thành công.', data: newSub });
    }

    // 1. Create a Payment record first (Pending)
    const txnRef = `SUB_${user_id}_${option.id}_${Date.now()}`;
    console.log(`[Subscription] Creating pending payment for user ${user_id}, amount ${amount}, ref ${txnRef}`);
    
    try {
        await db.Payment.create({
          payment_type: 'subscription',
          subscription_option_id: option.id,
          user_id: user_id,
          amount: amount,
          method: 'vnpay',
          status: 'pending',
          transaction_id: txnRef,
          note: `Thanh toán gói ${option.plan.name} - ${option.duration_months} tháng`
        });
        console.log(`[Subscription] Payment record created successfully.`);
    } catch (dbErr) {
        console.error(`[Subscription] Failed to create Payment record:`, dbErr.message);
        throw dbErr;
    }

    // 2. Prepare VNPay URL
    const protocol = req.protocol;
    const host = req.get('host');
    const returnUrl = `${protocol}://${host}/api/subscriptions/vnpay_return`;

    const paymentUrl = vnpay.createPaymentUrl(req, {
      orderId: txnRef,
      amount: amount,
      returnUrl: returnUrl
    });

    res.json({ 
      success: true, 
      paymentUrl,
      message: 'Đang tạo giao dịch và chuyển hướng...'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/subscriptions/vnpay_return
 * Verification and processing of VNPay results
 */
const vnpayReturn = async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const isValid = vnpay.verifyReturnUrl(req.query);
    if (!isValid) throw new ApiError(400, 'Chữ ký thanh toán không hợp lệ');

    const vnp_ResponseCode = req.query.vnp_ResponseCode;
    const vnp_TxnRef = req.query.vnp_TxnRef; 
    const vnp_TransactionNo = req.query.vnp_TransactionNo;

    // Find the pending payment
    const payment = await db.Payment.findOne({ 
      where: { transaction_id: vnp_TxnRef, status: 'pending' },
      transaction: t
    });

    if (!payment) {
      await t.rollback();
      return res.redirect(`${process.env.FRONTEND_URL}/owner/subscription?status=error&message=transaction_not_found`);
    }

    if (vnp_ResponseCode === '00') {
      const parts = vnp_TxnRef.split('_');
      const userId = payment.user_id;
      const optionId = payment.subscription_option_id;

      const option = await db.SubscriptionOption.findByPk(optionId, {
        include: [{ model: db.SubscriptionPlan, as: 'plan' }],
        transaction: t
      });

      const user = await db.User.findByPk(userId, { transaction: t });

      const now = new Date();
      const endDate = new Date();
      endDate.setMonth(now.getMonth() + option.duration_months);

      // 1. Update Payment record
      await payment.update({ 
        status: 'completed', 
        transaction_id: `${vnp_TxnRef}_${vnp_TransactionNo}` // Keep external ID
      }, { transaction: t });

      // 2. Deactivate old subscription
      await db.OwnerSubscription.update(
        { status: 'cancelled' },
        { where: { owner_id: userId, status: 'active' }, transaction: t }
      );

      // 3. Create new active subscription
      await db.OwnerSubscription.create({
        owner_id: userId,
        plan_id: option.plan_id,
        option_id: option.id,
        start_date: now,
        end_date: endDate,
        status: 'active'
      }, { transaction: t });

      await t.commit();

      // 4. Send email (Async - no await needed for redirect speed)
      if (user.email) {
          sendEmail({
              to: user.email,
              subject: '💎 Nâng cấp gói dịch vụ thành công - Pickleball Marketplace',
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
                  <h2>Chúc mừng nâng cấp thành công!</h2>
                  <p>Chào ${user.name}, gói <strong>${option.plan.name}</strong> của bạn đã được kích hoạt.</p>
                  <p>Thời hạn: ${option.duration_months} tháng. Hết hạn ngày: ${endDate.toLocaleDateString('vi-VN')}</p>
                </div>
              `
          }).catch(e => console.error('Email error:', e));
      }

      return res.redirect(`${process.env.FRONTEND_URL}/owner/subscription?status=success`);
    } else {
      // Payment failed at VNPay
      await payment.update({ status: 'failed' }, { transaction: t });
      await t.commit();
      return res.redirect(`${process.env.FRONTEND_URL}/owner/subscription?status=error`);
    }
  } catch (err) {
    if (!t.finished) await t.rollback();
    next(err);
  }
};

/**
 * ADMIN: Create/Update Plans & Options
 */
const adminCreatePlan = async (req, res, next) => {
  try {
    const plan = await db.SubscriptionPlan.create(req.body);
    res.status(201).json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
};

const adminUpdatePlan = async (req, res, next) => {
  try {
    const plan = await db.SubscriptionPlan.findByPk(req.params.id);
    if (!plan) throw new ApiError(404, 'Không tìm thấy gói');
    await plan.update(req.body);
    res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPlans,
  getMySubscription,
  purchasePlan,
  vnpayReturn,
  adminCreatePlan,
  adminUpdatePlan
};
