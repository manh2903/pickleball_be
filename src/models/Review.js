'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Review = sequelize.define('Review', {
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
  venue_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'venues', key: 'id' },
    comment: 'Venue the review is for (denormalized from court)',
  },
  booking_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'bookings', key: 'id' },
  },
  rating: {
    type: DataTypes.TINYINT,
    allowNull: false,
    validate: { min: 1, max: 5 },
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_visible: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Admin can hide reviews violating community standards',
  },
  hidden_reason: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Reason admin hid this review',
  },
  hidden_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    comment: 'Admin user_id who hid the review',
  },
}, {
  tableName: 'reviews',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['venue_id'] },
    { fields: ['user_id'] },
  ],
});

module.exports = Review;
