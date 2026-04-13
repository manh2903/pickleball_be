const db = require('./src/models');

const seedSubscriptionPlans = async () => {
  try {
    // Sync logic (Warning: This will create tables if not exist)
    await db.sequelize.sync({ alter: true });

    const plans = [
      {
        name: 'Gói Miễn Phí (Free)',
        description: 'Phù hợp cho câu lạc bộ nhỏ mới bắt đầu.',
        price: 0,
        duration_months: 120, // 10 years for free plan
        max_venues: 1,
        max_courts_per_venue: 3,
        features: {
          analytics: false,
          staff_management: false,
          custom_coupons: false
        }
      },
      {
        name: 'Gói Cơ Bản (Basic)',
        description: 'Tối ưu cho chuỗi sân vừa và nhỏ.',
        price: 500000, // 500k / month
        duration_months: 1,
        max_venues: 3,
        max_courts_per_venue: 10,
        features: {
          analytics: true,
          staff_management: true,
          custom_coupons: true
        }
      },
      {
        name: 'Gói Chuyên Nghiệp (Premium)',
        description: 'Giải pháp toàn diện cho hệ thống sân lớn.',
        price: 1500000, // 1.5M / month
        duration_months: 1,
        max_venues: 10,
        max_courts_per_venue: 30,
        features: {
          analytics: true,
          staff_management: true,
          custom_coupons: true,
          priority_support: true
        }
      }
    ];

    for (const plan of plans) {
      await db.SubscriptionPlan.findOrCreate({
        where: { name: plan.name },
        defaults: plan
      });
    }

    console.log('✅ Subscription Plans seeded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding plans:', err);
    process.exit(1);
  }
};

seedSubscriptionPlans();
