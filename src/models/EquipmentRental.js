'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EquipmentRental = sequelize.define('EquipmentRental', {
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
  item_type: {
    type: DataTypes.ENUM('racket', 'ball', 'shoes', 'other'),
    allowNull: false,
  },
  item_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: { min: 1 },
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 0),
    allowNull: false,
  },
  total_price: {
    type: DataTypes.DECIMAL(10, 0),
    allowNull: false,
  },
  returned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  returned_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'equipment_rentals',
  timestamps: true,
  underscored: true,
});

module.exports = EquipmentRental;
