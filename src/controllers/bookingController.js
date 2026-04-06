const db = require('../models');
const { ApiError } = require('../middleware/errorMiddleware');
const { Op } = require('sequelize');
const qrcode = require('qrcode');

/**
 * GET /api/bookings/availability?court_id=&date=
 * Returns time slots for a court on a specific date
 */
const getAvailability = async (req, res, next) => {
  try {
    const { court_id, venue_id, date } = req.query;
    if (!date) throw new ApiError(400, 'Thiếu date');

    let slots;
    let info = {};

    if (court_id) {
      const court = await db.Court.findByPk(court_id);
      if (!court) throw new ApiError(404, 'Không tìm thấy sân');
      info.court = court;
      slots = await db.TimeSlot.findAll({
        where: { court_id, date },
        include: [{ model: db.Court, as: 'court', attributes: ['name'] }],
        order: [['start_time', 'ASC']],
      });
    } else if (venue_id) {
      const venue = await db.Venue.findByPk(venue_id, {
        include: [{ model: db.Court, as: 'courts' }]
      });
      if (!venue) throw new ApiError(404, 'Không tìm thấy địa điểm');
      info.venue = venue;
      
      const courtIds = venue.courts.map(c => c.id);
      slots = await db.TimeSlot.findAll({
        where: { 
          court_id: { [Op.in]: courtIds }, 
          date 
        },
        include: [{ model: db.Court, as: 'court', attributes: ['name'] }],
        order: [['start_time', 'ASC']],
      });
    } else {
      throw new ApiError(400, 'Thiếu court_id hoặc venue_id');
    }

    res.json({ success: true, data: { ...info, slots } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/bookings — Create booking (user)
 */
const createBooking = async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const { slot_ids, slot_id, coupon_code, notes, payment_method = 'vnpay' } = req.body;
    const user = req.user;

    const ids = slot_ids || (slot_id ? [slot_id] : []);
    if (ids.length === 0) throw new ApiError(400, 'Vui lòng chọn ít nhất một khung giờ');

    const slots = await db.TimeSlot.findAll({
      where: { id: { [Op.in]: ids } },
      include: [
        { model: db.Court, as: 'court' },
        { model: db.Venue, as: 'venue', attributes: ['id', 'commission_rate', 'status'] },
      ],
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (slots.length !== ids.length) throw new ApiError(404, 'Một số khung giờ không tồn tại');
    
    const venueId = slots[0].venue_id;
    
    for (const s of slots) {
      if (s.status !== 'available') throw new ApiError(409, `Slot ${s.start_time} đã được đặt`);
      if (s.venue_id !== venueId) throw new ApiError(400, 'Tất cả slot phải cùng một địa điểm');
    }

    let totalPrice = slots.reduce((sum, s) => sum + parseFloat(s.price), 0);
    let couponId = null;
    let discountAmount = 0;

    if (coupon_code) {
      const coupon = await db.Coupon.findOne({
        where: {
          code: coupon_code,
          is_active: true,
          [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gte]: new Date() } }],
          [Op.or]: [{ max_uses: null }, { max_uses: { [Op.gt]: db.sequelize.col('used_count') } }],
        },
        transaction: t,
      });

      if (!coupon) throw new ApiError(400, 'Mã giảm giá không hợp lệ');
      if (totalPrice < (coupon.min_booking_amount || 0)) {
        throw new ApiError(400, `Cần tối thiểu ${coupon.min_booking_amount}đ để dùng mã này`);
      }

      if (coupon.discount_type === 'percent') {
        discountAmount = Math.round((totalPrice * coupon.discount_value) / 100);
        if (coupon.max_discount_amount) discountAmount = Math.min(discountAmount, coupon.max_discount_amount);
      } else {
        discountAmount = coupon.discount_value;
      }
      totalPrice -= discountAmount;
      couponId = coupon.id;
      await coupon.increment('used_count', { transaction: t });
    }

    const bookingCode = `PB${Date.now().toString().slice(-8)}`;
    const qrData = JSON.stringify({ code: bookingCode, slot_ids: ids, user_id: user.id });
    const qrCodeBase64 = await qrcode.toDataURL(qrData);

    const venue = slots[0].venue;
    const platformSetting = await db.PlatformSetting.findOne({ where: { key: 'default_commission_rate' } });
    const defaultRate = parseFloat(platformSetting?.value || 0);
    const rate = venue.commission_rate > 0 ? venue.commission_rate : defaultRate;
    const commissionAmount = Math.round((totalPrice * rate) / 100);
    const ownerRevenue = totalPrice - commissionAmount;

    const booking = await db.Booking.create({
      booking_code: bookingCode,
      user_id: user.id,
      venue_id: venueId,
      booking_type: 'online',
      status: 'confirmed',
      total_price: totalPrice,
      payment_status: 'unpaid',
      payment_method: payment_method,
      coupon_id: couponId,
      discount_amount: discountAmount,
      commission_rate: rate,
      commission_amount: commissionAmount,
      owner_revenue: ownerRevenue,
      qr_code: qrCodeBase64,
      notes,
    }, { transaction: t });

    await db.TimeSlot.update(
      { booking_id: booking.id, status: 'booked' },
      { where: { id: { [Op.in]: ids } }, transaction: t }
    );

    const io = req.app.get('io');
    io?.to(`court-${courtId}`).emit('slots-updated', { ids, status: 'booked' });
    io?.to(`venue-${venueId}`).emit('new-booking', { booking, slots });
    io?.to('admin-room').emit('new-booking', { booking, venue_name: venue.name });

    await t.commit();

    // Notify user if email exists
    if (user.email) {
      sendEmail({
        to: user.email,
        subject: `🎫 Đặt sân thành công: ${bookingCode} - Pickleball Hub`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #059669;">Đặt sân thành công!</h2>
            <p>Chào <strong>${user.name}</strong>, đơn đặt sân của bạn tại <strong>${venue.name}</strong> đã được ghi nhận.</p>
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p>Mã đơn hàng: <strong>${bookingCode}</strong></p>
              <p>Tổng tiền: <strong>${new Intl.NumberFormat('vi-VN').format(totalPrice)}đ</strong></p>
              <p>Phương thức: <strong>${payment_method === 'vnpay' ? 'VNPay (Đang chờ thanh toán)' : 'Tiền mặt tại quầy'}</strong></p>
            </div>
            <p>Vui lòng xuất trình mã QR trong ứng dụng khi đến sân để check-in.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 0.85em; color: #64748b;">Trân trọng, đội ngũ Pickleball Hub.</p>
          </div>
        `
      }).catch(e => console.error('Booking Email failed', e));
    }

    const points = Math.floor(totalPrice / 10000);
    if (points > 0) await user.increment('points', { by: points });

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

const { sendEmail } = require('../utils/mailer');

/**
 * Confirm Cash Payment by Owner/Staff
 */
const confirmPayment = async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const booking = await db.Booking.findByPk(req.params.id, { 
      include: [{ model: db.User, as: 'user', attributes: ['id', 'name', 'email'] }],
      transaction: t 
    });
    if (!booking) throw new ApiError(404, 'Không tìm thấy booking');

    const venue = await db.Venue.findByPk(booking.venue_id);
    if (!venue) throw new ApiError(404, 'Không tìm thấy venue');
    
    if (venue.owner_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'staff') {
      throw new ApiError(403, 'Bạn không có quyền xác nhận thanh toán này');
    }

    if (booking.payment_status === 'paid') throw new ApiError(400, 'Lượt đặt này đã được thanh toán');

    await booking.update({ payment_status: 'paid' }, { transaction: t });

    await db.Payment.create({
      booking_id: booking.id,
      amount: booking.total_price,
      method: booking.payment_method || 'cash',
      status: 'completed',
      collected_by: req.user.id,
      note: 'Xác nhận thanh toán tiền mặt bởi quản lý'
    }, { transaction: t });

    if (booking.owner_revenue > 0) {
      const owner = await db.User.findByPk(venue.owner_id, { transaction: t });
      if (owner) await owner.increment('wallet_balance', { by: booking.owner_revenue, transaction: t });
    }

    await t.commit();

    // Socket notification for real-time status update in dashboards
    const io = req.app.get('io');
    io?.to(`venue-${booking.venue_id}`).emit('booking-status-updated', { id: booking.id, status: 'paid' });
    io?.to('admin-room').emit('booking-status-updated', { id: booking.id, status: 'paid' });

    // Inform user via email
    if (booking.user?.email) {
      sendEmail({
        to: booking.user.email,
        subject: '✅ Thanh toán thành công - Pickleball Hub',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p>Chào <strong>${booking.user.name}</strong>,</p>
            <p>Đơn đặt sân <strong>${booking.booking_code}</strong> của bạn đã được xác nhận thanh toán thành công.</p>
            <p>Hẹn gặp bạn tại sân!</p>
          </div>
        `
      }).catch(e => console.error('Confirm Email failed', e));
    }

    res.json({ success: true, message: 'Xác nhận thanh toán thành công' });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

const getMyBookings = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const where = { user_id: req.user.id };
    if (status) where.status = status;

    const { count, rows } = await db.Booking.findAndCountAll({
      where,
      include: [
        { 
          model: db.TimeSlot, as: 'slots', 
          attributes: ['date', 'start_time', 'end_time'],
          include: [{ model: db.Court, as: 'court', include: [{ model: db.Venue, as: 'venue', attributes: ['name', 'address'] }] }] 
        },
        { model: db.Payment, as: 'payments', attributes: ['method', 'status'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      distinct: true
    });
    res.json({ success: true, data: { bookings: rows, total: count } });
  } catch (err) { next(err); }
};

const getBookingById = async (req, res, next) => {
  try {
    const idOrCode = req.params.id;
    const isCode = isNaN(Number(idOrCode));
    const where = isCode ? { booking_code: idOrCode } : { id: idOrCode };

    const booking = await db.Booking.findOne({
      where,
      include: [
        { 
          model: db.TimeSlot, as: 'slots',
          include: [{ model: db.Court, as: 'court', include: [{ model: db.Venue, as: 'venue' }] }] 
        },
        { model: db.User, as: 'user', attributes: ['id', 'name', 'phone'] },
        { model: db.Payment, as: 'payments' },
      ],
    });

    if (!booking) throw new ApiError(404, 'Không tìm thấy booking');
    
    // Privacy Check: User can see their own, Owner sees their venue's, Admin sees all
    const isOwner = booking.slots?.[0]?.court?.venue?.owner_id === req.user?.id;
    const isUser = booking.user_id === req.user?.id;
    const isAdmin = req.user?.role === 'admin';
    const isStaff = req.user?.role === 'staff';

    if (!isUser && !isOwner && !isAdmin && !isStaff) {
       throw new ApiError(403, 'Bạn không có quyền truy cập thông tin này');
    }

    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
};

const cancelBooking = async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const booking = await db.Booking.findByPk(req.params.id, { transaction: t });
    if (!booking) throw new ApiError(404, 'Không tìm thấy booking');
    await booking.update({ status: 'cancelled', cancelled_at: new Date() }, { transaction: t });
    await db.TimeSlot.update({ status: 'available', booking_id: null }, { where: { booking_id: booking.id }, transaction: t });
    await t.commit();
    res.json({ success: true, message: 'Hủy thành công' });
  } catch (err) { await t.rollback(); next(err); }
};

const checkIn = async (req, res, next) => {
  try {
    const { booking_code } = req.body;
    const booking = await db.Booking.findOne({ where: { booking_code } });
    if (!booking) throw new ApiError(404, 'Mã không tồn tại');
    await booking.update({ status: 'checked_in', check_in_at: new Date() });
    res.json({ success: true, message: 'Check-in thành công' });
  } catch (err) { next(err); }
};

const createWalkInBooking = async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const { slot_ids, customer_name, customer_phone, customer_email, notes } = req.body;
    const slots = await db.TimeSlot.findAll({
      where: { id: { [Op.in]: slot_ids } },
      include: [{ model: db.Court, as: 'court' }],
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    const bookingCode = `WI${Date.now().toString().slice(-8)}`;
    const totalPrice = slots.reduce((sum, s) => sum + parseFloat(s.price), 0);
    const booking = await db.Booking.create({
      booking_code: bookingCode,
      venue_id: slots[0].venue_id,
      customer_name, customer_phone, customer_email,
      booking_type: 'walkin', status: 'confirmed',
      total_price: totalPrice, payment_status: 'unpaid', payment_method: 'cash',
      notes,
    }, { transaction: t });
    await db.TimeSlot.update({ booking_id: booking.id, status: 'booked' }, { where: { id: { [Op.in]: slot_ids } }, transaction: t });
    await t.commit();
    res.status(201).json({ success: true, data: booking });
  } catch (err) { await t.rollback(); next(err); }
};

const ownerGetVenueBookings = async (req, res, next) => {
  try {
    const { status, venue_id, search, page = 1, limit = 10 } = req.query;
    
    // 1. Determine venues context
    let venueIds = [];
    if (venue_id) {
       // Verify ownership/staff access
       const v = await db.Venue.findOne({ where: { id: venue_id, owner_id: req.user.id } });
       if (!v && req.user.role !== 'admin') throw new ApiError(403, 'Không có quyền truy cập cơ sở này');
       venueIds = [venue_id];
    } else {
       const venues = await db.Venue.findAll({ where: { owner_id: req.user.id }, attributes: ['id'] });
       venueIds = venues.map(v => v.id);
    }
    
    // 2. Build filter
    const where = { venue_id: { [Op.in]: venueIds } };
    if (status && status !== 'all') where.status = status;
    
    if (search) {
      where[Op.or] = [
        { booking_code: { [Op.like]: `%${search}%` } },
        { customer_name: { [Op.like]: `%${search}%` } },
        { customer_phone: { [Op.like]: `%${search}%` } },
        { '$user.name$': { [Op.like]: `%${search}%` } },
        { '$user.phone$': { [Op.like]: `%${search}%` } },
      ];
    }

    // 3. Execution
    const { count, rows } = await db.Booking.findAndCountAll({
      where,
      include: [
        { 
          model: db.TimeSlot, as: 'slots', 
          attributes: ['date', 'start_time', 'end_time'],
          include: [{ model: db.Court, as: 'court', attributes: ['id', 'name'] }] 
        },
        { model: db.User, as: 'user', attributes: ['id', 'name', 'phone', 'email'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      distinct: true,
      subQuery: false // Required for complex includes with limit
    });

    res.json({ 
      success: true, 
      data: { 
        bookings: rows, 
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit))
      } 
    });
  } catch (err) { 
    next(err); 
  }
};

const ownerGetBookingDetail = async (req, res, next) => {
  try {
    const booking = await db.Booking.findByPk(req.params.id, {
      include: [
        { 
          model: db.TimeSlot, as: 'slots',
          include: [{ model: db.Court, as: 'court', include: [{ model: db.Venue, as: 'venue' }] }] 
        },
        { model: db.User, as: 'user', attributes: ['name', 'phone', 'email'] },
      ],
    });
    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
};

const getAllBookings = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = {};
    if (status) where.status = status;
    const { count, rows } = await db.Booking.findAndCountAll({
      where,
      include: [
        { 
          model: db.TimeSlot, as: 'slots',
          include: [{ model: db.Court, as: 'court', attributes: ['name'] }] 
        },
        { model: db.User, as: 'user', attributes: ['name', 'phone'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      distinct: true
    });
    res.json({ success: true, data: { bookings: rows, total: count } });
  } catch (err) { next(err); }
};

module.exports = {
  getAvailability, createBooking, getMyBookings, getBookingById,
  cancelBooking, checkIn, createWalkInBooking, 
  confirmPayment, ownerGetVenueBookings, ownerGetBookingDetail, getAllBookings
};
