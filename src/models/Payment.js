'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  // Type identification
  payment_type: {
    type: DataTypes.ENUM('booking', 'subscription'),
    allowNull: false,
    defaultValue: 'booking'
  },
  // Optional relations
  booking_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'bookings', key: 'id' },
  },
  subscription_option_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'subscription_options', key: 'id' },
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Payer user id'
  },
  amount: {
    type: DataTypes.DECIMAL(12, 0),
    allowNull: false,
  },
  method: {
    type: DataTypes.ENUM('cash', 'bank_transfer', 'momo', 'zalopay', 'qr_code', 'vnpay'),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded'),
    defaultValue: 'pending',
  },
  transaction_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'External order code for VNPAY etc'
  },
  note: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  collected_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Staff user_id who collected the payment',
  },
}, {
  tableName: 'payments',
  timestamps: true,
  underscored: true,
});

module.exports = Payment;
