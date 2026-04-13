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
 * ... purchasePlan and vnpayReturn logic (Omitted for brevity but preserved) ...
 */
const purchasePlan = async (req, res, next) => {
    try {
        const { option_id } = req.body;
        const user_id = req.user.id;
        const option = await db.SubscriptionOption.findOne({ where: { id: option_id, is_active: true }, include: [{ model: db.SubscriptionPlan, as: 'plan' }] });
        if (!option) throw new ApiError(404, 'Không tìm thấy tùy chọn thanh toán');
        const amount = parseFloat(option.price);
        if (amount === 0) {
            const now = new Date(); const endDate = new Date(); endDate.setMonth(now.getMonth() + option.duration_months);
            await db.OwnerSubscription.update({ status: 'cancelled' }, { where: { owner_id: user_id, status: 'active' } });
            const newSub = await db.OwnerSubscription.create({ owner_id: user_id, plan_id: option.plan_id, option_id: option.id, start_date: now, end_date: endDate, status: 'active' });
            return res.json({ success: true, message: 'Đã kích hoạt gói miễn phí thành công.', data: newSub });
        }
        const txnRef = `SUB_${user_id}_${option.id}_${Date.now()}`;
        await db.Payment.create({ payment_type: 'subscription', subscription_option_id: option.id, user_id, amount, method: 'vnpay', status: 'pending', transaction_id: txnRef, note: `Thanh toán gói ${option.plan.name}` });
        const protocol = req.protocol; const host = req.get('host');
        const returnUrl = `${protocol}://${host}/api/subscriptions/vnpay_return`;
        const paymentUrl = vnpay.createPaymentUrl(req, { orderId: txnRef, amount, returnUrl });
        res.json({ success: true, paymentUrl, message: 'Đang tạo giao dịch...' });
    } catch(err) { next(err); }
};

const vnpayReturn = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const isValid = vnpay.verifyReturnUrl(req.query);
        if (!isValid) throw new ApiError(400, 'Chữ ký không hợp lệ');
        const { vnp_ResponseCode, vnp_TxnRef, vnp_TransactionNo } = req.query;
        const payment = await db.Payment.findOne({ where: { transaction_id: vnp_TxnRef, status: 'pending' }, transaction: t });
        if (!payment) { await t.rollback(); return res.redirect(`${process.env.FRONTEND_URL}/owner/subscription?status=error`); }
        if (vnp_ResponseCode === '00') {
            const userId = payment.user_id; const optionId = payment.subscription_option_id;
            const option = await db.SubscriptionOption.findByPk(optionId, { include: [{ model: db.SubscriptionPlan, as: 'plan' }], transaction: t });
            const user = await db.User.findByPk(userId, { transaction: t });
            const now = new Date(); const endDate = new Date(); endDate.setMonth(now.getMonth() + option.duration_months);
            await payment.update({ status: 'completed', transaction_id: `${vnp_TxnRef}_${vnp_TransactionNo}` }, { transaction: t });
            await db.OwnerSubscription.update({ status: 'cancelled' }, { where: { owner_id: userId, status: 'active' }, transaction: t });
            await db.OwnerSubscription.create({ owner_id: userId, plan_id: option.plan_id, option_id: option.id, start_date: now, end_date: endDate, status: 'active' }, { transaction: t });
            await t.commit();
            if(user.email) sendEmail({ to: user.email, subject: '💎 Nâng cấp thành công', html: 'Chúc mừng bạn!' }).catch(e => {});
            return res.redirect(`${process.env.FRONTEND_URL}/owner/subscription?status=success`);
        } else {
            await payment.update({ status: 'failed' }, { transaction: t }); await t.commit();
            return res.redirect(`${process.env.FRONTEND_URL}/owner/subscription?status=error`);
        }
    } catch(err) { if(!t.finished) await t.rollback(); next(err); }
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

/**
 * PUT /api/subscriptions/admin/options/:id
 */
const adminUpdateOption = async (req, res, next) => {
  try {
    const option = await db.SubscriptionOption.findByPk(req.params.id, {
        include: [{ model: db.SubscriptionPlan, as: 'plan' }]
    });
    if (!option) throw new ApiError(404, 'Không tìm thấy tùy chọn gói');
    
    const { price, max_venues, max_courts_per_venue, features, is_active } = req.body;
    
    await option.update({
        price: price !== undefined ? price : option.price,
        max_venues: max_venues !== undefined ? max_venues : option.max_venues,
        max_courts_per_venue: max_courts_per_venue !== undefined ? max_courts_per_venue : option.max_courts_per_venue,
        features: features !== undefined ? features : option.features,
        is_active: is_active !== undefined ? is_active : option.is_active
    });

    // NOTIFY OWNERS
    const activeSubs = await db.OwnerSubscription.findAll({
        where: { option_id: option.id, status: 'active' },
        include: [{ model: db.User, as: 'owner', attributes: ['name', 'email'] }]
    });

    console.log(`[Admin] Updating Option ${option.id}. Notifying ${activeSubs.length} owners.`);

    activeSubs.forEach(sub => {
        if (sub.owner?.email) {
            sendEmail({
                to: sub.owner.email,
                subject: `📢 Cập nhật chính sách gói ${option.plan.name} - Pickleball Marketplace`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; line-height: 1.6;">
                        <h2 style="color: #DC2626;">Thông báo cập nhật gói dịch vụ</h2>
                        <p>Chào <strong>${sub.owner.name}</strong>,</p>
                        <p>Chúng tôi vừa cập nhật một số thông số cho gói <strong>${option.plan.name}</strong> mà bạn đang sử dụng:</p>
                        <ul style="background: #f8fafc; padding: 15px; border-radius: 8px; list-style: none;">
                            <li>✅ Hạn mức cơ sở: <strong>${option.max_venues}</strong></li>
                            <li>✅ Sân tối đa mỗi cơ sở: <strong>${option.max_courts_per_venue}</strong></li>
                            <li>✅ Tính năng: Báo cáo (${option.features?.analytics ? 'Bật' : 'Tắt'}), Nhân viên (${option.features?.staff_management ? 'Bật' : 'Tắt'})</li>
                        </ul>
                        <p>Các thay đổi này có hiệu lực ngay lập tức đối với tài khoản của bạn. Cảm ơn bạn đã tin tưởng đồng hành cùng chúng tôi.</p>
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                        <footer style="font-size: 12px; color: #64748b;">Đây là email tự động từ hệ thống quản trị Pickleball Marketplace.</footer>
                    </div>
                `
            }).catch(e => console.error(`Failed to send update email to ${sub.owner.email}:`, e));
        }
    });

    res.json({ success: true, message: `Đã cập nhật và thông báo tới ${activeSubs.length} chủ sân.`, data: option });
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
  adminUpdatePlan,
  adminUpdateOption
};
