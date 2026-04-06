'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * TimeSlot = Khung giờ của sân con
 * Generated per day per court. Price stored at creation time (snapshot).
 */
const TimeSlot = sequelize.define('TimeSlot', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  court_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'courts', key: 'id' },
  },
  venue_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'venues', key: 'id' },
    comment: 'Denormalized for faster queries',
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  start_time: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  end_time: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('available', 'booked', 'maintenance', 'blocked'),
    defaultValue: 'available',
  },
  price: {
    type: DataTypes.DECIMAL(10, 0),
    allowNull: false,
    defaultValue: 0,
    comment: 'Snapshot of calculated price (court price × time factor) at slot creation',
  },
  is_weekend: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  booking_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'bookings', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
}, {
  tableName: 'time_slots',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['court_id', 'date'] },
    { fields: ['venue_id', 'date'] },
    { fields: ['date', 'status'] },
  ],
});

module.exports = TimeSlot;
