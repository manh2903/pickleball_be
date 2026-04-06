'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * PlatformSetting — Admin-configurable global platform settings
 */
const PlatformSetting = sequelize.define('PlatformSetting', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  key: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: 'Setting key e.g. "default_commission_rate", "refund_policy"',
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON or plain text value',
  },
  label: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  type: {
    type: DataTypes.ENUM('number', 'text', 'json', 'boolean'),
    defaultValue: 'text',
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
}, {
  tableName: 'platform_settings',
  timestamps: true,
  underscored: true,
});

module.exports = PlatformSetting;
