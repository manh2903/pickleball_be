const db = require("../models");

/**
 * GET /api/system/settings
 * Thống kê các settings công khai cho UI
 */
const getPublicSettings = async (req, res, next) => {
  try {
    const settings = await db.PlatformSetting.findAll({
      where: {
        key: ['hotline_support', 'site_name']
      }
    });

    // Chuyển mảng thành object { key: value }
    const settingsMap = {};
    settings.forEach(s => {
      settingsMap[s.key] = s.value;
    });

    res.json({
      success: true,
      data: settingsMap
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPublicSettings
};
