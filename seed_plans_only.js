const db = require('./src/models');

async function seedPlansV3() {
  try {
    console.log("💎 SEEDING FLEXIBLE SUBSCRIPTION OPTIONS (Full normalization)...");
    
    await db.sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
    await db.OwnerSubscription.destroy({ where: {}, truncate: true });
    await db.SubscriptionOption.destroy({ where: {}, truncate: true });
    await db.SubscriptionPlan.destroy({ where: {}, truncate: true });
    await db.sequelize.query("SET FOREIGN_KEY_CHECKS = 1");

    // 1. Create Core Plans (Meta Only)
    const freePlan = await db.SubscriptionPlan.create({
      id: 1,
      name: 'Gói Miễn Phí (Free)',
      description: 'Phù hợp cho câu lạc bộ nhỏ mới bắt đầu vận hành.'
    });

    const basicPlan = await db.SubscriptionPlan.create({
      id: 2,
      name: 'Gói Cơ Bản (Basic)',
      description: 'Mở rộng quy mô kinh doanh với nhiều cơ sở hơn.'
    });

    const premiumPlan = await db.SubscriptionPlan.create({
      id: 3,
      name: 'Gói Chuyên Nghiệp (Premium)',
      description: 'Giải pháp toàn diện cho chuỗi hệ thống sân lớn.'
    });

    // 2. Create Options with specific limits
    await db.SubscriptionOption.bulkCreate([
      // FREE
      { 
        plan_id: freePlan.id, duration_months: 120, price: 0, 
        max_venues: 1, max_courts_per_venue: 3, 
        features: { analytics: false, staff_management: false, custom_coupons: false }
      },
      // BASIC (3 venues, 10 courts)
      { 
        plan_id: basicPlan.id, duration_months: 1, price: 100000, 
        max_venues: 3, max_courts_per_venue: 10,
        features: { analytics: true, staff_management: true, custom_coupons: false }
      },
      { 
        plan_id: basicPlan.id, duration_months: 6, price: 550000, 
        max_venues: 3, max_courts_per_venue: 10,
        features: { analytics: true, staff_management: true, custom_coupons: false }
      },
      { 
        plan_id: basicPlan.id, duration_months: 12, price: 1000000, 
        max_venues: 3, max_courts_per_venue: 10,
        features: { analytics: true, staff_management: true, custom_coupons: false }
      },
      // PREMIUM (10 venues, 30 courts)
      { 
        plan_id: premiumPlan.id, duration_months: 1, price: 300000, 
        max_venues: 10, max_courts_per_venue: 30,
        features: { analytics: true, staff_management: true, custom_coupons: true }
      },
      { 
        plan_id: premiumPlan.id, duration_months: 6, price: 1600000, 
        max_venues: 10, max_courts_per_venue: 30,
        features: { analytics: true, staff_management: true, custom_coupons: true }
      },
      { 
        plan_id: premiumPlan.id, duration_months: 12, price: 3000000, 
        max_venues: 10, max_courts_per_venue: 30,
        features: { analytics: true, staff_management: true, custom_coupons: true }
      },
    ]);

    console.log(`✅ Fully normalized seeding finished!`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }
}

seedPlansV3();
