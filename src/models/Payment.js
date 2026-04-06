'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  booking_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'bookings', key: 'id' },
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
    comment: 'External payment transaction ID',
  },
  refund_amount: {
    type: DataTypes.DECIMAL(12, 0),
    defaultValue: 0,
  },
  refund_at: {
    type: DataTypes.DATE,
    allowNull: true,
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
