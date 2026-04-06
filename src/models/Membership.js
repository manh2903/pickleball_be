'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Membership = sequelize.define('Membership', {
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
  plan: {
    type: DataTypes.ENUM('monthly', 'quarterly', 'annual'),
    allowNull: false,
  },
  price: {
    type: DataTypes.DECIMAL(12, 0),
    allowNull: false,
  },
  discount_percent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
    comment: 'Discount percentage for bookings',
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'expired', 'cancelled'),
    defaultValue: 'active',
  },
  auto_renew: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'memberships',
  timestamps: true,
  underscored: true,
});

module.exports = Membership;
