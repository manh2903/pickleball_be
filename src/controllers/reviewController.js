const db = require('../models');
const { ApiError } = require('../middleware/errorMiddleware');

/**
 * POST /api/reviews
 * User posts review for a completed booking
 */
const createReview = async (req, res, next) => {
  try {
    const { booking_id, rating, comment } = req.body;

    // 1. Verify booking
    const booking = await db.Booking.findOne({
      where: { id: booking_id, user_id: req.user.id }
    });

    if (!booking) throw new ApiError(404, 'Không tìm thấy đơn đặt sân');
    if (booking.status !== 'completed' && booking.status !== 'checked_in') {
      throw new ApiError(400, 'Bạn chỉ có thể đánh giá sau khi đã sử dụng sân');
    }

    // 2. Check if already reviewed
    const existing = await db.Review.findOne({ where: { booking_id } });
    if (existing) throw new ApiError(400, 'Bạn đã đánh giá đơn đặt sân này rồi');

    // 3. Create review
    const { id, court_id, venue_id } = booking;
    const review = await db.Review.create({
      user_id: req.user.id,
      venue_id,
      court_id,
      booking_id: id,
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
    const { venueId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const { count, rows } = await db.Review.findAndCountAll({
      where: { venue_id: venueId, is_visible: true },
      include: [
        { model: db.User, as: 'user', attributes: ['id', 'name', 'avatar'] },
        { model: db.Court, as: 'court', attributes: ['id', 'name'] }
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
