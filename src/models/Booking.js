'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Booking = sequelize.define('Booking', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  booking_code: {
    type: DataTypes.STRING(20),
    unique: true,
    allowNull: false,
    defaultValue: () => `PB${Date.now().toString().slice(-8)}`,
  },
  // Customer (null for walk-in without account)
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
  // Court hierarchy (all denormalized for quick access)
  venue_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'venues', key: 'id' },
  },
  court_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'courts', key: 'id' },
  },
  slot_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'time_slots', key: 'id' },
  },
  // Walk-in customer info (when user has no account)
  customer_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  customer_phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  customer_email: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  booking_type: {
    type: DataTypes.ENUM('online', 'walkin'),
    defaultValue: 'online',
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'),
    defaultValue: 'pending',
  },
  total_price: {
    type: DataTypes.DECIMAL(12, 0),
    allowNull: false,
    defaultValue: 0,
  },
  deposit_amount: {
    type: DataTypes.DECIMAL(12, 0),
    defaultValue: 0,
  },
  payment_status: {
    type: DataTypes.ENUM('unpaid', 'partial', 'paid', 'refunded'),
    defaultValue: 'unpaid',
  },
  payment_method: {
    type: DataTypes.ENUM('vnpay', 'cash', 'transfer', 'wallet'),
    defaultValue: 'vnpay',
  },
  coupon_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  discount_amount: {
    type: DataTypes.DECIMAL(12, 0),
    defaultValue: 0,
  },
  // Platform commission
  commission_rate: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
    comment: 'Platform commission % applied at booking time (snapshot)',
  },
  commission_amount: {
    type: DataTypes.DECIMAL(12, 0),
    defaultValue: 0,
    comment: 'Actual commission amount deducted from owner revenue',
  },
  owner_revenue: {
    type: DataTypes.DECIMAL(12, 0),
    defaultValue: 0,
    comment: 'total_price - commission_amount — credited to owner wallet on completion',
  },
  // QR check-in
  qr_code: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  check_in_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  checked_in_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Staff user_id who performed check-in',
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  cancelled_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  cancel_reason: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  refund_amount: {
    type: DataTypes.DECIMAL(12, 0),
    defaultValue: 0,
    comment: 'Refund per cancellation policy of the venue',
  },
  points_earned: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'bookings',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['venue_id'] },
    { fields: ['court_id', 'slot_id'] },
    { fields: ['status'] },
    { unique: true, fields: ['booking_code'] },
  ],
});

module.exports = Booking;
