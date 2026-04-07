require('dotenv').config();
const db = require('../models/index');
const bcrypt = require('bcryptjs');

// ==================== DATA ====================
const OWNERS = [
  { name: 'Nguyễn Văn An', email: 'owner1@pickleball.vn', phone: '0901111001' },
  { name: 'Trần Thị Bình', email: 'owner2@pickleball.vn', phone: '0901111002' },
  { name: 'Lê Quang Cường', email: 'owner3@pickleball.vn', phone: '0901111003' },
  { name: 'Phạm Thị Diệu', email: 'owner4@pickleball.vn', phone: '0901111004' },
  { name: 'Hoàng Minh Đức', email: 'owner5@pickleball.vn', phone: '0901111005' },
];

const VENUES_DATA = [
  // Owner 1 → 4 venues
  { name: 'Sân Pickleball Thủ Đức', city: 'TP.HCM', district: 'Thủ Đức', address: '123 Võ Văn Ngân, Thủ Đức, TP.HCM', lat: 10.8504, lng: 106.7720, morning: 120000, afternoon: 100000, evening: 150000, weekend: 20 },
  { name: 'PB Arena Bình Thạnh',    city: 'TP.HCM', district: 'Bình Thạnh', address: '55 Xô Viết Nghệ Tĩnh, Bình Thạnh, TP.HCM', lat: 10.8093, lng: 106.7112, morning: 100000, afternoon: 90000,  evening: 130000, weekend: 15 },
  { name: 'Sunrise Pickleball Q7',  city: 'TP.HCM', district: 'Quận 7', address: '12 Nguyễn Thị Thập, Quận 7, TP.HCM', lat: 10.7322, lng: 106.7180, morning: 130000, afternoon: 110000, evening: 160000, weekend: 25 },
  { name: 'Pickle House Gò Vấp',    city: 'TP.HCM', district: 'Gò Vấp', address: '88 Phan Văn Trị, Gò Vấp, TP.HCM', lat: 10.8378, lng: 106.6654, morning: 90000, afternoon: 80000,  evening: 120000, weekend: 10 },
  // Owner 2 → 4 venues
  { name: 'Nam Sài Gòn PB Club',    city: 'TP.HCM', district: 'Bình Chánh', address: '200 Nguyễn Văn Linh, Bình Chánh, TP.HCM', lat: 10.7208, lng: 106.6580, morning: 110000, afternoon: 95000,  evening: 140000, weekend: 20 },
  { name: 'Central Park Pickleball', city: 'TP.HCM', district: 'Tân Bình', address: '66 Cộng Hòa, Tân Bình, TP.HCM', lat: 10.8023, lng: 106.6623, morning: 125000, afternoon: 105000, evening: 155000, weekend: 20 },
  { name: 'Quận 1 PB Premium',      city: 'TP.HCM', district: 'Quận 1', address: '10 Đinh Tiên Hoàng, Quận 1, TP.HCM', lat: 10.7769, lng: 106.7009, morning: 150000, afternoon: 130000, evening: 180000, weekend: 30 },
  { name: 'East Pickleball Hub',    city: 'TP.HCM', district: 'Quận 9', address: '45 Lê Văn Việt, Quận 9, TP.HCM', lat: 10.8540, lng: 106.8180, morning: 100000, afternoon: 85000,  evening: 125000, weekend: 15 },
  // Owner 3 → 4 venues
  { name: 'Hanoi PB Center',        city: 'Hà Nội',  district: 'Hoàn Kiếm', address: '22 Hàng Bài, Hoàn Kiếm, Hà Nội', lat: 21.0245, lng: 105.8412, morning: 130000, afternoon: 110000, evening: 160000, weekend: 20 },
  { name: 'Tây Hồ Pickleball',      city: 'Hà Nội',  district: 'Tây Hồ',   address: '78 Xuân Diệu, Tây Hồ, Hà Nội', lat: 21.0639, lng: 105.8328, morning: 120000, afternoon: 100000, evening: 150000, weekend: 20 },
  { name: 'Cầu Giấy Sport Zone',    city: 'Hà Nội',  district: 'Cầu Giấy', address: '33 Nguyễn Phong Sắc, Cầu Giấy, Hà Nội', lat: 21.0367, lng: 105.7831, morning: 110000, afternoon: 95000,  evening: 140000, weekend: 15 },
  { name: 'Đống Đa PB Palace',      city: 'Hà Nội',  district: 'Đống Đa',  address: '5 Chùa Bộc, Đống Đa, Hà Nội', lat: 21.0175, lng: 105.8447, morning: 115000, afternoon: 100000, evening: 145000, weekend: 15 },
  // Owner 4 → 4 venues
  { name: 'Đà Nẵng Pickleball Club',city: 'Đà Nẵng', district: 'Hải Châu', address: '99 Nguyễn Văn Linh, Hải Châu, Đà Nẵng', lat: 16.0544, lng: 108.2022, morning: 100000, afternoon: 85000, evening: 125000, weekend: 15 },
  { name: 'Sơn Trà PB Arena',       city: 'Đà Nẵng', district: 'Sơn Trà',  address: '15 Phạm Văn Đồng, Sơn Trà, Đà Nẵng', lat: 16.0760, lng: 108.2400, morning: 110000, afternoon: 95000, evening: 135000, weekend: 20 },
  { name: 'Cần Thơ PB Hub',         city: 'Cần Thơ', district: 'Ninh Kiều', address: '200 Trần Hưng Đạo, Ninh Kiều, Cần Thơ', lat: 10.0341, lng: 105.7860, morning: 90000,  afternoon: 75000, evening: 110000, weekend: 10 },
  { name: 'Bình Dương Sport Club',  city: 'Bình Dương', district: 'Thuận An', address: '50 Đại Lộ Bình Dương, Thuận An, Bình Dương', lat: 10.9260, lng: 106.7120, morning: 95000, afternoon: 80000, evening: 120000, weekend: 15 },
  // Owner 5 → 4 venues
  { name: 'Vũng Tàu PB Beach',      city: 'Vũng Tàu', district: 'Vũng Tàu', address: '8 Thùy Vân, TP.Vũng Tàu', lat: 10.3470, lng: 107.0843, morning: 105000, afternoon: 90000, evening: 130000, weekend: 20 },
  { name: 'Nha Trang PB Resort',    city: 'Nha Trang', district: 'Nha Trang', address: '36 Trần Phú, Nha Trang, Khánh Hòa', lat: 12.2451, lng: 109.1944, morning: 120000, afternoon: 100000, evening: 150000, weekend: 25 },
  { name: 'Đồng Nai PB Center',     city: 'Đồng Nai', district: 'Biên Hòa', address: '100 Phạm Văn Thuận, Biên Hòa, Đồng Nai', lat: 10.9480, lng: 106.8427, morning: 90000, afternoon: 75000, evening: 115000, weekend: 10 },
  { name: 'Long An PB Complex',     city: 'Long An', district: 'Tân An', address: '22 Hùng Vương, Tân An, Long An', lat: 10.5354, lng: 106.4126, morning: 80000, afternoon: 70000, evening: 100000, weekend: 10 },
];

const COURT_TYPES = ['single', 'double', 'quad'];
const AMENITIES_POOL = ['led_light', 'roof', 'ac', 'vip', 'fan', 'water'];

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pickRandom = (arr) => arr[rand(0, arr.length - 1)];
const pickSome = (arr, n) => arr.sort(() => 0.5 - Math.random()).slice(0, n);

function slugify(text, extra = '') {
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return extra ? `${base}-${extra}` : base;
}

async function seed() {
  try {
    console.log('🔄 Connecting to database...');
    await db.sequelize.authenticate();
    console.log('✅ Connected!\n');

    // ========== TRUNCATE ALL TABLES ==========
    console.log('🗑️  Truncating tables...');
    await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    const tables = [
      'time_slots', 'bookings', 'payments', 'reviews', 'coupons',
      'equipment_rentals', 'incidents', 'shifts', 'notifications',
      'memberships', 'withdrawal_requests', 'courts', 'venues', 'users'
    ];
    for (const t of tables) {
      await db.sequelize.query(`TRUNCATE TABLE \`${t}\``);
      console.log(`   ✓ Truncated ${t}`);
    }
    await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('');

    // ========== CREATE ADMIN ==========
    const passwordHash = await bcrypt.hash('123456', 10);
    const admin = await db.User.create({
      name: 'Admin System',
      email: 'admin@pickleball.vn',
      phone: '0900000001',
      password_hash: passwordHash,
      role: 'admin',
    });
    console.log(`👤 Admin: ${admin.email}`);

    // ========== CREATE 5 OWNERS ==========
    const ownerRecords = [];
    for (const o of OWNERS) {
      const owner = await db.User.create({
        ...o,
        password_hash: passwordHash,
        role: 'owner',
        owner_status: 'approved',
      });
      ownerRecords.push(owner);
      console.log(`👔 Owner: ${owner.email}`);
    }
    console.log('');

    // ========== CREATE 20 VENUES (4 per owner) ==========
    const venueRecords = [];
    for (let i = 0; i < VENUES_DATA.length; i++) {
      const v = VENUES_DATA[i];
      const owner = ownerRecords[Math.floor(i / 4)]; // 4 venues per owner
      const slug = slugify(v.name, Date.now().toString().slice(-5));
      const venue = await db.Venue.create({
        owner_id: owner.id,
        name: v.name,
        slug,
        address: v.address,
        city: v.city,
        district: v.district,
        latitude: v.lat,
        longitude: v.lng,
        description: `${v.name} là địa điểm chơi pickleball chuyên nghiệp tại ${v.city}, với sân được thiết kế chuẩn quốc tế, ánh sáng tốt và hệ thống đặt lịch tiện lợi.`,
        amenities: JSON.stringify(pickSome(['wifi', 'parking', 'toilet', 'shower', 'canteen', 'water', 'locker'], rand(3, 5))),
        phone: `09${rand(10, 99)}${rand(100000, 999999)}`,
        open_time: '06:00:00',
        close_time: '22:00:00',
        default_price_morning: v.morning,
        default_price_afternoon: v.afternoon,
        default_price_evening: v.evening,
        default_price_weekend_surcharge: v.weekend,
        cancel_policy: JSON.stringify({ hours_before: 24, refund_percent: 80 }),
        status: 'active',
        commission_rate: rand(5, 15),
        sort_order: i,
      });
      venueRecords.push(venue);
      console.log(`🏟️  Venue [${i+1}/20]: ${venue.name}`);
    }
    console.log('');

    // ========== CREATE COURTS (5-10 per venue) ==========
    const courtRecords = [];
    for (const venue of venueRecords) {
      const numCourts = rand(5, 10);
      for (let j = 1; j <= numCourts; j++) {
        const courtType = pickRandom(COURT_TYPES);
        const useOverride = Math.random() > 0.5; // 50% chance of price override
        const court = await db.Court.create({
          venue_id: venue.id,
          name: `Sân ${j}`,
          type: courtType,
          description: `Sân ${j} loại ${courtType === 'single' ? 'đơn' : courtType === 'double' ? 'đôi' : 'tứ'} - Chuẩn thi đấu`,
          amenities: JSON.stringify(pickSome(AMENITIES_POOL, rand(2, 4))),
          images: null,
          price_morning:   useOverride ? Math.round(venue.default_price_morning   * (0.9 + Math.random() * 0.3) / 1000) * 1000 : null,
          price_afternoon: useOverride ? Math.round(venue.default_price_afternoon * (0.9 + Math.random() * 0.3) / 1000) * 1000 : null,
          price_evening:   useOverride ? Math.round(venue.default_price_evening   * (0.9 + Math.random() * 0.3) / 1000) * 1000 : null,
          status: 'active',
          sort_order: j,
        });
        courtRecords.push({ court, venue });
      }
      console.log(`   📋 Venue "${venue.name}": ${numCourts} courts`);
    }
    console.log(`\n✅ Total courts: ${courtRecords.length}\n`);

    // ========== GENERATE TIME SLOTS: Today + next 14 days ==========
    console.log('⏰ Generating time slots for 15 days...');
    const HOURS_START = 6;
    const HOURS_END   = 22; // slots: 6-7, 7-8, ..., 21-22

    const today = new Date();
    const dates = Array.from({ length: 15 }, (_, d) => {
      const dt = new Date(today);
      dt.setDate(today.getDate() + d);
      return dt;
    });

    let totalSlots = 0;
    const BATCH_SIZE = 500;
    const slotsBatch = [];

    const flush = async () => {
      if (slotsBatch.length > 0) {
        await db.TimeSlot.bulkCreate(slotsBatch);
        totalSlots += slotsBatch.length;
        slotsBatch.length = 0;
      }
    };

    for (const { court, venue } of courtRecords) {
      for (const date of dates) {
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dateStr = date.toISOString().split('T')[0];

        for (let h = HOURS_START; h < HOURS_END; h++) {
          const startTime = `${String(h).padStart(2, '0')}:00:00`;
          const endTime   = `${String(h + 1).padStart(2, '0')}:00:00`;

          // Calculate price
          let basePrice;
          if (h >= 6 && h < 11) {
            basePrice = court.price_morning   ?? venue.default_price_morning;
          } else if (h >= 11 && h < 17) {
            basePrice = court.price_afternoon ?? venue.default_price_afternoon;
          } else {
            basePrice = court.price_evening   ?? venue.default_price_evening;
          }
          if (isWeekend && venue.default_price_weekend_surcharge > 0) {
            basePrice = Math.round(basePrice * (1 + venue.default_price_weekend_surcharge / 100));
          }

          slotsBatch.push({
            court_id: court.id,
            venue_id: venue.id,
            date: dateStr,
            start_time: startTime,
            end_time: endTime,
            price: basePrice,
            status: 'available',
            is_weekend: isWeekend,
            booking_id: null,
            created_at: new Date(),
            updated_at: new Date(),
          });

          if (slotsBatch.length >= BATCH_SIZE) {
            await flush();
            process.stdout.write(`\r   ⚡ Slots created: ${totalSlots}`);
          }
        }
      }
    }
    await flush();
    console.log(`\r   ⚡ Total slots created: ${totalSlots}`);

    // ========== CREATE A TEST USER ==========
    const testUser = await db.User.create({
      name: 'Test User',
      email: 'user@pickleball.vn',
      phone: '0909999999',
      password_hash: passwordHash,
      role: 'user',
    });
    console.log(`\n🧑‍💻 Test user: ${testUser.email} / password: 123456`);

    console.log('\n🎉 ===== SEED COMPLETED =====');
    console.log(`   👤 Admin:     admin@pickleball.vn / 123456`);
    console.log(`   👔 Owners:    owner1@pickleball.vn ... owner5@pickleball.vn / 123456`);
    console.log(`   🧑 Test user: user@pickleball.vn / 123456`);
    console.log(`   🏟️  Venues:    ${venueRecords.length}`);
    console.log(`   📋 Courts:    ${courtRecords.length}`);
    console.log(`   ⏰ Time slots: ${totalSlots}`);
    console.log('=============================\n');

    process.exit(0);
  } catch (err) {
    console.error('💥 Seed failed:', err);
    process.exit(1);
  }
}

seed();
