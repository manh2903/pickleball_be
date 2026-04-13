const db = require('../models');
const { ApiError } = require('../middleware/errorMiddleware');
const { Op } = require('sequelize');

/**
 * GET /api/owner/stats
 * Get overview stats for the owner's venue(s)
 */
const getStats = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    
    // 1. Get owner's venue(s)
    const { venue_id: queryVenueId } = req.query;
    const whereVenue = { owner_id: ownerId };
    if (queryVenueId) whereVenue.id = queryVenueId;

    const venues = await db.Venue.findAll({
      where: whereVenue,
      attributes: ['id', 'name']
    });
    
    const venueIds = venues.map(v => v.id);
    
    if (venueIds.length === 0) {
      return res.json({
        success: true,
        data: {
          totalBookings: 0,
          totalRevenue: 0,
          pendingBookings: 0,
          todayBookings: 0,
          revenueByDay: [],
          recentBookings: []
        }
      });
    }

    // 2. Total Bookings (non-cancelled)
    const totalBookings = await db.Booking.count({
      where: { 
        venue_id: { [Op.in]: venueIds },
        status: { [Op.ne]: 'cancelled' }
      }
    });

    // 3. Total Revenue (owner share)
    const totalRevenueResult = await db.Booking.sum('owner_revenue', {
      where: { 
        venue_id: { [Op.in]: venueIds },
        status: { [Op.ne]: 'cancelled' },
        payment_status: 'paid'
      }
    });

    // 4. Today Bookings
    const today = new Date().toISOString().split('T')[0];
    const todayBookings = await db.Booking.count({
      include: [{
        model: db.TimeSlot,
        as: 'slots',
        where: { date: today }
      }],
      where: { venue_id: { [Op.in]: venueIds } }
    });

    // 5. Recent Bookings (last 5)
    const recentBookings = await db.Booking.findAll({
      where: { venue_id: { [Op.in]: venueIds } },
      include: [
        { 
          model: db.TimeSlot, 
          as: 'slots', 
          attributes: ['date', 'start_time', 'end_time'],
          include: [{ model: db.Court, as: 'court', attributes: ['name'] }]
        },
        { model: db.User, as: 'user', attributes: ['name', 'phone'] }
      ],
      order: [['created_at', 'DESC']],
      limit: 5
    });

    // 6. Revenue for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const revenueByDay = await db.Booking.findAll({
      attributes: [
        [db.sequelize.fn('DATE', db.sequelize.col('created_at')), 'date'],
        [db.sequelize.fn('SUM', db.sequelize.col('total_price')), 'revenue']
      ],
      where: {
        venue_id: { [Op.in]: venueIds },
        status: { [Op.ne]: 'cancelled' },
        payment_status: 'paid',
        created_at: { [Op.gte]: sevenDaysAgo }
      },
      group: [db.sequelize.fn('DATE', db.sequelize.col('created_at'))],
      order: [[db.sequelize.fn('DATE', db.sequelize.col('created_at')), 'ASC']]
    });

    res.json({
      success: true,
      data: {
        totalBookings,
        totalRevenue: totalRevenueResult || 0,
        todayBookings,
        recentBookings,
        revenueByDay: revenueByDay.map(r => ({
          date: r.get('date'),
          revenue: parseFloat(r.get('revenue'))
        }))
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/owner/venues/:id/staffs
 */
const getVenueStaffs = async (req, res, next) => {
  try {
    const venueId = req.params.id;
    // Verify ownership
    const venue = await db.Venue.findOne({ where: { id: venueId, owner_id: req.user.id } });
    if (!venue) throw new ApiError(403, 'Bạn không có quyền quản lý địa điểm này');

    const staffs = await db.User.findAll({
      where: { venue_id: venueId, role: 'staff' },
      attributes: ['id', 'name', 'email', 'phone', 'status', 'created_at']
    });

    res.json({ success: true, data: staffs });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/owner/venues/:id/staffs
 */
const createVenueStaff = async (req, res, next) => {
  try {
    const venueId = req.params.id;
    const { name, email, phone, password } = req.body;
    
    // Verify ownership
    const venue = await db.Venue.findOne({ where: { id: venueId, owner_id: req.user.id } });
    if (!venue) throw new ApiError(403, 'Bạn không có quyền quản lý địa điểm này');

    // Check if user exists
    const existing = await db.User.findOne({ where: { email } });
    if (existing) throw new ApiError(400, 'Email này đã được sử dụng');

    const bcrypt = require('bcryptjs');
    const password_hash = await bcrypt.hash(password, 10);

    const staff = await db.User.create({
      name, email, phone, password_hash,
      role: 'staff',
      venue_id: venueId,
      status: 'active'
    });

    res.status(201).json({ success: true, message: 'Tạo tài khoản nhân viên thành công', data: staff });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/owner/venues/:id/reports
 * Get detailed financial/booking reports for a specific venue
 */
const getReports = async (req, res, next) => {
  try {
    const venueId = req.params.id;
    const { period = '7days' } = req.query;

    // Verify ownership
    const venue = await db.Venue.findOne({ where: { id: venueId, owner_id: req.user.id } });
    if (!venue) throw new ApiError(403, 'Bạn không có quyền quản lý địa điểm này');

    // Define time range
    let startDate = new Date();
    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === '7days') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30days') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === 'thisMonth') {
      startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    }

    // 1. Core KPIs
    const totalBookings = await db.Booking.count({
      where: { venue_id: venueId, created_at: { [Op.gte]: startDate }, status: { [Op.ne]: 'cancelled' } }
    });

    const totalRevenueResult = await db.Booking.sum('owner_revenue', {
      where: { venue_id: venueId, created_at: { [Op.gte]: startDate }, status: { [Op.ne]: 'cancelled' }, payment_status: 'paid' }
    });

    const avgBookingValue = totalBookings > 0 ? (totalRevenueResult || 0) / totalBookings : 0;

    // 2. Daily Revenue (for chart)
    const dailyRevenue = await db.Booking.findAll({
      attributes: [
        [db.sequelize.fn('DATE', db.sequelize.col('created_at')), 'date'],
        [db.sequelize.fn('SUM', db.sequelize.col('owner_revenue')), 'revenue'],
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'bookings']
      ],
      where: { venue_id: venueId, created_at: { [Op.gte]: startDate }, status: { [Op.ne]: 'cancelled' }, payment_status: 'paid' },
      group: [db.sequelize.fn('DATE', db.sequelize.col('created_at'))],
      order: [[db.sequelize.fn('DATE', db.sequelize.col('created_at')), 'ASC']]
    });

    // 3. Top Courts (via TimeSlots)
    const topCourts = await db.Booking.findAll({
      attributes: [
        [db.sequelize.col('slots.court.name'), 'name'],
        [db.sequelize.fn('COUNT', db.sequelize.col('Booking.id')), 'value']
      ],
      include: [{
        model: db.TimeSlot,
        as: 'slots',
        attributes: [],
        include: [{
          model: db.Court,
          as: 'court',
          attributes: []
        }]
      }],
      where: { venue_id: venueId, created_at: { [Op.gte]: startDate }, status: { [Op.ne]: 'cancelled' } },
      group: ['slots.court.id', 'slots.court.name'],
      order: [[db.sequelize.fn('COUNT', db.sequelize.col('Booking.id')), 'DESC']],
      limit: 5,
      raw: true,
      subQuery: false
    });

    res.json({
      success: true,
      data: {
        totalRevenue: totalRevenueResult || 0,
        totalBookings,
        avgBookingValue,
        dailyRevenue: dailyRevenue.map(r => ({
          date: r.get('date'),
          revenue: parseFloat(r.get('revenue')),
          bookings: parseInt(r.get('bookings'))
        })),
        topCourts: topCourts.map(c => ({
          name: c.name,
          value: parseInt(c.value)
        }))
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/owner/staffs/:id/password
 */
const updateStaffPassword = async (req, res, next) => {
  try {
    const staffId = req.params.id;
    const { password } = req.body;

    const staff = await db.User.findOne({ where: { id: staffId, role: 'staff' } });
    if (!staff) throw new ApiError(404, 'Không tìm thấy nhân viên');

    // Verify ownership (the venue the staff belongs to must be owned by req.user)
    const venue = await db.Venue.findOne({ where: { id: staff.venue_id, owner_id: req.user.id } });
    if (!venue) throw new ApiError(403, 'Bạn không có quyền quản lý nhân viên này');

    const bcrypt = require('bcryptjs');
    const password_hash = await bcrypt.hash(password, 10);
    
    await staff.update({ password_hash });

    res.json({ success: true, message: 'Cập nhật mật khẩu thành công' });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/owner/staffs/:id
 */
const updateStaff = async (req, res, next) => {
  try {
    const staffId = req.params.id;
    const { name, email, phone, status } = req.body;

    const staff = await db.User.findOne({ where: { id: staffId, role: 'staff' } });
    if (!staff) throw new ApiError(404, 'Không tìm thấy nhân viên');

    // Verify ownership
    const venue = await db.Venue.findOne({ where: { id: staff.venue_id, owner_id: req.user.id } });
    if (!venue) throw new ApiError(403, 'Bạn không có quyền quản lý nhân viên này');

    // Check if email taken by ANOTHER user
    if (email && email !== staff.email) {
      const existing = await db.User.findOne({ where: { email, id: { [Op.ne]: staffId } } });
      if (existing) throw new ApiError(400, 'Email này đã được sử dụng bởi người khác');
    }

    await staff.update({ name, email, phone, status });

    res.json({ success: true, message: 'Cập nhật thông tin thành công', data: staff });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStats,
  getVenueStaffs,
  createVenueStaff,
  getReports,
  updateStaffPassword,
  updateStaff
};
