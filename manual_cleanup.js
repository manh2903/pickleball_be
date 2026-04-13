const db = require('./src/models');

async function cleanupDB() {
  try {
    console.log("🧹 Manual DB Cleanup starting...");
    
    const queryInterface = db.sequelize.getQueryInterface();
    
    // Drop columns from users
    const userTable = await queryInterface.describeTable('users');
    if (userTable.points) {
      await queryInterface.removeColumn('users', 'points');
      console.log("✅ Removed 'points' from users");
    }
    if (userTable.member_rank) {
      await queryInterface.removeColumn('users', 'member_rank');
      console.log("✅ Removed 'member_rank' from users");
    }
    
    // Drop columns from bookings
    const bookingTable = await queryInterface.describeTable('bookings');
    if (bookingTable.points_earned) {
      await queryInterface.removeColumn('bookings', 'points_earned');
      console.log("✅ Removed 'points_earned' from bookings");
    }
    
    // Drop table memberships if exists
    await db.sequelize.query("DROP TABLE IF EXISTS memberships");
    console.log("✅ Dropped table 'memberships' (if existed)");
    
    console.log("🎉 Manual cleanup finished!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Cleanup failed:", err);
    process.exit(1);
  }
}

cleanupDB();
