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
    console.log("🧹 Cleaning old data...");
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
    console.log("👤 Seeding Users...");
    await db.User.create({ name: "Admin", email: "admin@pickleball.vn", password_hash: passwordHash, role: "admin" }, { transaction: t });
    
    const owners = [];
    for (let i = 1; i <= 10; i++) {
        owners.push(await db.User.create({ name: randomName(), email: `owner${i}@gmail.com`, password_hash: passwordHash, role: "owner", wallet_balance: rand(5000000, 20000000) }, { transaction: t }));
    }
    const users = [];
    for (let i = 1; i <= 40; i++) {
        users.push(await db.User.create({ name: randomName(), email: `user${i}@gmail.com`, password_hash: passwordHash, role: "user", wallet_balance: rand(500000, 2500000) }, { transaction: t }));
    }

    // 2. SUBSCRIPTION PLANS
    console.log("💎 Seeding Plans...");
    const planFree = await db.SubscriptionPlan.create({ name: 'Gói Miễn Phí', description: 'Giải pháp cơ bản.' }, { transaction: t });
    const planPro = await db.SubscriptionPlan.create({ name: 'Gói Pro', description: 'Nâng tầm đẳng cấp.' }, { transaction: t });
    const planUltra = await db.SubscriptionPlan.create({ name: 'Gói Ultra', description: 'Chuỗi cơ sở quy mô.' }, { transaction: t });

    const proFeatures = { analytics: true, staff_management: true, custom_coupons: false };
    const ultraFeatures = { analytics: true, staff_management: true, custom_coupons: true };
    const freeFeatures = { analytics: false, staff_management: false, custom_coupons: false };

    const subOptions = await db.SubscriptionOption.bulkCreate([
      { plan_id: planFree.id, duration_months: 120, price: 0, max_venues: 1, max_courts_per_venue: 2, features: freeFeatures, is_active: true },
      { plan_id: planPro.id, duration_months: 1, price: 150000, max_venues: 5, max_courts_per_venue: 5, features: proFeatures, is_active: true },
      { plan_id: planPro.id, duration_months: 12, price: 1500000, max_venues: 5, max_courts_per_venue: 5, features: proFeatures, is_active: true },
      { plan_id: planUltra.id, duration_months: 1, price: 350000, max_venues: 15, max_courts_per_venue: 15, features: ultraFeatures, is_active: true },
      { plan_id: planUltra.id, duration_months: 12, price: 3500000, max_venues: 15, max_courts_per_venue: 15, features: ultraFeatures, is_active: true }
    ], { transaction: t });

    const ownerSubMeta = []; // To track limits for venues seeding

    // Assign Subscriptions with history
    console.log("💳 Seeding Subscription Histories...");
    for (let i = 0; i < owners.length; i++) {
        const owner = owners[i];
        
        if (i === 0) { // Owner 1: Expired Pro -> Active Ultra (Big History)
            const optPro = subOptions[1]; // Pro Month
            const optUltra = subOptions[4]; // Ultra Year
            
            const d1Start = new Date(); d1Start.setMonth(d1Start.getMonth() - 2);
            const d1End = new Date(); d1End.setMonth(d1End.getMonth() - 1);
            await db.OwnerSubscription.create({ owner_id: owner.id, plan_id: planPro.id, option_id: optPro.id, start_date: d1Start, end_date: d1End, status: 'expired' }, { transaction: t });
            await db.Payment.create({ payment_type: 'subscription', subscription_option_id: optPro.id, user_id: owner.id, amount: optPro.price, method: 'vnpay', status: 'completed', transaction_id: `HIST_${owner.id}_1`, note: `Thanh toán ${planPro.name}`, createdAt: d1Start, updatedAt: d1Start }, { transaction: t, silent: true });

            const d2Start = new Date(); d2Start.setDate(d2Start.getDate() - 5);
            const d2End = new Date(); d2End.setFullYear(d2End.getFullYear() + 1);
            await db.OwnerSubscription.create({ owner_id: owner.id, plan_id: planUltra.id, option_id: optUltra.id, start_date: d2Start, end_date: d2End, status: 'active' }, { transaction: t });
            await db.Payment.create({ payment_type: 'subscription', subscription_option_id: optUltra.id, user_id: owner.id, amount: optUltra.price, method: 'vnpay', status: 'completed', transaction_id: `HIST_${owner.id}_2`, note: `Nâng cấp ${planUltra.name}`, createdAt: d2Start, updatedAt: d2Start }, { transaction: t, silent: true });
            ownerSubMeta.push({ ownerId: owner.id, limitVenues: optUltra.max_venues, limitCourts: optUltra.max_courts_per_venue });

        } else if (i === 1) { // Owner 2: Expired Pro -> Active Pro (Renewal)
            const optPro = subOptions[1];
            const d1Start = new Date(); d1Start.setMonth(d1Start.getMonth() - 1); d1Start.setDate(d1Start.getDate() - 5);
            const d1End = new Date(); d1End.setDate(d1End.getDate() - 5);
            await db.OwnerSubscription.create({ owner_id: owner.id, plan_id: planPro.id, option_id: optPro.id, start_date: d1Start, end_date: d1End, status: 'expired' }, { transaction: t });
            await db.Payment.create({ payment_type: 'subscription', subscription_option_id: optPro.id, user_id: owner.id, amount: optPro.price, method: 'vnpay', status: 'completed', transaction_id: `RENEW_${owner.id}_1`, note: 'Giao dịch tháng trước', createdAt: d1Start, updatedAt: d1Start }, { transaction: t, silent: true });

            const d2Start = new Date(); d2Start.setDate(d2Start.getDate() - 5);
            const d2End = new Date(); d2End.setMonth(d2End.getMonth() + 1);
            await db.OwnerSubscription.create({ owner_id: owner.id, plan_id: planPro.id, option_id: optPro.id, start_date: d2Start, end_date: d2End, status: 'active' }, { transaction: t });
            await db.Payment.create({ payment_type: 'subscription', subscription_option_id: optPro.id, user_id: owner.id, amount: optPro.price, method: 'vnpay', status: 'completed', transaction_id: `RENEW_${owner.id}_2`, note: 'Gia hạn gói hiện tại', createdAt: d2Start, updatedAt: d2Start }, { transaction: t, silent: true });
            ownerSubMeta.push({ ownerId: owner.id, limitVenues: optPro.max_venues, limitCourts: optPro.max_courts_per_venue });

        } else if (i === 2) { // Owner 3: Only Expired (Free fallback)
            const optPro = subOptions[1];
            const dStart = new Date('2026-01-10');
            const dEnd = new Date('2026-02-10');
            await db.OwnerSubscription.create({ owner_id: owner.id, plan_id: planPro.id, option_id: optPro.id, start_date: dStart, end_date: dEnd, status: 'expired' }, { transaction: t });
            await db.Payment.create({ payment_type: 'subscription', subscription_option_id: optPro.id, user_id: owner.id, amount: optPro.price, method: 'vnpay', status: 'completed', transaction_id: `EXP_${owner.id}`, note: 'Thanh toán cũ (Đã hết hạn)', createdAt: dStart, updatedAt: dStart }, { transaction: t, silent: true });
            ownerSubMeta.push({ ownerId: owner.id, limitVenues: 1, limitCourts: 2 }); // Free limits
        } else {
            const opt = (i < 6) ? subOptions[1] : subOptions[3];
            const startDate = new Date();
            const endDate = new Date();
            endDate.setMonth(startDate.getMonth() + opt.duration_months);

            await db.OwnerSubscription.create({ owner_id: owner.id, plan_id: opt.plan_id, option_id: opt.id, start_date: startDate, end_date: endDate, status: 'active' }, { transaction: t });
            await db.Payment.create({ payment_type: 'subscription', subscription_option_id: opt.id, user_id: owner.id, amount: opt.price, method: 'vnpay', status: 'completed', transaction_id: `SUB_${owner.id}`, note: `Kích hoạt gói mới`, createdAt: startDate, updatedAt: startDate }, { transaction: t, silent: true });
            ownerSubMeta.push({ ownerId: owner.id, limitVenues: opt.max_venues, limitCourts: opt.max_courts_per_venue });
        }
    }

    // 3. VENUES
    console.log("🏟️ Seeding Venues...");
    const venuePrefixes = ["Pickle", "Elite", "Pro", "Star", "Legend", "Mega"];
    const courtsList = [];

    for (let i = 0; i < owners.length; i++) {
        const meta = ownerSubMeta[i];
        const actualVCount = rand(1, Math.min(meta.limitVenues, 3));
        for (let v = 0; v < actualVCount; v++) {
            const province = provinces[rand(0, provinces.length - 1)];
            const ward = await db.Ward.findOne({ where: { province_ma: province.ma_tinh } });
            const vName = `${venuePrefixes[rand(0, venuePrefixes.length-1)]} Hub - ${province.ten_tinh} #${v+1}`;
            const venue = await db.Venue.create({
                owner_id: owners[i].id, name: vName, slug: `${slugify(vName)}-${Date.now().toString().slice(-4)}${i}${v}`,
                address: `Số ${rand(1, 999)}, ${ward ? ward.ten : 'P. Pickle'}, ${province.ten_tinh}`,
                province_id: province.ma_tinh, ward_id: ward ? ward.ma : null,
                latitude: randFloat(10, 21), longitude: randFloat(105, 108), status: 'active',
                default_price_morning: 100000, default_price_afternoon: 150000, default_price_evening: 250000
            }, { transaction: t });

            const actualCCount = rand(2, meta.limitCourts);
            for (let c = 1; c <= actualCCount; c++) {
                courtsList.push(await db.Court.create({
                    venue_id: venue.id, name: `Sân ${c}`, type: 'double',
                    price_morning: 100000, price_afternoon: 150000, price_evening: 250000, status: 'active'
                }, { transaction: t }));
            }
        }
    }

    // 4. BOOKINGS
    console.log("📅 Generating 650+ Bookings...");
    const bStatuses = ['completed', 'completed', 'completed', 'completed', 'cancelled', 'checked_in'];
    const now = new Date();
    
    for (let i = 0; i < 650; i++) {
        const user = users[rand(0, users.length - 1)];
        const court = courtsList[rand(0, courtsList.length - 1)];
        const bStatus = bStatuses[rand(0, bStatuses.length - 1)];
        const daysBack = (Math.random() < 0.6) ? rand(0, 6) : rand(7, 120);
        const bDate = new Date(); bDate.setDate(now.getDate() - daysBack);
        const hour = rand(6, 21); bDate.setHours(hour, 0, 0, 0);
        const dur = rand(1, 2);
        const totalPrice = 120000 * dur;

        const booking = await db.Booking.create({
            user_id: user.id, venue_id: court.venue_id, booking_code: `BK${Date.now().toString().slice(-6)}${i}`,
            booking_type: 'online', status: bStatus, total_price: totalPrice,
            payment_status: (bStatus === 'completed' || bStatus === 'checked_in') ? 'paid' : 'unpaid',
            payment_method: 'wallet',
            createdAt: bDate,
            updatedAt: bDate
        }, { transaction: t, silent: true });

        for (let h = 0; h < dur; h++) {
            await db.TimeSlot.create({
                court_id: court.id, venue_id: court.venue_id, booking_id: booking.id,
                date: bDate.toISOString().split('T')[0], start_time: `${(hour+h).toString().padStart(2, '0')}:00:00`,
                end_time: `${(hour+h+1).toString().padStart(2, '0')}:00:00`, price: 120000,
                status: bStatus === 'cancelled' ? 'available' : 'booked',
                createdAt: bDate,
                updatedAt: bDate
            }, { transaction: t, silent: true });
        }
        if (bStatus === 'completed' || bStatus === 'checked_in') {
            await db.Payment.create({ 
                booking_id: booking.id, user_id: user.id, amount: totalPrice, 
                method: 'wallet', status: 'completed', 
                transaction_id: `PXID${Date.now()}${i}`,
                createdAt: bDate,
                updatedAt: bDate
            }, { transaction: t, silent: true });
        }
    }

    await t.commit();
    console.log("\n🚀 DATABASE SYNCED SUCCESSFULLY!");
    process.exit(0);
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error("💥 Seed error:", err);
    process.exit(1);
  }
}

seed();
