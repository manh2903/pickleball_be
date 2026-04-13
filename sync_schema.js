const db = require('./src/models');

async function sync() {
  try {
    console.log("🔄 Syncing Schema with alter: true...");
    await db.sequelize.sync({ alter: true });
    console.log("✅ Schema synced!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Sync failed:", err);
    process.exit(1);
  }
}

sync();
