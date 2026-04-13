require("dotenv").config();
const db = require("../models/index");
const bcrypt = require("bcryptjs");

const OWNERS = [
  { name: "Nguyễn Văn An", email: "owner1@pickleball.vn", phone: "0901111001" },
  { name: "Trần Thị Bình", email: "owner2@pickleball.vn", phone: "0901111002" },
  { name: "Lê Quang Cường", email: "owner3@pickleball.vn", phone: "0901111003" },
  { name: "Phạm Thị Diệu", email: "owner4@pickleball.vn", phone: "0901111004" },
  { name: "Hoàng Minh Đức", email: "owner5@pickleball.vn", phone: "0901111005" },
];

const VENUE_NAMES = [
  "Sân Pickleball Thủ Đức",
  "PB Arena Bình Thạnh",
  "Sunrise Pickleball Q7",
  "Pickle House Gò Vấp",
  "Nam Sài Gòn PB Club",
];

const { AMENITIES_LIST } = require("../constants/amenities");
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pickRandom = (arr) => arr[rand(0, arr.length - 1)];
const pickSome = (arr, n) => [...arr].sort(() => 0.5 - Math.random()).slice(0, n);

function slugify(text, extra = "") {
  const base = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return extra ? `${base}-${extra}` : base;
}

async function seed() {
  try {
    console.log("🔄 Connecting to database...");
    await db.sequelize.authenticate();

    // Ensure tables exist
    console.log("📂 Syncing database models (ALTER)...");
    await db.sequelize.sync({ alter: true });

    // Fetch locations logic MUST follow setup_locations.js first or we need to preserve it.
    // wait, if I force true, I lose provinces/wards.
    // I should NOT force true on locations.
    
    // Better: Only force sync specific models? No.
    // Let's use alter: true and hope for the best, or manually DROP tables.

    // Fetch real locations from DB
    const provinces = await db.Province.findAll();
    const wards = await db.Ward.findAll();
    if (provinces.length === 0 || wards.length === 0) {
      throw new Error("No provinces or wards found in DB. Run setup_locations.js first.");
    }
    console.log(`✅ Loaded ${provinces.length} provinces and ${wards.length} wards from DB.`);

    // TRUNCATE
    console.log("🗑️  Truncating tables...");
    await db.sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
    const tables = [
      "subscription_plans",
      "owner_subscriptions",
      "time_slots",
      "bookings",
      "payments",
      "reviews",
      "coupons",
      "equipment_rentals",
      "incidents",
      "shifts",
      "notifications",
      "memberships",
      "withdrawal_requests",
      "courts",
      "venues",
      "users",
    ];
    for (const t of tables) await db.sequelize.query(`TRUNCATE TABLE \`${t}\``);
    await db.sequelize.query("SET FOREIGN_KEY_CHECKS = 1");

    // SEED SUBSCRIPTION PLANS
    console.log("💎 Seeding Subscription Plans...");
    const plans = await db.SubscriptionPlan.bulkCreate([
      {
        name: 'Gói Miễn Phí (Free)',
        description: 'Phù hợp cho câu lạc bộ nhỏ mới bắt đầu.',
        price: 0,
        duration_months: 120,
        max_venues: 1,
        max_courts_per_venue: 3,
        features: { analytics: false, staff_management: false, custom_coupons: false }
      },
      {
        name: 'Gói Chuyên Nghiệp (Premium)',
        description: 'Giải pháp toàn diện cho hệ thống sân lớn.',
        price: 1500000,
        duration_months: 1,
        max_venues: 10,
        max_courts_per_venue: 30,
        features: { analytics: true, staff_management: true, custom_coupons: true, priority_support: true }
      }
    ]);

    const passwordHash = await bcrypt.hash("123456", 10);
    const admin = await db.User.create({
      name: "Admin System",
      email: "admin@pickleball.vn",
      phone: "0900000001",
      password_hash: passwordHash,
      role: "admin",
    });

    const ownerRecords = [];
    for (const o of OWNERS) {
      const owner = await db.User.create({ ...o, password_hash: passwordHash, role: "owner", owner_status: "approved" });
      ownerRecords.push(owner);

      // Assign PREMIUM plan to seed owners to allow more venues/courts
      await db.OwnerSubscription.create({
        owner_id: owner.id,
        plan_id: plans[1].id, // Premium
        start_date: new Date(),
        end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        status: 'active'
      });
    }
    console.log("👤 Users & Owners created with Subscription plans.");

    const venueRecords = [];
    for (let i = 0; i < VENUE_NAMES.length; i++) {
        const province = pickRandom(provinces);
        const wardOptions = wards.filter((w) => w.province_ma === province.ma_tinh);
        const ward = wardOptions.length > 0 ? pickRandom(wardOptions) : pickRandom(wards);

        const venue = await db.Venue.create({
          owner_id: ownerRecords[i % ownerRecords.length].id,
          name: VENUE_NAMES[i],
          slug: slugify(VENUE_NAMES[i], `${i}-${Date.now().toString().slice(-4)}`),
          address: `${rand(1, 400)} Đường Phố, ${ward.ten}, ${province.ten_tinh}`,
          province_id: province.ma_tinh,
          ward_id: ward.ma,
          latitude: 10 + Math.random() * 10,
          longitude: 105 + Math.random() * 5,
          description: `${VENUE_NAMES[i]} là địa điểm chuyên nghiệp.`,
          amenities: pickSome(AMENITIES_LIST, rand(3, 5)),
          phone: `09${rand(10, 99)}${rand(100000, 999999)}`,
          default_price_morning: 80000,
          default_price_afternoon: 100000,
          default_price_evening: 120000,
          default_price_weekend_surcharge: 10,
          status: "active",
          sort_order: i,
        });
        venueRecords.push(venue);
    }

    // COURTS & SLOTS
    for (const venue of venueRecords) {
      const numCourts = 3;
      for (let j = 1; j <= numCourts; j++) {
        const court = await db.Court.create({ venue_id: venue.id, name: `Sân ${j}`, type: "double", status: "active" });
        const slots = [];
        for (let d = 0; d < 2; d++) {
          const dt = new Date();
          dt.setDate(dt.getDate() + d);
          const ds = dt.toISOString().split("T")[0];
          for (let h = 8; h < 20; h++) {
            slots.push({
              court_id: court.id,
              venue_id: venue.id,
              date: ds,
              start_time: `${h}:00`,
              end_time: `${h + 1}:00`,
              price: 100000,
              status: "available",
            });
          }
        }
        await db.TimeSlot.bulkCreate(slots);
      }
    }

    await db.User.create({ name: "Test User", email: "user@pickleball.vn", phone: "0901234567", password_hash: passwordHash, role: "user" });

    console.log("\n\n🎉 SEED COMPLETED WITH SUBSCRIPTION MODEL!");
    process.exit(0);
  } catch (err) {
    console.error("💥 Seed failed:", err);
    process.exit(1);
  }
}

seed();
