'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  type: {
    type: DataTypes.ENUM(
      'booking_confirmed', 'booking_cancelled', 'booking_reminder',
      'payment_received', 'payment_refund', 'promotion', 'court_maintenance',
      'general'
    ),
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  data: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Extra data e.g. {booking_id: 1}',
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  read_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'notifications',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'is_read'] },
  ],
});

module.exports = Notification;
