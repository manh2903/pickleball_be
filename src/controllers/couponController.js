const db = require('../models');
const { ApiError } = require('../middleware/errorMiddleware');
const { Op } = require('sequelize');

/**
 * Coupon Controller
 */
const getOwnerCoupons = async (req, res, next) => {
  try {
    const { venue_id } = req.query;
    // If venue_id provided, filter by it. Otherwise show all coupons for all venues of this owner.
    let venueIds = [];
    if (venue_id) {
      venueIds = [venue_id];
    } else {
      const venues = await db.Venue.findAll({ where: { owner_id: req.user.id }, attributes: ['id'] });
      venueIds = venues.map(v => v.id);
    }

    const coupons = await db.Coupon.findAll({
      where: { venue_id: { [Op.in]: venueIds } },
      order: [['created_at', 'DESC']]
    });

    res.json({ success: true, data: coupons });
  } catch (err) {
    next(err);
  }
};

const createCoupon = async (req, res, next) => {
  try {
    const { 
      code, discount_type, discount_value, min_booking_amount, 
      max_discount_amount, start_date, end_date, usage_limit, venue_id 
    } = req.body;

    // Verify ownership
    const venue = await db.Venue.findOne({ where: { id: venue_id, owner_id: req.user.id } });
    if (!venue) throw new ApiError(403, 'Bạn không có quyền tạo khuyến mãi cho cơ sở này');

    // Check code existence
    const existing = await db.Coupon.findOne({ where: { code: code.toUpperCase(), venue_id } });
    if (existing) throw new ApiError(400, 'Mã giảm giá này đã tồn tại ở cơ sở này');

    const coupon = await db.Coupon.create({
      venue_id,
      code: code.toUpperCase(),
      discount_type,
      discount_value,
      min_booking_amount: min_booking_amount || 0,
      max_discount_amount: max_discount_amount || null,
      start_date,
      end_date,
      usage_limit: usage_limit || null,
      used_count: 0,
      status: 'active',
      created_by: req.user.id
    });

    res.status(201).json({ success: true, message: 'Tạo mã giảm giá thành công', data: coupon });
  } catch (err) {
    next(err);
  }
};

const updateCouponStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const coupon = await db.Coupon.findByPk(id, {
      include: [{ model: db.Venue, as: 'venue' }]
    });

    if (!coupon) throw new ApiError(404, 'Không tìm thấy mã giảm giá');

    // Nếu là admin thì luôn được quyền sửa
    if (req.user.role !== 'admin') {
      // Nếu không phải admin, kiểm tra xem có phải chủ sân của mã này không
      if (!coupon.venue || coupon.venue.owner_id !== req.user.id) {
        throw new ApiError(403, 'Bạn không có quyền chỉnh sửa mã này');
      }
    }

    await coupon.update({ status });
    res.json({ success: true, message: 'Cập nhật trạng thái thành công' });
  } catch (err) {
    next(err);
  }
};

const validateCoupon = async (req, res, next) => {
  try {
    const { code, venue_id, total_amount } = req.body;
    
    const coupon = await db.Coupon.findOne({
      where: { 
        code: code.toUpperCase(), 
        venue_id,
        status: 'active',
        start_date: { [Op.lte]: new Date() },
        end_date: { [Op.gte]: new Date() }
      }
    });

    if (!coupon) throw new ApiError(400, 'Mã giảm giá không hợp lệ hoặc đã hết hạn');
    
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      throw new ApiError(400, 'Mã giảm giá đã hết lượt sử dụng');
    }

    if (total_amount < coupon.min_booking_amount) {
      throw new ApiError(400, `Đơn hàng tối thiểu ${new Intl.NumberFormat('vi-VN').format(coupon.min_booking_amount)}đ để áp dụng mã này`);
    }

    let discount = 0;
    if (coupon.discount_type === 'percentage') {
      discount = (total_amount * coupon.discount_value) / 100;
      if (coupon.max_discount_amount && discount > coupon.max_discount_amount) {
        discount = coupon.max_discount_amount;
      }
    } else {
      discount = coupon.discount_value;
    }

    res.json({ 
      success: true, 
      data: {
        id: coupon.id,
        code: coupon.code,
        discount_amount: Math.min(discount, total_amount),
        final_amount: Math.max(0, total_amount - discount)
      }
    });
  } catch (err) {
    next(err);
  }
};

const adminGetAllCoupons = async (req, res, next) => {
  try {
    const { type, status, page = 1, limit = 20 } = req.query;
    const where = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const { count, rows } = await db.Coupon.findAndCountAll({
      where,
      include: [
        { model: db.Venue, as: 'venue', attributes: ['id', 'name'] },
        { model: db.User, as: 'creator', attributes: ['id', 'name', 'role'] }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    res.json({ success: true, data: { coupons: rows, total: count } });
  } catch (err) {
    next(err);
  }
};

const adminCreateCoupon = async (req, res, next) => {
  try {
    const { 
      code, discount_type, discount_value, min_booking_amount, 
      max_discount_amount, start_date, end_date, usage_limit 
    } = req.body;

    const existing = await db.Coupon.findOne({ where: { code: code.toUpperCase(), type: 'platform' } });
    if (existing) throw new ApiError(400, 'Mã giảm giá hệ thống này đã tồn tại');

    const coupon = await db.Coupon.create({
      type: 'platform',
      venue_id: null, // Platform wide
      code: code.toUpperCase(),
      discount_type,
      discount_value,
      min_booking_amount: min_booking_amount || 0,
      max_discount_amount: max_discount_amount || null,
      start_date,
      end_date,
      usage_limit: usage_limit || null,
      status: 'active',
      created_by: req.user.id
    });

    res.status(201).json({ success: true, message: 'Tạo mã giảm giá hệ thống thành công', data: coupon });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getOwnerCoupons,
  createCoupon,
  updateCouponStatus,
  validateCoupon,
  adminGetAllCoupons,
  adminCreateCoupon
};
