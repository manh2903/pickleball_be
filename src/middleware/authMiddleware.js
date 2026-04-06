const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * Verify JWT access token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Không có token xác thực' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password_hash', 'refresh_token'] },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa' });
    }

    // Owner must be approved before accessing owner-specific APIs
    // (check is done in individual routes/controllers as needed)
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token đã hết hạn',
        code: 'TOKEN_EXPIRED',
      });
    }
    return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
  }
};

/**
 * Authorize by role(s)
 * Usage: authorize('admin') or authorize('admin', 'owner')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Chưa xác thực' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền thực hiện hành động này',
      });
    }
    next();
  };
};

/**
 * Ensure owner account is approved by admin
 */
const requireApprovedOwner = (req, res, next) => {
  if (req.user.role !== 'owner') return next();
  if (req.user.owner_status !== 'approved') {
    return res.status(403).json({
      success: false,
      message: 'Tài khoản chủ sân chưa được duyệt. Vui lòng chờ admin xét duyệt.',
      code: 'OWNER_NOT_APPROVED',
    });
  }
  next();
};

/**
 * Optional authentication — does not fail if no token present
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password_hash', 'refresh_token'] },
      });
      req.user = user;
    }
  } catch {
    // Ignore — user stays unauthenticated
  }
  next();
};

module.exports = { authenticate, authorize, requireApprovedOwner, optionalAuth };
