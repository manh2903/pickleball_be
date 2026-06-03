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
    
    // 1. Get owner's or staff's venue(s)
    const { venue_id: queryVenueId } = req.query;
    let whereVenue = {};
    if (req.user.role === 'staff') {
      whereVenue = { id: req.user.venue_id || null };
    } else {
      whereVenue = { owner_id: ownerId };
    }
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

    // 5. Pending / Action needed bookings
    const pendingBookings = await db.Booking.count({
      where: { 
        venue_id: { [Op.in]: venueIds },
        status: { [Op.in]: ['pending', 'confirmed'] },
        payment_status: { [Op.ne]: 'paid' }
      }
    });

    // 6. Walk-in count (All time or today? Dashboard implies a general count, but let's do all-time non-cancelled)
    const walkInCount = await db.Booking.count({
      where: { 
        venue_id: { [Op.in]: venueIds },
        booking_type: 'walkin',
        status: { [Op.ne]: 'cancelled' }
      }
    });

    // 7. Recent Bookings (last 5)
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

    // 8. Revenue for last 7 days
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
        pendingBookings,
        walkInCount,
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
 * GET /api/owner/analytics?venue_id=
 * Rich analytics for Basic/Premium owners
 */
const getRevenueAnalytics = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const { venue_id, start_date, end_date } = req.query;
    const whereVenue = { owner_id: ownerId };
    if (venue_id) whereVenue.id = venue_id;

    const venues = await db.Venue.findAll({ where: whereVenue, attributes: ['id', 'name'] });
    const venueIds = venues.map(v => v.id);
    if (venueIds.length === 0) return res.json({ success: true, data: { daily: [], monthly: [], totalRevenue: 0, totalBookings: 0, venueReport: [], courtReport: [] } });

    const baseWhere = { venue_id: { [Op.in]: venueIds }, payment_status: 'paid', status: { [Op.ne]: 'cancelled' } };

    if (start_date || end_date) {
      baseWhere.created_at = {};
      if (start_date) {
        baseWhere.created_at[Op.gte] = new Date(`${start_date}T00:00:00`);
      }
      if (end_date) {
        baseWhere.created_at[Op.lte] = new Date(`${end_date}T23:59:59`);
      }
    }

    const allVenues = await db.Venue.findAll({
      where: whereVenue,
      attributes: ['id', 'name'],
      include: [
        {
          model: db.Court,
          as: 'courts',
          attributes: ['id', 'name']
        }
      ]
    });

    const bookings = await db.Booking.findAll({
      where: baseWhere,
      include: [
        {
          model: db.TimeSlot,
          as: 'slots',
          attributes: ['price', 'court_id'],
          include: [
            {
              model: db.Court,
              as: 'court',
              attributes: ['id', 'name', 'venue_id']
            }
          ]
        }
      ]
    });

    const venueMap = {};
    const courtMap = {};
    const dailyMap = {};
    const monthlyMap = {};

    allVenues.forEach(v => {
      venueMap[v.id] = {
        id: v.id,
        name: v.name,
        revenue: 0,
        count: 0
      };
      if (v.courts) {
        v.courts.forEach(c => {
          courtMap[c.id] = {
            id: c.id,
            name: c.name,
            venue_id: v.id,
            venue_name: v.name,
            revenue: 0,
            count: 0
          };
        });
      }
    });

    let totalRevenue = 0;
    let totalBookings = bookings.length;
    let onlineCount = 0;
    let walkinCount = 0;

    bookings.forEach(booking => {
      const vId = booking.venue_id;
      const ownerRevenue = parseFloat(booking.owner_revenue || booking.total_price || 0);

      totalRevenue += ownerRevenue;
      if (booking.booking_type === 'online') {
        onlineCount += 1;
      } else if (booking.booking_type === 'walkin') {
        walkinCount += 1;
      }

      // Format Date to local YYYY-MM-DD
      const bDate = booking.created_at || booking.createdAt;
      const d = new Date(bDate);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const monthStr = `${yyyy}-${mm}`;

      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { revenue: 0, count: 0 };
      }
      dailyMap[dateStr].revenue += ownerRevenue;
      dailyMap[dateStr].count += 1;

      if (!monthlyMap[monthStr]) {
        monthlyMap[monthStr] = { revenue: 0, count: 0 };
      }
      monthlyMap[monthStr].revenue += ownerRevenue;
      monthlyMap[monthStr].count += 1;

      if (venueMap[vId]) {
        venueMap[vId].revenue += ownerRevenue;
        venueMap[vId].count += 1;
      }

      const slots = booking.slots || [];
      const totalSlotsPrice = slots.reduce((sum, s) => sum + parseFloat(s.price || 0), 0);

      const bookedCourtIds = new Set();
      slots.forEach(s => {
        if (s.court_id) {
          bookedCourtIds.add(s.court_id);
        }
      });

      bookedCourtIds.forEach(cId => {
        if (courtMap[cId]) {
          courtMap[cId].count += 1;
        }
      });

      slots.forEach(s => {
        const cId = s.court_id;
        if (cId && courtMap[cId]) {
          const slotPrice = parseFloat(s.price || 0);
          let allocatedRevenue = 0;
          if (totalSlotsPrice > 0) {
            allocatedRevenue = ownerRevenue * (slotPrice / totalSlotsPrice);
          } else {
            allocatedRevenue = ownerRevenue / slots.length;
          }
          courtMap[cId].revenue += allocatedRevenue;
        }
      });
    });

    let daily = [];
    if (start_date && end_date) {
      const [sYear, sMonth, sDay] = start_date.split('-').map(Number);
      const [eYear, eMonth, eDay] = end_date.split('-').map(Number);
      const start = new Date(sYear, sMonth - 1, sDay);
      const end = new Date(eYear, eMonth - 1, eDay);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const key = `${yyyy}-${mm}-${dd}`;
        daily.push({ date: key, revenue: dailyMap[key]?.revenue || 0, count: dailyMap[key]?.count || 0 });
      }
    } else {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const key = `${yyyy}-${mm}-${dd}`;
        daily.push({ date: key, revenue: dailyMap[key]?.revenue || 0, count: dailyMap[key]?.count || 0 });
      }
    }

    let monthly = [];
    if (!start_date && !end_date) {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const key = `${yyyy}-${mm}`;
        const label = d.toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' });
        monthly.push({ month: key, label, revenue: monthlyMap[key]?.revenue || 0, count: monthlyMap[key]?.count || 0 });
      }
    }

    const venueReport = Object.values(venueMap);
    const courtReport = Object.values(courtMap);

    res.json({
      success: true,
      data: { daily, monthly, totalRevenue, totalBookings, onlineCount, walkinCount, venueReport, courtReport }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/owner/reports
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

/**
 * GET /api/owner/cashflow
 * Get complete cashflow history (Bookings, Withdrawals, Refunds, Subscriptions)
 */
const getOwnerCashflow = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const history = [];

    // 1. Withdrawals (WithdrawalRequest)
    const withdrawals = await db.WithdrawalRequest.findAll({ where: { owner_id: ownerId } });
    withdrawals.forEach(w => {
      history.push({
        id: `w_${w.id}`,
        type: 'withdrawal',
        amount: -parseFloat(w.amount),
        date: w.created_at || w.createdAt,
        status: w.status,
        description: `Rút tiền: ${w.bank_name} - ${w.bank_account}`
      });
    });

    // 2. Payments (Subscriptions, Clawbacks, etc)
    const payments = await db.Payment.findAll({
      where: { user_id: ownerId },
      include: [
        { model: db.SubscriptionOption, as: 'option', include: [{ model: db.SubscriptionPlan, as: 'plan' }] }
      ]
    });
    payments.forEach(p => {
      let desc = p.note || 'Giao dịch ví';
      if (p.option) desc = `Thanh toán gói: ${p.option.plan.name}`;
      history.push({
        id: `p_${p.id}`,
        type: p.amount < 0 ? 'expense' : 'income',
        amount: parseFloat(p.amount),
        date: p.created_at || p.createdAt,
        status: p.status,
        description: desc
      });
    });

    // 3. Booking Revenue
    const venues = await db.Venue.findAll({ where: { owner_id: ownerId }, attributes: ['id'] });
    if (venues.length > 0) {
      const venueIds = venues.map(v => v.id);
      const bookings = await db.Booking.findAll({
        where: { venue_id: { [Op.in]: venueIds }, payment_status: 'paid' },
        attributes: ['id', 'booking_code', 'owner_revenue', 'total_price', 'createdAt']
      });
      
      bookings.forEach(b => {
        const rev = parseFloat(b.owner_revenue || b.total_price || 0);
        if (rev > 0) {
          history.push({
            id: `b_${b.id}`,
            type: 'income',
            amount: rev,
            date: b.created_at || b.createdAt,
            status: 'completed',
            description: `Doanh thu đặt sân: ${b.booking_code}`
          });
        }
      });
    }

    // Sort descending by date
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStats,
  getRevenueAnalytics,
  getVenueStaffs,
  createVenueStaff,
  getReports,
  updateStaffPassword,
  updateStaff,
  getOwnerCashflow
};
