const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SubscriptionOption = sequelize.define('SubscriptionOption', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  plan_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'subscription_plans',
      key: 'id'
    }
  },
  duration_months: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  price: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
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
    type: DataTypes.JSON,
    defaultValue: {}
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'subscription_options',
  underscored: true,
  timestamps: true
});

module.exports = SubscriptionOption;
