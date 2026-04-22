const db = require('../models');
const bcrypt = require('bcryptjs');

const SURNAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Phan', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô'];
const MIDDLE_NAMES = ['Văn', 'Thị', 'Minh', 'Thành', 'Đức', 'Gia', 'Bảo', 'Kim', 'Ngọc', 'Hải', 'Xuân'];
const FIRST_NAMES = ['Hùng', 'Dũng', 'Tuấn', 'Anh', 'Phương', 'Lan', 'Hương', 'Trang', 'Quân', 'Thảo', 'Nam', 'Hoà', 'Long', 'Sơn', 'Tùng'];

function randomName() {
    const s = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
    const m = MIDDLE_NAMES[Math.floor(Math.random() * MIDDLE_NAMES.length)];
    const f = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    return `${s} ${m} ${f}`;
}

function slugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

async function seed() {
  const t = await db.sequelize.transaction();
  try {
    console.log("🧹 Cleaning operational data...");
    await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction: t });
    await db.TimeSlot.destroy({ where: {}, truncate: true, transaction: t });
    await db.Booking.destroy({ where: {}, truncate: true, transaction: t });
    await db.Payment.destroy({ where: {}, truncate: true, transaction: t });
    await db.Court.destroy({ where: {}, truncate: true, transaction: t });
    await db.Venue.destroy({ where: {}, truncate: true, transaction: t });
    await db.OwnerSubscription.destroy({ where: {}, truncate: true, transaction: t });
    await db.SubscriptionOption.destroy({ where: {}, truncate: true, transaction: t });
    await db.SubscriptionPlan.destroy({ where: {}, truncate: true, transaction: t });
    await db.Notification.destroy({ where: {}, truncate: true, transaction: t });
    await db.Review.destroy({ where: {}, truncate: true, transaction: t });
    await db.User.destroy({ where: {}, truncate: true, transaction: t });
    await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction: t });

    const passwordHash = await bcrypt.hash("123456", 10);
    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
    const randFloat = (min, max) => (Math.random() * (max - min) + min).toFixed(6);

    const provinces = await db.Province.findAll({ limit: 10 });

    // 1. ADMIN, OWNERS, USERS
    console.log("👤 Seeding 10 Owners and 40 Users...");
    await db.User.create({ name: "Admin", email: "admin@pickleball.vn", password_hash: passwordHash, role: "admin" }, { transaction: t });
    
    const owners = [];
    for (let i = 1; i <= 10; i++) {
        owners.push(await db.User.create({ name: randomName(), email: `owner${i}@gmail.com`, password_hash: passwordHash, role: "owner", wallet_balance: rand(5000000, 20000000) }, { transaction: t }));
    }
    const users = [];
    for (let i = 1; i <= 40; i++) {
        users.push(await db.User.create({ name: randomName(), email: `user${i}@gmail.com`, password_hash: passwordHash, role: "user", wallet_balance: rand(500000, 2500000) }, { transaction: t }));
    }

    // 2. SUBSCRIPTION PLANS & FULL OPTIONS
    console.log("💎 Seeding Full Subscription Options and Features...");
    const planFree = await db.SubscriptionPlan.create({ name: 'Gói Miễn Phí (Free)', description: 'Giải pháp cơ bản để bắt đầu.' }, { transaction: t });
    const planPro = await db.SubscriptionPlan.create({ name: 'Gói Pro', description: 'Nâng tầm đẳng cấp vận hành.' }, { transaction: t });
    const planUltra = await db.SubscriptionPlan.create({ name: 'Gói Ultra', description: 'Chuỗi cơ sở quy mô hiện đại.' }, { transaction: t });

    const proFeatures = { analytics: true, staff_management: true, custom_coupons: false };
    const ultraFeatures = { analytics: true, staff_management: true, custom_coupons: true };
    const freeFeatures = { analytics: false, staff_management: false, custom_coupons: false };

    const subOptions = await db.SubscriptionOption.bulkCreate([
      // Free
      { plan_id: planFree.id, duration_months: 120, price: 0, max_venues: 1, max_courts_per_venue: 2, features: freeFeatures, is_active: true },
      // Pro
      { plan_id: planPro.id, duration_months: 1, price: 100000, max_venues: 5, max_courts_per_venue: 5, features: proFeatures, is_active: true },
      { plan_id: planPro.id, duration_months: 12, price: 1000000, max_venues: 5, max_courts_per_venue: 5, features: proFeatures, is_active: true },
      // Ultra
      { plan_id: planUltra.id, duration_months: 1, price: 250000, max_venues: 15, max_courts_per_venue: 15, features: ultraFeatures, is_active: true },
      { plan_id: planUltra.id, duration_months: 12, price: 2500000, max_venues: 15, max_courts_per_venue: 15, features: ultraFeatures, is_active: true }
    ], { transaction: t });

    // Assign Subscriptions
    const ownerSubAssignments = [];
    for (let i = 0; i < owners.length; i++) {
        // First owner free, others spread 
        const opt = (i === 0) ? subOptions[0] : (i < 5 ? subOptions[2] : subOptions[4]);
        const sub = await db.OwnerSubscription.create({ owner_id: owners[i].id, plan_id: opt.plan_id, option_id: opt.id, start_date: new Date(), end_date: new Date('2026-01-01'), status: 'active' }, { transaction: t });
        sub.limit_venues = opt.max_venues;
        sub.limit_courts = opt.max_courts_per_venue;
        ownerSubAssignments.push(sub);
    }

    // 3. VENUES & COURTS respecting limits
    console.log("🏟️ Seeding Venues and Courts with Limit Checks...");
    const venuePrefixes = ["Pickle", "Elite", "Pro", "Star", "Legend", "Mega"];
    const courtsList = [];

    for (let i = 0; i < owners.length; i++) {
        const sub = ownerSubAssignments[i];
        const vCountLimit = sub.limit_venues;
        const cCountLimit = sub.limit_courts;

        // Randomize count up to limit
        const actualVCount = (sub.option_id === subOptions[0].id) ? 1 : rand(1, Math.min(vCountLimit, 3));
        for (let v = 0; v < actualVCount; v++) {
            const province = provinces[rand(0, provinces.length - 1)];
            const ward = await db.Ward.findOne({ where: { province_ma: province.ma_tinh } });
            const vName = `${venuePrefixes[rand(0, venuePrefixes.length-1)]} Hub - ${province.ten_tinh} #${v+1}`;

            const venue = await db.Venue.create({
                owner_id: owners[i].id, name: vName, slug: `${slugify(vName)}-${Date.now().toString().slice(-4)}${i}${v}`,
                address: `Số ${rand(1, 999)}, ${ward ? ward.ten : 'P. Pickle'}, ${province.ten_tinh}`,
                province_id: province.ma_tinh, ward_id: ward ? ward.ma : null,
                latitude: randFloat(10, 21), longitude: randFloat(105, 108), status: 'active',
                default_price_morning: 100000, default_price_afternoon: 150000, default_price_evening: 250000,
                default_price_weekend_surcharge: 20
            }, { transaction: t });

            const actualCCount = (sub.option_id === subOptions[0].id) ? 2 : rand(2, cCountLimit);
            for (let c = 1; c <= actualCCount; c++) {
                courtsList.push(await db.Court.create({
                    venue_id: venue.id, name: `Sân thi đấu ${c}`, type: 'double',
                    price_morning: 100000, price_afternoon: 150000, price_evening: 250000, status: 'active'
                }, { transaction: t }));
            }
        }
    }

    // 4. BOOKINGS
    console.log("📅 Generating 600+ Bookings for massive reports...");
    const bStatuses = ['completed', 'completed', 'completed', 'completed', 'cancelled', 'checked_in'];
    const now = new Date();
    for (let i = 0; i < 650; i++) {
        const user = users[rand(0, users.length - 1)];
        const court = courtsList[rand(0, courtsList.length - 1)];
        const status = bStatuses[rand(0, bStatuses.length - 1)];
        const bDate = new Date(); bDate.setDate(now.getDate() - rand(0, 120));
        const hour = rand(6, 21); bDate.setHours(hour, 0, 0, 0);
        const dur = rand(1, 2);
        const totalPrice = 120000 * dur;

        const booking = await db.Booking.create({
            user_id: user.id, venue_id: court.venue_id, booking_code: `PB${Date.now().toString().slice(-6)}${i}`,
            booking_type: 'online', status: status, total_price: totalPrice,
            payment_status: (status === 'completed' || status === 'checked_in') ? 'paid' : 'unpaid',
            payment_method: 'wallet', created_at: bDate, updated_at: bDate
        }, { transaction: t });

        for (let h = 0; h < dur; h++) {
            await db.TimeSlot.create({
                court_id: court.id, venue_id: court.venue_id, booking_id: booking.id,
                date: bDate.toISOString().split('T')[0], start_time: `${(hour+h).toString().padStart(2, '0')}:00:00`,
                end_time: `${(hour+h+1).toString().padStart(2, '0')}:00:00`, price: 120000,
                status: status === 'cancelled' ? 'available' : 'booked', created_at: bDate
            }, { transaction: t });
        }
        if (status === 'completed' || status === 'checked_in') {
            await db.Payment.create({ booking_id: booking.id, user_id: user.id, amount: totalPrice, method: 'wallet', status: 'completed', transaction_id: `PXID${Date.now()}${i}`, created_at: bDate }, { transaction: t });
        }
    }

    await t.commit();
    console.log("\n🚀 DATABASE FULLY SEEDED WITH ALL OPTIONS AND FEATURES!");
    process.exit(0);
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error("💥 Seed failed:", err);
    process.exit(1);
  }
}

seed();
