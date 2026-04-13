const db = require("../models");
const { ApiError } = require("../middleware/errorMiddleware");
const { Op } = require("sequelize");

/**
 * GET /api/admin/stats
 */
const adminGetStats = async (req, res, next) => {
  try {
    // 1. Total Booking Revenue (Gross Volume across all venues)
    const totalVolume = await db.Booking.sum("total_price", {
      where: { status: { [Op.ne]: "cancelled" }, payment_status: "paid" },
    });

    // 2. Actual Platform Revenue (Subscriptions)
    const subscriptionRevenue = await db.Payment.sum("amount", {
      where: { payment_type: "subscription", status: "completed" }
    });

    const activeVenues = await db.Venue.count({ where: { status: "active" } });
    const totalBookings = await db.Booking.count({
      where: { status: { [Op.ne]: "cancelled" } },
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsers = await db.User.count({
      where: { role: "user", created_at: { [Op.gte]: thirtyDaysAgo } },
    });

    const recentVenues = await db.Venue.findAll({
      where: { status: "pending_review" },
      include: [{ model: db.User, as: "owner", attributes: ["id", "name", "email"] }],
      limit: 5,
      order: [["created_at", "DESC"]],
    });

    res.json({
      success: true,
      data: { 
        totalVolume: totalVolume || 0, 
        subscriptionRevenue: subscriptionRevenue || 0,
        activeVenues, 
        totalBookings, 
        newUsers, 
        recentVenues 
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/users
 */
const adminGetUsers = async (req, res, next) => {
  try {
    const { role, status, search, page = 1, limit = 20 } = req.query;
    const where = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [{ name: { [Op.like]: `%${search}%` } }, { email: { [Op.like]: `%${search}%` } }, { phone: { [Op.like]: `%${search}%` } }];
    }

    const { count, rows } = await db.User.findAndCountAll({
      where,
      attributes: { exclude: ["password_hash", "refresh_token"] },
      order: [["created_at", "DESC"]],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({ success: true, data: { users: rows, total: count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) } });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/users/:id/status
 */
const adminUpdateUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const user = await db.User.findByPk(id);
    if (!user) throw new ApiError(404, "Không tìm thấy người dùng");
    await user.update({ status });
    res.json({ success: true, message: "Cập nhật trạng thái thành công" });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/settings
 */
const adminGetSettings = async (req, res, next) => {
  try {
    const settings = await db.PlatformSetting.findAll({
        order: [['id', 'ASC']]
    });
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/settings/:key
 */
const adminUpdateSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    let setting = await db.PlatformSetting.findOne({ where: { key } });
    
    if (setting) {
        await setting.update({ 
            value: value.toString(), 
            updated_by: req.user.id 
        });
    } else {
        // Fallback create if somehow missing
        setting = await db.PlatformSetting.create({
            key,
            value: value.toString(),
            label: key,
            type: isNaN(value) ? 'text' : 'number',
            updated_by: req.user.id
        });
    }

    res.json({ success: true, message: `Cập nhật cài đặt thành công`, data: setting });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/payments/subscriptions
 */
const adminGetSubscriptionPayments = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { count, rows } = await db.Payment.findAndCountAll({
      where: { payment_type: 'subscription' },
      include: [
        { 
          model: db.User, 
          as: 'user', 
          attributes: ['id', 'name', 'email', 'phone'] 
        },
        { 
          model: db.SubscriptionOption, 
          as: 'subscriptionOption', 
          include: [{ model: db.SubscriptionPlan, as: 'plan', attributes: ['name'] }]
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    res.json({ 
      success: true, 
      data: { 
        payments: rows, 
        total: count,
        page: parseInt(page) 
      } 
    });
  } catch (err) {
    next(err);
  }
};

const adminGetUserDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await db.User.findByPk(id, {
      attributes: { exclude: ["password_hash", "refresh_token"] }
    });

    if (!user) throw new ApiError(404, "Không tìm thấy người dùng");

    const detail = { user };

    if (user.role === 'owner') {
      // Get active subscription
      const subscription = await db.OwnerSubscription.findOne({
        where: { owner_id: id, status: 'active' },
        include: [{ 
          model: db.SubscriptionOption, 
          as: 'option',
          include: [{ model: db.SubscriptionPlan, as: 'plan' }]
        }]
      });
      detail.subscription = subscription;

      // Count venues
      const venueCount = await db.Venue.count({ where: { owner_id: id } });
      detail.venueCount = venueCount;
    } else if (user.role === 'user') {
      // Get recent bookings
      const bookings = await db.Booking.findAll({
        where: { user_id: id },
        include: [{ model: db.Venue, as: 'venue', attributes: ['name'] }],
        limit: 10,
        order: [['created_at', 'DESC']]
      });
      detail.recentBookings = bookings;
    }

    res.json({ success: true, data: detail });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  adminGetStats,
  adminGetUsers,
  adminUpdateUserStatus,
  adminGetSettings,
  adminUpdateSetting,
  adminGetSubscriptionPayments,
  adminGetUserDetail,
};
