const db = require('../models');
const { ApiError } = require('../middleware/errorMiddleware');

/**
 * POST /api/reviews
 * User posts review for a completed booking
 */
const createReview = async (req, res, next) => {
  try {
    const { booking_id, venue_id, rating, comment } = req.body;

    if (!booking_id && !venue_id) {
      throw new ApiError(400, 'Thiếu thông tin địa điểm hoặc đơn đặt sân');
    }

    let targetVenueId = venue_id;

    // A. Case 1: Reviewing a specific booking
    if (booking_id) {
      const booking = await db.Booking.findOne({
        where: { id: booking_id, user_id: req.user.id }
      });

      if (!booking) throw new ApiError(404, 'Không tìm thấy đơn đặt sân');
      if (booking.status !== 'completed' && booking.status !== 'checked_in') {
        throw new ApiError(400, 'Bạn chỉ có thể đánh giá sau khi đã sử dụng sân');
      }

      // Check if already reviewed
      const existing = await db.Review.findOne({ where: { booking_id } });
      if (existing) throw new ApiError(400, 'Bạn đã đánh giá đơn đặt sân này rồi');

      targetVenueId = booking.venue_id;
    }

    // B. Case 2: General venue review (using venue_id)
    if (!booking_id && venue_id) {
      const venueExists = await db.Venue.findByPk(venue_id);
      if (!venueExists) throw new ApiError(404, 'Không tìm thấy địa điểm');
    }

    // 3. Create review
    const review = await db.Review.create({
      user_id: req.user.id,
      venue_id: targetVenueId,
      booking_id: booking_id || null,
      rating,
      comment,
      is_visible: true
    });

    res.status(201).json({
      success: true,
      message: 'Cảm ơn bạn đã gửi đánh giá! ❤️',
      data: review
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/venues/:venueId/reviews
 * Publicly list reviews for a venue
 */
const getVenueReviews = async (req, res, next) => {
  try {
    const { venueId: venueIdParam } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const isSlug = isNaN(Number(venueIdParam));
    let venueId = venueIdParam;

    if (isSlug) {
      const venue = await db.Venue.findOne({ where: { slug: venueIdParam }, attributes: ['id'] });
      if (!venue) throw new ApiError(404, 'Không tìm thấy địa điểm');
      venueId = venue.id;
    }

    const { count, rows } = await db.Review.findAndCountAll({
      where: { venue_id: venueId, is_visible: true },
      include: [
        { model: db.User, as: 'user', attributes: ['id', 'name', 'avatar'] }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    res.json({
      success: true,
      data: {
        reviews: rows,
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createReview,
  getVenueReviews
};
