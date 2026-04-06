'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * WithdrawalRequest — Owner requests to withdraw their wallet balance
 */
const WithdrawalRequest = sequelize.define('WithdrawalRequest', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  owner_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  amount: {
    type: DataTypes.DECIMAL(14, 0),
    allowNull: false,
    comment: 'Amount requested for withdrawal',
  },
  bank_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  bank_account: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  bank_account_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'rejected'),
    defaultValue: 'pending',
  },
  processed_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    comment: 'Admin who processed the request',
  },
  processed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  reject_reason: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  transaction_ref: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Bank transfer reference',
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'withdrawal_requests',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['owner_id', 'status'] },
  ],
});

module.exports = WithdrawalRequest;
