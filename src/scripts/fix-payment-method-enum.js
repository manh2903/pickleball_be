/**
 * Script: fix-payment-method-enum.js
 * Purpose: Add 'wallet' to the payments.method ENUM column in MySQL
 * Run: node src/scripts/fix-payment-method-enum.js
 */
require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
  }
);

async function run() {
  try {
    await sequelize.authenticate();
    console.log('✅ DB connected');

    await sequelize.query(`
      ALTER TABLE payments 
      MODIFY COLUMN method 
      ENUM('cash','bank_transfer','momo','zalopay','qr_code','vnpay','wallet') 
      NOT NULL
    `);

    console.log('✅ payments.method ENUM updated successfully — wallet added!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

run();
