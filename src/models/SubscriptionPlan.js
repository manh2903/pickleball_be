const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SubscriptionPlan = sequelize.define('SubscriptionPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
  },
  price: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  duration_months: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  max_venues: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  max_courts_per_venue: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3
  },
  features: {
    type: DataTypes.JSON, // Use JSON to store various boolean flags or limits
    defaultValue: {}
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'subscription_plans',
  underscored: true,
  timestamps: true
});

module.exports = SubscriptionPlan;
