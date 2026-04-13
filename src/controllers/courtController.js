const db = require('../models');
const { ApiError } = require('../middleware/errorMiddleware');
const { Op } = require('sequelize');

/**
 * Verify owner has access to this venue
 */
const assertOwnsVenue = async (ownerId, venueId) => {
  const venue = await db.Venue.findOne({ where: { id: venueId, owner_id: ownerId } });
  if (!venue) throw new ApiError(403, 'Bạn không có quyền quản lý địa điểm này');
  return venue;
};

// ============ PUBLIC ============

/**
 * GET /api/venues/:venueId/courts — Public court listing in a venue
 */
const getCourtsInVenue = async (req, res, next) => {
  try {
    const venueIdParam = req.params.venueId;
    const isSlug = isNaN(Number(venueIdParam));
    let venueId = venueIdParam;

    if (isSlug) {
      const venue = await db.Venue.findOne({ where: { slug: venueIdParam }, attributes: ['id'] });
      if (!venue) throw new ApiError(404, 'Không tìm thấy địa điểm');
      venueId = venue.id;
    }

    const courts = await db.Court.findAll({
      where: { venue_id: venueId, status: { [Op.ne]: 'inactive' } },
      include: [{ model: db.Venue, as: 'venue', attributes: ['id', 'name', 'default_price_morning', 'default_price_afternoon', 'default_price_evening', 'default_price_weekend_surcharge'] }],
      order: [['sort_order', 'ASC']],
    });
    res.json({ success: true, data: courts });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/venues/:venueId/courts/:id — Public court detail
 */
const getCourtById = async (req, res, next) => {
  try {
    const venueIdParam = req.params.venueId;
    const isSlug = isNaN(Number(venueIdParam));
    let venueId = venueIdParam;

    if (isSlug) {
      const venue = await db.Venue.findOne({ where: { slug: venueIdParam }, attributes: ['id'] });
      if (!venue) throw new ApiError(404, 'Không tìm thấy địa điểm');
      venueId = venue.id;
    }

    const court = await db.Court.findOne({
      where: { id: req.params.id, venue_id: venueId },
      include: [
        { model: db.Venue, as: 'venue' },
        {
          model: db.Review, as: 'reviews', where: { is_visible: true }, required: false,
          include: [{ model: db.User, as: 'user', attributes: ['id', 'name', 'avatar'] }],
          limit: 5,
          order: [['created_at', 'DESC']],
        },
      ],
    });
    if (!court) throw new ApiError(404, 'Không tìm thấy sân');
    res.json({ success: true, data: court });
  } catch (err) {
    next(err);
  }
};

// ============ OWNER ============

/**
 * GET /api/owner/venues/:venueId/courts — Owner: manage courts in own venue
 */
const ownerGetCourts = async (req, res, next) => {
  try {
    await assertOwnsVenue(req.user.id, req.params.venueId);
    const courts = await db.Court.findAll({
      where: { venue_id: req.params.venueId },
      order: [['sort_order', 'ASC']],
    });
    res.json({ success: true, data: courts });
  } catch (err) {
    next(err);
  }
};

const { canCreateCourt } = require('../utils/subscriptionHelper');

/**
 * POST /api/owner/venues/:venueId/courts — Create court in owner's venue
 */
const createCourt = async (req, res, next) => {
  try {
    const venue = await assertOwnsVenue(req.user.id, req.params.venueId);
    
    const allowed = await canCreateCourt(req.user.id, venue.id);
    if (!allowed) {
      throw new ApiError(403, 'Bạn đã đạt giới hạn số lượng sân tối đa cho mỗi cơ sở trong gói hiện tại. Vui lòng nâng cấp gói dịch vụ để thêm sân.');
    }

    const {
      name, type, description, amenities, images,
      price_morning, price_afternoon, price_evening,
      status, sort_order,
    } = req.body;

    const court = await db.Court.create({
      venue_id: venue.id,
      name, type, description,
      amenities: amenities || [],
      images: images || [],
      price_morning: price_morning ?? null,    // null = inherit from venue
      price_afternoon: price_afternoon ?? null,
      price_evening: price_evening ?? null,
      status: status || 'active',
      sort_order: sort_order || 0,
    });

    res.status(201).json({ success: true, message: 'Tạo sân thành công', data: court });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/owner/venues/:venueId/courts/:id — Update court
 */
const updateCourt = async (req, res, next) => {
  try {
    await assertOwnsVenue(req.user.id, req.params.venueId);
    const court = await db.Court.findOne({
      where: { id: req.params.id, venue_id: req.params.venueId },
    });
    if (!court) throw new ApiError(404, 'Không tìm thấy sân');

    const { venue_id, ...updateData } = req.body; // prevent venue_id change
    await court.update(updateData);
    res.json({ success: true, message: 'Cập nhật sân thành công', data: court });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/owner/venues/:venueId/courts/:id — Soft delete (set inactive)
 */
const deleteCourt = async (req, res, next) => {
  try {
    await assertOwnsVenue(req.user.id, req.params.venueId);
    const court = await db.Court.findOne({
      where: { id: req.params.id, venue_id: req.params.venueId },
    });
    if (!court) throw new ApiError(404, 'Không tìm thấy sân');
    await court.update({ status: 'inactive' });
    res.json({ success: true, message: 'Đã ẩn sân thành công' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/owner/venues/:venueId/courts/:id/maintenance — Set court to maintenance
 */
const setCourtMaintenance = async (req, res, next) => {
  try {
    await assertOwnsVenue(req.user.id, req.params.venueId);
    const court = await db.Court.findOne({
      where: { id: req.params.id, venue_id: req.params.venueId },
    });
    if (!court) throw new ApiError(404, 'Không tìm thấy sân');

    const { status } = req.body; // 'maintenance' or 'active'
    if (!['active', 'maintenance'].includes(status)) {
      throw new ApiError(400, 'Trạng thái không hợp lệ');
    }
    await court.update({ status });
    res.json({ success: true, message: `Sân đã được đổi sang trạng thái: ${status}`, data: court });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCourtsInVenue, getCourtById,
  ownerGetCourts, createCourt, updateCourt, deleteCourt, setCourtMaintenance,
};
