const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OwnerSubscription = sequelize.define('OwnerSubscription', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  owner_id: {
    type: DataTypes.INTEGER, // Match User.id type
    allowNull: false
  },
  plan_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  option_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'subscription_options', key: 'id' }
  },
  start_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  end_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'expired', 'cancelled'),
    defaultValue: 'active'
  },
  payment_id: {
    type: DataTypes.BIGINT, // ID from the payments table
    allowNull: true
  }
}, {
  tableName: 'owner_subscriptions',
  underscored: true,
  timestamps: true
});

module.exports = OwnerSubscription;
