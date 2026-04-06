'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Incident — Staff reports to owner (not admin)
 */
const Incident = sequelize.define('Incident', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  venue_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'venues', key: 'id' },
  },
  court_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'courts', key: 'id' },
    comment: 'null if incident is venue-wide (not court-specific)',
  },
  reported_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    comment: 'Staff user_id',
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  image_urls: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of image URLs attached by staff',
  },
  severity: {
    type: DataTypes.ENUM('low', 'medium', 'high'),
    defaultValue: 'medium',
  },
  status: {
    type: DataTypes.ENUM('open', 'in_progress', 'resolved', 'closed'),
    defaultValue: 'open',
  },
  resolved_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    comment: 'Owner user_id who resolved the incident',
  },
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  resolution_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'incidents',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['venue_id', 'status'] },
    { fields: ['reported_by'] },
  ],
});

module.exports = Incident;
