const db = require('../models');
const { ApiError } = require('../middleware/errorMiddleware');
const { getActiveSubscription } = require('../utils/subscriptionHelper');

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
    const option = await db.SubscriptionOption.findOne({
      where: { id: option_id, is_active: true },
      include: [{ model: db.SubscriptionPlan, as: 'plan' }]
    });

    if (!option) throw new ApiError(404, 'Không tìm thấy tùy chọn thanh toán');

    const amount = parseFloat(option.price);
    
    // Logic for VNPay integration
    // TODO: Integrate VNPay here
    res.json({ 
      success: true, 
      message: 'Tính năng tích hợp VNPay cho gói đang được hoàn thiện. Vui lòng liên hệ admin.',
      data: { 
        plan_name: option.plan.name, 
        duration: option.duration_months,
        amount 
      } 
    });
  } catch (err) {
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
  adminCreatePlan,
  adminUpdatePlan
};
