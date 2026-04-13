const db = require('../models');
const { ApiError } = require('../middleware/errorMiddleware');
const { getActiveSubscription } = require('../utils/subscriptionHelper');
const { Op } = require('sequelize');

/**
 * GET /api/subscriptions/plans - Public listing of available plans
 */
const getPlans = async (req, res, next) => {
  try {
    const plans = await db.SubscriptionPlan.findAll({
      where: { is_active: true },
      order: [['price', 'ASC']]
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
 * POST /api/subscriptions/purchase - Initiate VNPay payment for a plan
 */
const purchasePlan = async (req, res, next) => {
  try {
    const { plan_id } = req.body;
    const plan = await db.SubscriptionPlan.findByPk(plan_id);
    if (!plan) throw new ApiError(404, 'Không tìm thấy gói dịch vụ');

    // Create a temporary payment record or order
    const amount = parseFloat(plan.price);
    
    // Logic for VNPay integration
    // For now, let's create a Pending record.
    // In a real scenario, you'd call a vnpayHelper to generate a URL.
    
    // TODO: Integrate VNPay here
    res.json({ 
      success: true, 
      message: 'Tính năng tích hợp VNPay cho gói đang được hoàn thiện. Vui lòng liên hệ admin.',
      data: { plan, amount } 
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: Create/Update Plans
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
