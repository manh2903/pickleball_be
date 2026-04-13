const db = require("../models");
const { ApiError } = require("../middleware/errorMiddleware");
const { Op } = require("sequelize");

/**
 * GET /api/admin/stats
 * Platform-wide overview stats
 */
const adminGetStats = async (req, res, next) => {
  try {
    // 1. Total Revenue (platform wide)
    const totalRevenue = await db.Booking.sum("total_price", {
      where: { status: { [Op.ne]: "cancelled" }, payment_status: "paid" },
    });

    // 2. Platform Revenue (total commission) - LEGACY: Set to 0
    const platformRevenue = 0;

    // 3. Active Venues
    const activeVenues = await db.Venue.count({ where: { status: "active" } });

    // 4. Total Bookings
    const totalBookings = await db.Booking.count({
      where: { status: { [Op.ne]: "cancelled" } },
    });

    // 5. New Users (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsers = await db.User.count({
      where: { role: "user", created_at: { [Op.gte]: thirtyDaysAgo } },
    });

    // 6. Recent Venues (pending review)
    const recentVenues = await db.Venue.findAll({
      where: { status: "pending_review" },
      include: [{ model: db.User, as: "owner", attributes: ["id", "name", "email"] }],
      limit: 5,
      order: [["created_at", "DESC"]],
    });

    res.json({
      success: true,
      data: {
        totalRevenue: totalRevenue || 0,
        platformRevenue: platformRevenue || 0,
        activeVenues,
        totalBookings,
        newUsers,
        recentVenues,
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

    res.json({
      success: true,
      data: {
        users: rows,
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/users/:id/status
 */
const adminUpdateUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const user = await db.User.findByPk(req.params.id);
    if (!user) throw new ApiError(404, "Không tìm thấy người dùng");

    // Prevent blocking yourself or other admins
    if (user.role === "admin") throw new ApiError(403, "Không thể thao tác trên tài khoản admin");

    await user.update({ status });
    res.json({ success: true, message: `Trạng thái tài khoản đã được cập nhật thành: ${status}`, data: user });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/settings
 */
const adminGetSettings = async (req, res, next) => {
  try {
    const settings = await db.PlatformSetting.findAll();
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
};

const { sendEmail } = require("../utils/mailer");

/**
 * PUT /api/admin/settings/:key
 */
const adminUpdateSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    const [setting, created] = await db.PlatformSetting.findOrCreate({
      where: { key },
      defaults: { value, description, group: "general" },
    });

    if (!created) {
      await setting.update({ value, description });
    }

    res.json({ success: true, message: `Cập nhật cài đặt ${key} thành công`, data: setting });
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
};
