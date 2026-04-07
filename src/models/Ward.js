'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Ward = sequelize.define('Ward', {
  ma: {
    type: DataTypes.STRING(10),
    primaryKey: true,
    allowNull: false,
  },
  ten: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  loai: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  province_ma: {
    type: DataTypes.STRING(10),
    allowNull: false,
    references: { model: 'provinces', key: 'ma_tinh' },
  },
}, {
  tableName: 'wards',
  timestamps: false,
  underscored: true,
});

module.exports = Ward;
