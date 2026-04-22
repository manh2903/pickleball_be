const { OwnerSubscription, SubscriptionOption } = require('../models');
const { ApiError } = require('./errorMiddleware');
const { Op } = require('sequelize');

/**
 * Middleware to check if the owner has a specific feature enabled in their active subscription.
 * @param {string} featureName - The name of the feature to check (e.g., 'analytics', 'staff_management')
 */
const checkFeature = (featureName) => {
  return async (req, res, next) => {
    try {
      // Admin bypasses subscription checks
      if (req.user.role === 'admin') {
        return next();
      }

      if (req.user.role !== 'owner') {
        throw new ApiError(403, 'Chỉ chủ sân mới có quyền truy cập tính năng này');
      }

      // Find active subscription for the owner
      const subscription = await OwnerSubscription.findOne({
        where: {
          owner_id: req.user.id,
          status: 'active',
          end_date: { [Op.gt]: new Date() }
        },
        include: [{
          model: SubscriptionOption,
          as: 'option',
          attributes: ['features']
        }]
      });

      if (!subscription) {
        throw new ApiError(403, 'Tài khoản chưa đăng ký gói dịch vụ hoặc gói đã hết hạn');
      }

      const features = subscription.option?.features || {};
      
      if (!features[featureName]) {
        throw new ApiError(403, `Tính năng "${featureName}" không có trong gói dịch vụ hiện tại của bạn. Vui lòng nâng cấp gói để sử dụng.`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { checkFeature };
