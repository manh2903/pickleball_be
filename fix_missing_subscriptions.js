const db = require('./src/models');
const { Op } = require('sequelize');

async function fixSubscriptions() {
  try {
    console.log("🛠️ FIXING MISSING SUBSCRIPTIONS FOR OWNERS...");

    // 1. Get Free Option
    const freeOption = await db.SubscriptionOption.findOne({
      include: [{
        model: db.SubscriptionPlan,
        as: 'plan',
        where: { name: { [Op.like]: '%Free%' } }
      }]
    });

    if (!freeOption) {
      console.error("❌ Free Plan Option not found. Please run seed_plans_only.js first.");
      process.exit(1);
    }

    // 2. Find all owners
    const owners = await db.User.findAll({ where: { role: 'owner' } });
    console.log(`Found ${owners.length} owners.`);

    let fixedCount = 0;
    for (const owner of owners) {
      // Check if they already have an active sub
      const existing = await db.OwnerSubscription.findOne({
        where: { owner_id: owner.id, status: 'active' }
      });

      if (!existing) {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + freeOption.duration_months);

        await db.OwnerSubscription.create({
          owner_id: owner.id,
          plan_id: freeOption.plan_id,
          option_id: freeOption.id,
          start_date: new Date(),
          end_date: endDate,
          status: 'active'
        });
        fixedCount++;
        console.log(`✅ Assigned Free plan to owner: ${owner.email}`);
      }
    }

    console.log(`🎉 Finished! Fixed ${fixedCount} owner accounts.`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to fix subscriptions:", err);
    process.exit(1);
  }
}

fixSubscriptions();
