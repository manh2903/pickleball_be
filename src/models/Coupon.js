'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Coupon — scoped to a venue or platform-wide when venue_id is null
 */
const Coupon = sequelize.define('Coupon', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  // Scoping: null = platform-wide (created by admin), non-null = venue-specific (created by owner)
  venue_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'venues', key: 'id' },
    comment: 'null = platform-wide coupon (admin); set = venue-specific (owner)',
  },
  type: {
    type: DataTypes.ENUM('venue', 'platform'),
    allowNull: false,
    defaultValue: 'venue',
    comment: 'venue: owner pays for promotion; platform: admin pays for promotion',
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  discount_type: {
    type: DataTypes.ENUM('percentage', 'fixed'),
    allowNull: false,
  },
  discount_value: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  min_booking_amount: {
    type: DataTypes.DECIMAL(15, 0),
    defaultValue: 0,
  },
  max_discount_amount: {
    type: DataTypes.DECIMAL(15, 0),
    allowNull: true,
  },
  usage_limit: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  used_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  start_date: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  end_date: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'expired'),
    defaultValue: 'active',
  },
}, {
  tableName: 'coupons',
  timestamps: true,
  underscored: true,
});

module.exports = Coupon;
