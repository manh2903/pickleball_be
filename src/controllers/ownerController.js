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
        { model: db.Court, as: 'court', attributes: ['name'] },
        { model: db.TimeSlot, as: 'slots', attributes: ['date', 'start_time', 'end_time'] },
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
        [db.sequelize.fn('SUM', db.sequelize.col('owner_revenue')), 'revenue']
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

module.exports = {
  getStats,
  getVenueStaffs,
  createVenueStaff
};
