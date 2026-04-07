const db = require('../models');

/**
 * GET /api/locations/provinces
 */
exports.getProvinces = async (req, res, next) => {
  try {
    const provinces = await db.Province.findAll({
      order: [['ten_tinh', 'ASC']],
    });
    res.json({ success: true, data: provinces });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/locations/provinces/:ma_tinh/wards
 */
exports.getWards = async (req, res, next) => {
  try {
    const { ma_tinh } = req.params;
    const wards = await db.Ward.findAll({
      where: { province_ma: ma_tinh },
      order: [['ten', 'ASC']],
    });
    res.json({ success: true, data: wards });
  } catch (err) {
    next(err);
  }
};
