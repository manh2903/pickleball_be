'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Venue = Địa điểm / Cơ sở (Tier 2)
 * Belongs to an owner, contains multiple courts (sân con)
 */
const Venue = sequelize.define('Venue', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  owner_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    comment: 'The owner (role=owner) who registered this venue',
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING(200),
    allowNull: true,
    unique: true,
    comment: 'URL-friendly name for the venue',
  },
  address: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  address: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  province_id: {
    type: DataTypes.STRING(10),
    allowNull: true,
    references: { model: 'provinces', key: 'ma_tinh' },
  },
  ward_id: {
    type: DataTypes.STRING(10),
    allowNull: true,
    references: { model: 'wards', key: 'ma' },
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  images: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const val = this.getDataValue('images');
      if (!val) return [];
      try {
        return typeof val === 'string' ? JSON.parse(val) : val;
      } catch (e) {
        return [];
      }
    },
    set(val) {
      this.setDataValue('images', Array.isArray(val) ? JSON.stringify(val) : val);
    }
  },
  amenities: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const val = this.getDataValue('amenities');
      if (!val) return [];
      try {
        return typeof val === 'string' ? JSON.parse(val) : val;
      } catch (e) {
        return [];
      }
    },
    set(val) {
      this.setDataValue('amenities', Array.isArray(val) ? JSON.stringify(val) : val);
    }
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Venue contact phone',
  },
  open_time: {
    type: DataTypes.TIME,
    allowNull: true,
    defaultValue: '06:00:00',
  },
  close_time: {
    type: DataTypes.TIME,
    allowNull: true,
    defaultValue: '22:00:00',
  },

  // ===== Default pricing (inherited by courts if no override) =====
  default_price_morning: {
    type: DataTypes.DECIMAL(10, 0),
    allowNull: false,
    defaultValue: 0,
    comment: 'Default price 06:00-11:00 applied to all courts unless overridden',
  },
  default_price_afternoon: {
    type: DataTypes.DECIMAL(10, 0),
    allowNull: false,
    defaultValue: 0,
    comment: 'Default price 11:00-17:00',
  },
  default_price_evening: {
    type: DataTypes.DECIMAL(10, 0),
    allowNull: false,
    defaultValue: 0,
    comment: 'Default price 17:00-22:00',
  },
  default_price_weekend_surcharge: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Weekend/holiday surcharge percentage e.g. 20 = +20%',
  },

  // ===== Cancellation policy =====
  cancel_policy: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'e.g. {"hours_before": 24, "refund_percent": 100} or array for tiered',
  },

  // ===== Platform status =====
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended', 'pending_review'),
    defaultValue: 'pending_review',
    comment: 'Admin approves pending_review venues before they go live',
  },
  commission_rate: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
    comment: 'Override commission rate for this venue (0 = use platform default)',
  },
  sort_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'venues',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['owner_id'] },
    { fields: ['province_id', 'ward_id'] },
    { fields: ['status'] },
  ],
});

module.exports = Venue;
