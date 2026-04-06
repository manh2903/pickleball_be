/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.name = 'ApiError';
  }
}

/**
 * 404 Not Found handler
 */
const notFound = (req, res, next) => {
  const error = new ApiError(404, `Không tìm thấy route: ${req.originalUrl}`);
  next(error);
};

/**
 * Global error handler
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Lỗi máy chủ nội bộ';

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    message = 'Dữ liệu không hợp lệ';
    const errors = err.errors.map((e) => ({ field: e.path, message: e.message }));
    return res.status(statusCode).json({ success: false, message, errors });
  }

  // Sequelize unique constraint
  if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 409;
    const field = err.errors[0]?.path;
    message = `Giá trị đã tồn tại: ${field}`;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token không hợp lệ';
  }

  if (process.env.NODE_ENV === 'development') {
    console.error('💥 Error:', err);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    ...(err.errors?.length > 0 && { errors: err.errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = { errorHandler, notFound, ApiError };
