'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Shift — Staff work shift, scoped to a venue (created by owner)
 */
const Shift = sequelize.define('Shift', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  staff_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  venue_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'venues', key: 'id' },
    comment: 'Venue the shift is at (owner-scoped)',
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
    type: DataTypes.ENUM('scheduled', 'active', 'completed'),
    defaultValue: 'scheduled',
  },
  // Shift summary filled by staff at end of shift
  total_bookings: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  total_revenue: {
    type: DataTypes.DECIMAL(12, 0),
    defaultValue: 0,
  },
  checkin_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  walkin_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Staff notes / anomalies at end of shift',
  },
}, {
  tableName: 'shifts',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['venue_id', 'date'] },
    { fields: ['staff_id'] },
  ],
});

module.exports = Shift;
