const db = require('../models');
const { ApiError } = require('../middleware/errorMiddleware');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');

/**
 * GET /api/venues — Public marketplace listing
 */
const getVenues = async (req, res, next) => {
  try {
    const { search, price_min, price_max, types, amenities, min_rating, page = 1, limit = 12 } = req.query;
    const where = { status: 'active' };
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { address: { [Op.like]: `%${search}%` } },
      ];
    }

    // Price range filter (on default_price_morning or similar)
    if (price_min || price_max) {
      where.default_price_morning = {};
      if (price_min) where.default_price_morning[Op.gte] = parseFloat(price_min);
      if (price_max) where.default_price_morning[Op.lte] = parseFloat(price_max);
    }

    // Amenities filter (assuming amenities is a JSON array)
    if (amenities) {
      const amenityList = Array.isArray(amenities) ? amenities : amenities.split(',');
      where.amenities = { [Op.and]: amenityList.map(a => ({ [Op.like]: `%${a}%` })) };
    }

    // New Location filtering by ID
    const { province_id, ward_id } = req.query;
    if (province_id) where.province_id = province_id;
    if (ward_id) where.ward_id = ward_id;

    const { count, rows } = await db.Venue.findAndCountAll({
      where,
      include: [
        { 
          model: db.Court, as: 'courts', where: { status: 'active' }, required: false,
          attributes: ['id', 'name', 'type', 'status'] 
        },
        { model: db.Province, as: 'provinceState', attributes: ['ten_tinh'] },
        { model: db.Ward, as: 'wardState', attributes: ['ten'] },
      ],
      order: [['sort_order', 'ASC'], ['id', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      distinct: true,
    });

    // Attach avg rating per venue and filter by min_rating
    let venuesWithMeta = await Promise.all(rows.map(async (venue) => {
      const ratingResult = await db.Review.findOne({
        where: { venue_id: venue.id, is_visible: true },
        attributes: [
          [db.sequelize.fn('AVG', db.sequelize.col('rating')), 'avg_rating'],
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'review_count'],
        ],
        raw: true,
      });
      const plain = venue.toJSON();
      return {
        ...plain,
        avg_rating: parseFloat(ratingResult?.avg_rating || 0).toFixed(1),
        review_count: parseInt(ratingResult?.review_count || 0),
        court_count: venue.courts?.length || 0,
      };
    }));

    if (min_rating) {
      venuesWithMeta = venuesWithMeta.filter(v => parseFloat(v.avg_rating) >= parseFloat(min_rating));
    }

    res.json({
      success: true,
      data: {
        venues: venuesWithMeta,
        total: count,                                            // ← full DB count, not page slice
        page: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/venues/:id — Public venue detail
 */
const getVenueById = async (req, res, next) => {
  try {
    const param = req.params.id;
    const isNumeric = /^\d+$/.test(param);
    const where = isNumeric ? { id: param, status: 'active' } : { slug: param, status: 'active' };

    const venue = await db.Venue.findOne({
      where,
      include: [
        {
          model: db.Court, as: 'courts',
          where: { status: { [Op.ne]: 'inactive' } }, required: false,
          order: [['sort_order', 'ASC']],
        },
        {
          model: db.Review, as: 'reviews',
          where: { is_visible: true }, required: false,
          include: [{ model: db.User, as: 'user', attributes: ['id', 'name', 'avatar'] }],
          limit: 10,
          order: [['created_at', 'DESC']],
        },
        { model: db.Province, as: 'provinceState', attributes: ['ma_tinh', 'ten_tinh'] },
        { model: db.Ward, as: 'wardState', attributes: ['ma', 'ten'] },
      ],
    });
    if (!venue) throw new ApiError(404, 'Không tìm thấy địa điểm');

    // Dynamically calculate average rating and review count
    const ratingResult = await db.Review.findOne({
      where: { venue_id: venue.id, is_visible: true },
      attributes: [
        [db.sequelize.fn('AVG', db.sequelize.col('rating')), 'avg_rating'],
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'review_count'],
      ],
      raw: true,
    });

    const venueJson = venue.toJSON();
    const finalData = {
      ...venueJson,
      avg_rating: parseFloat(ratingResult?.avg_rating || 0).toFixed(1),
      review_count: parseInt(ratingResult?.review_count || 0),
    };

    res.json({ success: true, data: finalData });
  } catch (err) {
    next(err);
  }
};

// ============ OWNER — manage their own venues ============

/**
 * GET /api/owner/venues — Owner's own venues list
 */
const getOwnerVenues = async (req, res, next) => {
  try {
    const venues = await db.Venue.findAll({
      where: { owner_id: req.user.id },
      include: [
        { model: db.Court, as: 'courts', attributes: ['id', 'name', 'type', 'status'] },
        { model: db.Province, as: 'provinceState', attributes: ['ten_tinh'] },
        { model: db.Ward, as: 'wardState', attributes: ['ten'] },
      ],
      order: [['created_at', 'DESC']],
    });
    res.json({ success: true, data: venues });
  } catch (err) {
    next(err);
  }
};

const { canCreateVenue } = require('../utils/subscriptionHelper');

/**
 * POST /api/owner/venues — Create venue
 */
const createVenue = async (req, res, next) => {
  try {
    const {
      name, address, latitude, longitude,
      description, images, amenities, phone,
      open_time, close_time,
      default_price_morning, default_price_afternoon, default_price_evening,
      default_price_weekend_surcharge, cancel_policy,
      province_id, ward_id,
    } = req.body;

    const allowed = await canCreateVenue(req.user.id);
    if (!allowed) {
      throw new ApiError(403, 'Bạn đã đạt giới hạn số lượng cơ sở tối đa cho gói hiện tại. Vui lòng nâng cấp gói dịch vụ để tạo thêm cơ sở.');
    }

    // Generate slug from name
    const slug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '') + '-' + Date.now().toString().slice(-4);

    const venue = await db.Venue.create({
      owner_id: req.user.id,
      name, slug, address, latitude, longitude,
      description,
      images: images || [],
      amenities: amenities || [],
      phone, open_time, close_time,
      default_price_morning: default_price_morning || 0,
      default_price_afternoon: default_price_afternoon || 0,
      default_price_evening: default_price_evening || 0,
      default_price_weekend_surcharge: default_price_weekend_surcharge || 0,
      cancel_policy: cancel_policy || null,
      status: 'active', // Auto-active because capacity is limited by subscription
      province_id, ward_id,
    });

    res.status(201).json({
      success: true,
      message: 'Đăng ký địa điểm thành công! Cơ sở đã được kích hoạt và sẵn sàng nhận khách.',
      data: venue,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/owner/venues/:id — Owner's own venue detail
 */
const getOwnerVenueById = async (req, res, next) => {
  try {
    const venue = await db.Venue.findOne({
      where: { id: req.params.id, owner_id: req.user.id },
      include: [
        { model: db.Court, as: 'courts' },
      ],
    });
    if (!venue) throw new ApiError(404, 'Không tìm thấy địa điểm hoặc bạn không có quyền');
    res.json({ success: true, data: venue });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/owner/venues/:id — Update venue (owner must own it)
 */
const updateVenue = async (req, res, next) => {
  try {
    const venue = await db.Venue.findOne({
      where: { id: req.params.id, owner_id: req.user.id },
      include: [{ model: db.Court, as: 'courts', attributes: ['id'] }]
    });
    if (!venue) throw new ApiError(404, 'Không tìm thấy địa điểm hoặc bạn không có quyền');

    const { open_time, close_time } = req.body;

    // Safety Check: If shrinking hours, verify no future bookings exist in truncated slots
    if ((open_time && open_time > venue.open_time) || (close_time && close_time < venue.close_time)) {
      const today = new Date().toISOString().split('T')[0];
      const courtIds = venue.courts.map(c => c.id);

      const overlapBookings = await db.TimeSlot.findOne({
        where: {
          court_id: { [Op.in]: courtIds },
          date: { [Op.gte]: today },
          status: 'booked',
          [Op.or]: [
            open_time && open_time > venue.open_time ? { start_time: { [Op.lt]: open_time } } : null,
            close_time && close_time < venue.close_time ? { start_time: { [Op.gte]: close_time } } : null
          ].filter(Boolean)
        }
      });

      if (overlapBookings) {
        throw new ApiError(400, `Không thể thu hẹp giờ hoạt động vì đã có lịch đặt sân tại khung giờ ${overlapBookings.start_time.slice(0, 5)} trong tương lai.`);
      }
    }

    // Don't allow owner to change status (admin sets that)
    const { status, owner_id, ...updateData } = req.body;
    await venue.update(updateData);

    res.json({ success: true, message: 'Cập nhật địa điểm thành công', data: venue });
  } catch (err) {
    next(err);
  }
};

// ============ ADMIN — manage all venues ============

/**
 * GET /api/admin/venues — Admin: all venues with owner info
 */
const adminGetAllVenues = async (req, res, next) => {
  try {
    const { status, city, page = 1, limit = 20 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (city) where.city = city;

    const { count, rows } = await db.Venue.findAndCountAll({
      where,
      include: [
        { model: db.User, as: 'owner', attributes: ['id', 'name', 'email', 'phone'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({
      success: true,
      data: {
        venues: rows,
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
 * PUT /api/admin/venues/:id/status — Admin: approve/suspend venue
 */
const adminUpdateVenueStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['active', 'inactive', 'suspended', 'pending_review'];
    if (!allowed.includes(status)) throw new ApiError(400, 'Trạng thái không hợp lệ');

    const venue = await db.Venue.findByPk(req.params.id, {
      include: [{ model: db.User, as: 'owner', attributes: ['id', 'name', 'email'] }],
    });
    if (!venue) throw new ApiError(404, 'Không tìm thấy địa điểm');

    await venue.update({ status });

    // Notify owner
    await db.Notification.create({
      user_id: venue.owner_id,
      type: 'general',
      title: status === 'active' ? '🎉 Địa điểm đã được duyệt!' : `⚠️ Địa điểm "${venue.name}" đã bị ${status === 'suspended' ? 'đình chỉ' : 'thay đổi trạng thái'}`,
      body: status === 'active'
        ? `Địa điểm "${venue.name}" của bạn đã được duyệt và đang hoạt động trên nền tảng.`
        : `Trạng thái địa điểm "${venue.name}" đã được cập nhật thành: ${status}.`,
      data: { venue_id: venue.id },
    });

    res.json({ success: true, message: `Cập nhật trạng thái địa điểm thành công`, data: venue });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/venues/:id/commission — Admin: set commission rate for venue
 */
const adminSetCommission = async (req, res, next) => {
  try {
    const { commission_rate } = req.body;
    if (commission_rate < 0 || commission_rate > 100) {
      throw new ApiError(400, 'Tỷ lệ hoa hồng phải từ 0 đến 100');
    }

    const venue = await db.Venue.findByPk(req.params.id);
    if (!venue) throw new ApiError(404, 'Không tìm thấy địa điểm');

    await venue.update({ commission_rate });
    res.json({ success: true, message: 'Cập nhật tỷ lệ hoa hồng thành công', data: venue });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/owner/venues/upload — Owner: upload venue image
 */
const uploadVenueImage = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ApiError(400, 'Vui lòng chọn hình ảnh để tải lên');
    }

    const { venue_id } = req.body;
    if (!venue_id) {
       throw new ApiError(400, 'Thiếu Venus ID');
    }

    const venue = await db.Venue.findOne({
      where: { id: venue_id, owner_id: req.user.id }
    });

    if (!venue) {
      throw new ApiError(404, 'Không tìm thấy địa điểm hoặc bạn không có quyền');
    }

    const filePath = `/uploads/venues/${req.file.filename}`;
    
    // Update database immediately
    const currentImages = Array.isArray(venue.images) ? venue.images : [];
    const newImages = [...currentImages, filePath];
    
    await venue.update({ images: newImages });

    res.json({
      success: true,
      message: 'Tải ảnh và lưu vào hệ thống thành công',
      data: { url: filePath, images: newImages }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/owner/venues/image — Owner: remove image from venue
 */
const deleteVenueImage = async (req, res, next) => {
  try {
    const { venue_id, imageUrl } = req.body;
    
    const venue = await db.Venue.findOne({
      where: { id: venue_id, owner_id: req.user.id }
    });

    if (!venue) {
      throw new ApiError(404, 'Không tìm thấy địa điểm hoặc bạn không có quyền');
    }

    // 1. Update Database
    const currentImages = Array.isArray(venue.images) ? venue.images : [];
    const newImages = currentImages.filter(img => img !== imageUrl);
    await venue.update({ images: newImages });

    // 2. Rename Physical File
    try {
      // imageUrl is usually /uploads/venues/image-123.jpg
      const relativePath = imageUrl.startsWith('/') ? imageUrl.substring(1) : imageUrl;
      const fullPath = path.join(process.cwd(), relativePath);

      if (fs.existsSync(fullPath)) {
        const dir = path.dirname(fullPath);
        const ext = path.extname(fullPath);
        const baseName = path.basename(fullPath, ext);
        
        const newFileName = `deleted_${venue_id}_${Date.now()}${ext}`;
        const newPath = path.join(dir, newFileName);
        
        fs.renameSync(fullPath, newPath);
      }
    } catch (fsErr) {
      console.error('Error renaming deleted image file:', fsErr);
      // We don't fail the request if file renaming fails, as DB is updated
    }

    res.json({
      success: true,
      message: 'Xóa ảnh thành công',
      data: { images: newImages }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getVenues, getVenueById,
  getOwnerVenues, getOwnerVenueById, createVenue, updateVenue,
  adminGetAllVenues, adminUpdateVenueStatus, adminSetCommission,
  uploadVenueImage, deleteVenueImage,
};
