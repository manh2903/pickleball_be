const db = require('../models');
const { ApiError } = require('../middleware/errorMiddleware');
const { getActiveSubscription } = require('../utils/subscriptionHelper');
const vnpay = require('../utils/vnpay');
const { sendEmail } = require('../utils/mailer');

/**
 * Public listing of available plans
 */
const getPlans = async (req, res, next) => {
  try {
    const plans = await db.SubscriptionPlan.findAll({
      where: { is_active: true },
      include: [{ model: db.SubscriptionOption, as: 'options', where: { is_active: true } }],
      order: [['id', 'ASC']]
    });
    res.json({ success: true, data: plans });
  } catch (err) { next(err); }
};

const getMySubscription = async (req, res, next) => {
  try {
    const sub = await getActiveSubscription(req.user.id);
    res.json({ success: true, data: sub });
  } catch (err) { next(err); }
};

const purchasePlan = async (req, res, next) => {
    try {
        const { option_id } = req.body;
        const user_id = req.user.id;
        const option = await db.SubscriptionOption.findOne({ where: { id: option_id, is_active: true }, include: [{ model: db.SubscriptionPlan, as: 'plan' }] });
        if (!option) throw new ApiError(404, 'Không tìm thấy tùy chọn thanh toán');
        
        const amount = parseFloat(option.price);
        if (amount === 0) {
            const now = new Date(); const endDate = new Date(); endDate.setMonth(now.getMonth() + (option.duration_months || 120));
            await db.OwnerSubscription.update({ status: 'cancelled' }, { where: { owner_id: user_id, status: 'active' } });
            const newSub = await db.OwnerSubscription.create({ owner_id: user_id, plan_id: option.plan_id, option_id: option.id, start_date: now, end_date: endDate, status: 'active' });
            return res.json({ success: true, message: 'Đã kích hoạt gói thành công.', data: newSub });
        }

        const txnRef = `SUB_${user_id}_${option.id}_${Date.now()}`;
        await db.Payment.create({ 
            payment_type: 'subscription', subscription_option_id: option.id, user_id, 
            amount, method: 'vnpay', status: 'pending', transaction_id: txnRef, 
            note: `Thanh toán gói ${option.plan.name}` 
        });

        const protocol = req.protocol; const host = req.get('host');
        const returnUrl = `${process.env.BACKEND_URL || `${protocol}://${host}`}/api/subscriptions/vnpay_return`;
        const paymentUrl = vnpay.createPaymentUrl(req, { orderId: txnRef, amount, returnUrl });
        res.json({ success: true, data: paymentUrl });
    } catch(err) { next(err); }
};

/**
 * SHARED LOGIC: Handle successful subscription payment with RACE CONDITION protection
 */
async function handleSubscriptionSuccess(txnRef, transactionNo) {
    const t = await db.sequelize.transaction();
    try {
        // --- PESSIMISTIC LOCK: SELECT FOR UPDATE ---
        const payment = await db.Payment.findOne({ 
            where: { transaction_id: txnRef },
            lock: t.LOCK.UPDATE,
            transaction: t 
        });

        if (!payment) { await t.rollback(); return { success: false, msg: 'Payment not found' }; }
        
        // IDEMPOTENCY CHECK
        if (payment.status === 'completed') { await t.rollback(); return { success: true, alreadyProcessed: true }; }

        const option = await db.SubscriptionOption.findByPk(payment.subscription_option_id, { 
            include: [{ model: db.SubscriptionPlan, as: 'plan' }], 
            transaction: t 
        });
        
        const user = await db.User.findByPk(payment.user_id, { transaction: t });
        const now = new Date(); 
        const endDate = new Date(); 
        endDate.setMonth(now.getMonth() + (option.duration_months || 1));

        // 1. Update Payment
        await payment.update({ 
            status: 'completed', 
            transaction_id: `${txnRef}_${transactionNo}` 
        }, { transaction: t });

        // 2. Activate Subscription
        await db.OwnerSubscription.update({ status: 'cancelled' }, { 
            where: { owner_id: user.id, status: 'active' }, 
            transaction: t 
        });
        await db.OwnerSubscription.create({ 
            owner_id: user.id, plan_id: option.plan_id, option_id: option.id, 
            start_date: now, end_date: endDate, status: 'active' 
        }, { transaction: t });

        // 3. CREDIT ADMIN WALLET (PLATFORM REVENUE)
        const admin = await db.User.findOne({ 
            where: { role: 'admin' }, 
            order: [['id', 'ASC']], 
            transaction: t 
        });
        if (admin) {
            await admin.increment('wallet_balance', { by: payment.amount, transaction: t });
            console.log(`[Subscription] ✅ Admin #${admin.id} credited with ${payment.amount}đ`);
        }

        await t.commit();
        if(user.email) sendEmail({ to: user.email, subject: '💎 Nâng cấp thành công', html: 'Gói dịch vụ của bạn đã được kích hoạt.' }).catch(e => {});
        
        return { success: true, userId: user.id };
    } catch (err) {
        if (!t.finished) await t.rollback();
        throw err;
    }
}

const vnpayReturn = async (req, res, next) => {
    try {
        const isValid = vnpay.verifyReturnUrl(req.query);
        const { vnp_ResponseCode, vnp_TxnRef, vnp_TransactionNo } = req.query;
        
        if (isValid && vnp_ResponseCode === '00') {
            await handleSubscriptionSuccess(vnp_TxnRef, vnp_TransactionNo);
            return res.redirect(`${process.env.FRONTEND_URL}/owner/subscription?status=success`);
        }
        res.redirect(`${process.env.FRONTEND_URL}/owner/subscription?status=error`);
    } catch(err) { next(err); }
};

const vnpayIPN = async (req, res, next) => {
    try {
        const isValid = vnpay.verifyReturnUrl(req.query);
        if (!isValid) return res.json({ RspCode: "97", Message: "Fail checksum" });

        const { vnp_ResponseCode, vnp_TxnRef, vnp_TransactionNo } = req.query;
        if (vnp_ResponseCode === "00") {
            await handleSubscriptionSuccess(vnp_TxnRef, vnp_TransactionNo);
            res.json({ RspCode: "00", Message: "Success" });
        } else {
            res.json({ RspCode: "00", Message: "Fail recorded" });
        }
    } catch(err) { next(err); }
};

const adminCreatePlan = async (req, res, next) => {
  try {
    const plan = await db.SubscriptionPlan.create(req.body);
    res.status(201).json({ success: true, data: plan });
  } catch (err) { next(err); }
};

const adminUpdatePlan = async (req, res, next) => {
  try {
    const plan = await db.SubscriptionPlan.findByPk(req.params.id);
    if (!plan) throw new ApiError(404, 'Không tìm thấy gói');
    await plan.update(req.body);
    res.json({ success: true, data: plan });
  } catch (err) { next(err); }
};

const adminUpdateOption = async (req, res, next) => {
  try {
    const option = await db.SubscriptionOption.findByPk(req.params.id, { include: [{ model: db.SubscriptionPlan, as: 'plan' }] });
    if (!option) throw new ApiError(404, 'Không tìm thấy tùy chọn gói');
    await option.update(req.body);
    res.json({ success: true, data: option });
  } catch (err) { next(err); }
};

module.exports = {
  getPlans,
  getMySubscription,
  purchasePlan,
  vnpayReturn,
  vnpayIPN,
  adminCreatePlan,
  adminUpdatePlan,
  adminUpdateOption
};
