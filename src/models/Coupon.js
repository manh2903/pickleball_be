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
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    comment: 'admin or owner user_id',
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  discount_type: {
    type: DataTypes.ENUM('percent', 'fixed'),
    allowNull: false,
  },
  discount_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  min_booking_amount: {
    type: DataTypes.DECIMAL(12, 0),
    defaultValue: 0,
  },
  max_discount_amount: {
    type: DataTypes.DECIMAL(12, 0),
    allowNull: true,
  },
  max_uses: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  used_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  max_uses_per_user: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  starts_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'coupons',
  timestamps: true,
  underscored: true,
});

module.exports = Coupon;
