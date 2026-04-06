'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Court = Sân con (Tier 3)
 * Belongs to a Venue. Price can be overridden per court, otherwise inherits from Venue.
 */
const Court = sequelize.define('Court', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  venue_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'venues', key: 'id' },
    comment: 'The venue (địa điểm) this court belongs to',
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'e.g. "Sân 1", "Sân A", "Sân VIP"',
  },
  type: {
    type: DataTypes.ENUM('single', 'double', 'quad'),
    allowNull: false,
    comment: 'single=đơn, double=đôi, quad=tứ',
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  amenities: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Court-specific amenities: ["led_light","roof","ac","vip"]',
  },
  images: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Court-specific images',
  },

  // ===== Price override (null = inherit from venue default) =====
  price_morning: {
    type: DataTypes.DECIMAL(10, 0),
    allowNull: true,
    comment: 'Override price morning. null = use venue default_price_morning',
  },
  price_afternoon: {
    type: DataTypes.DECIMAL(10, 0),
    allowNull: true,
    comment: 'Override price afternoon. null = use venue default_price_afternoon',
  },
  price_evening: {
    type: DataTypes.DECIMAL(10, 0),
    allowNull: true,
    comment: 'Override price evening. null = use venue default_price_evening',
  },

  status: {
    type: DataTypes.ENUM('active', 'inactive', 'maintenance'),
    defaultValue: 'active',
  },
  sort_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'courts',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['venue_id'] },
    { fields: ['venue_id', 'status'] },
  ],
});

/**
 * Calculate effective price for a given time slot
 * @param {object} court - Court instance (with .venue loaded)
 * @param {string} startTime - "HH:MM" format
 * @param {boolean} isWeekend
 * @returns {number} final price in VND
 */
Court.calculatePrice = (court, startTime, isWeekend = false) => {
  const hour = parseInt(startTime.split(':')[0]);
  const venue = court.venue;

  let basePrice;
  if (hour >= 6 && hour < 11) {
    basePrice = court.price_morning ?? venue.default_price_morning;
  } else if (hour >= 11 && hour < 17) {
    basePrice = court.price_afternoon ?? venue.default_price_afternoon;
  } else {
    basePrice = court.price_evening ?? venue.default_price_evening;
  }

  if (isWeekend && venue.default_price_weekend_surcharge > 0) {
    basePrice = Math.round(basePrice * (1 + venue.default_price_weekend_surcharge / 100));
  }

  return Number(basePrice);
};

module.exports = Court;
