'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Province = sequelize.define('Province', {
  ma_tinh: {
    type: DataTypes.STRING(10),
    primaryKey: true,
    allowNull: false,
  },
  ten_tinh: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  loai: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  tinh_ly: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
}, {
  tableName: 'provinces',
  timestamps: false,
  underscored: true,
});

module.exports = Province;
