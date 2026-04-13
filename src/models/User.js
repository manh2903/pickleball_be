'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING(150),
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    unique: true,
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM('user', 'staff', 'owner', 'admin'),
    defaultValue: 'user',
    comment: 'user=khách hàng, staff=nhân viên lễ tân, owner=chủ sân, admin=vận hành nền tảng',
  },
  avatar: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  // For owner role: platform status
  owner_status: {
    type: DataTypes.ENUM('pending', 'approved', 'suspended'),
    allowNull: true,
    comment: 'Only applies to owner role — pending until admin approves',
  },
  // For owner role: wallet balance on platform
  wallet_balance: {
    type: DataTypes.DECIMAL(14, 0),
    defaultValue: 0,
    comment: 'Net revenue after commission, available for withdrawal',
  },
  // For staff role: which venue they belong to
  venue_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Staff is assigned to a specific venue by the owner',
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'banned'),
    defaultValue: 'active',
  },
  refresh_token: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  email_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'users',
  timestamps: true,
  underscored: true,
});

module.exports = User;
