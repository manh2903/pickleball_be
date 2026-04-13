const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, SubscriptionPlan, OwnerSubscription } = require('../models');
const { ApiError } = require('../middleware/errorMiddleware');

const generateTokens = (user) => {
  const payload = { id: user.id, role: user.role };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: (process.env.JWT_EXPIRES_IN && process.env.JWT_EXPIRES_IN !== "") ? process.env.JWT_EXPIRES_IN : '30m',
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN && process.env.JWT_REFRESH_EXPIRES_IN !== "") ? process.env.JWT_REFRESH_EXPIRES_IN : '7d',
  });

  return { accessToken, refreshToken };
};

const sanitizeUser = (user) => {
  const data = user.toJSON();
  delete data.password_hash;
  delete data.refresh_token;
  return data;
};

/**
 * POST /api/auth/register
 * Register as 'user' (customer). Owners register via /api/auth/register-owner.
 */
const register = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) throw new ApiError(409, 'Email đã được sử dụng');

    if (phone) {
      const existingPhone = await User.findOne({ where: { phone } });
      if (existingPhone) throw new ApiError(409, 'Số điện thoại đã được sử dụng');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name, email, phone,
      password_hash: passwordHash,
      role: 'user',
    });

    const { accessToken, refreshToken } = generateTokens(user);
    await user.update({ refresh_token: refreshToken });

    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công',
      data: { user: sanitizeUser(user), accessToken, refreshToken },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/register-owner
 * Register as owner — creates account with owner_status: 'pending' (awaits admin approval)
 */
/**
 * POST /api/auth/register-owner
 * Register as owner — creates account with owner_status: 'approved'
 */
const registerOwner = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) throw new ApiError(409, 'Email đã được sử dụng');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name, email, phone,
      password_hash: passwordHash,
      role: 'owner',
      owner_status: 'approved', 
    });

    // Auto-assign FREE subscription plan via normalized Option
    const freeOption = await SubscriptionOption.findOne({
      include: [{
        model: SubscriptionPlan,
        as: 'plan',
        where: { name: { [require('sequelize').Op.like]: '%Free%' } }
      }]
    });

    if (freeOption) {
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + freeOption.duration_months);

      await OwnerSubscription.create({
        owner_id: user.id,
        plan_id: freeOption.plan_id,
        option_id: freeOption.id,
        start_date: new Date(),
        end_date: endDate,
        status: 'active'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản chủ sân thành công! Bạn có thể đăng nhập ngay.',
      data: { user: sanitizeUser(user) },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) throw new ApiError(401, 'Email hoặc mật khẩu không chính xác');

    if (user.status === 'banned') {
      throw new ApiError(403, 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) throw new ApiError(401, 'Email hoặc mật khẩu không chính xác');

    const { accessToken, refreshToken } = generateTokens(user);
    await user.update({ refresh_token: refreshToken, last_login: new Date() });

    res.json({
      success: true,
      message: 'Đăng nhập thành công',
      data: { user: sanitizeUser(user), accessToken, refreshToken },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/refresh
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) throw new ApiError(401, 'Refresh token không tồn tại');

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findByPk(decoded.id);

    if (!user || user.refresh_token !== token) {
      throw new ApiError(401, 'Refresh token không hợp lệ');
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    await user.update({ refresh_token: newRefreshToken });

    res.json({
      success: true,
      data: { accessToken, refreshToken: newRefreshToken },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  try {
    await req.user.update({ refresh_token: null });
    res.json({ success: true, message: 'Đăng xuất thành công' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  res.json({ success: true, data: sanitizeUser(req.user) });
};

/**
 * PUT /api/auth/me — Update profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, avatar } = req.body;
    const user = await User.findByPk(req.user.id);

    if (phone && phone !== user.phone) {
      const existing = await User.findOne({ where: { phone } });
      if (existing) throw new ApiError(409, 'Số điện thoại đã được sử dụng');
    }

    await user.update({ name, phone, avatar });
    res.json({ success: true, message: 'Cập nhật hồ sơ thành công', data: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/auth/change-password
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id);

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) throw new ApiError(400, 'Mật khẩu hiện tại không đúng');

    const hash = await bcrypt.hash(newPassword, 12);
    await user.update({ password_hash: hash, refresh_token: null });

    res.json({ success: true, message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register, registerOwner, login, refreshToken, logout, getMe, updateProfile, changePassword,
};
