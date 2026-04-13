const db = require('./src/models');

async function cleanupSubscriptionPlan() {
  try {
    console.log("🧹 Cleaning up redundant columns in subscription_plans...");
    
    // Check and drop columns if they exist
    const columnsToDrop = ['max_venues', 'max_courts_per_venue', 'features', 'price', 'duration_months'];
    
    for (const col of columnsToDrop) {
      const [results] = await db.sequelize.query(`SHOW COLUMNS FROM subscription_plans LIKE '${col}'`);
      if (results.length > 0) {
        await db.sequelize.query(`ALTER TABLE subscription_plans DROP COLUMN ${col}`);
        console.log(`✅ Dropped column '${col}' from subscription_plans`);
      }
    }

    console.log("🎉 Cleanup finished!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Cleanup failed:", err);
    process.exit(1);
  }
}

cleanupSubscriptionPlan();
