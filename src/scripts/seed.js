require('dotenv').config();
const db = require('../models/index');
const bcrypt = require('bcryptjs');

const OWNERS = [
  { name: 'Nguyễn Văn An', email: 'owner1@pickleball.vn', phone: '0901111001' },
  { name: 'Trần Thị Bình', email: 'owner2@pickleball.vn', phone: '0901111002' },
  { name: 'Lê Quang Cường', email: 'owner3@pickleball.vn', phone: '0901111003' },
  { name: 'Phạm Thị Diệu', email: 'owner4@pickleball.vn', phone: '0901111004' },
  { name: 'Hoàng Minh Đức', email: 'owner5@pickleball.vn', phone: '0901111005' },
];

const VENUE_NAMES = [
  'Sân Pickleball Thủ Đức', 'PB Arena Bình Thạnh', 'Sunrise Pickleball Q7', 'Pickle House Gò Vấp',
  'Nam Sài Gòn PB Club', 'Central Park Pickleball', 'Quận 1 PB Premium', 'East Pickleball Hub',
  'Hanoi PB Center', 'Tây Hồ Pickleball', 'Cầu Giấy Sport Zone', 'Đống Đa PB Palace',
  'Đà Nẵng Pickleball Club', 'Sơn Trà PB Arena', 'Cần Thơ PB Hub', 'Bình Dương Sport Club',
  'Vũng Tàu PB Beach', 'Nha Trang PB Resort', 'Đồng Nai PB Center', 'Long An PB Complex'
];

const { AMENITIES_LIST } = require('../constants/amenities');
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pickRandom = (arr) => arr[rand(0, arr.length - 1)];
const pickSome = (arr, n) => [...arr].sort(() => 0.5 - Math.random()).slice(0, n);

function slugify(text, extra = '') {
  const base = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
  return extra ? `${base}-${extra}` : base;
}

async function seed() {
  try {
    console.log('🔄 Connecting to database...');
    await db.sequelize.authenticate();
    
    // Fetch real locations from DB
    const provinces = await db.Province.findAll();
    const wards = await db.Ward.findAll();
    if (provinces.length === 0 || wards.length === 0) {
      throw new Error('No provinces or wards found in DB. Run setup_locations.js first.');
    }
    console.log(`✅ Loaded ${provinces.length} provinces and ${wards.length} wards from DB.`);

    // TRUNCATE
    console.log('🗑️  Truncating tables...');
    await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    const tables = ['time_slots', 'bookings', 'payments', 'reviews', 'coupons', 'equipment_rentals', 'incidents', 'shifts', 'notifications', 'memberships', 'withdrawal_requests', 'courts', 'venues', 'users'];
    for (const t of tables) await db.sequelize.query(`TRUNCATE TABLE \`${t}\``);
    await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

    const passwordHash = await bcrypt.hash('123456', 10);
    const admin = await db.User.create({ name: 'Admin System', email: 'admin@pickleball.vn', phone: '0900000001', password_hash: passwordHash, role: 'admin' });
    
    const ownerRecords = [];
    for (const o of OWNERS) {
      const owner = await db.User.create({ ...o, password_hash: passwordHash, role: 'owner', owner_status: 'approved' });
      ownerRecords.push(owner);
    }
    console.log('👤 Users & Owners created.');

    const venueRecords = [];
    for (let i = 0; i < VENUE_NAMES.length; i++) {
       const province = pickRandom(provinces);
       // Pick a ward that belongs to this province
       const wardOptions = wards.filter(w => w.province_ma === province.ma_tinh);
       const ward = wardOptions.length > 0 ? pickRandom(wardOptions) : pickRandom(wards); // fallback

       const venue = await db.Venue.create({
         owner_id: ownerRecords[i % ownerRecords.length].id,
         name: VENUE_NAMES[i],
         slug: slugify(VENUE_NAMES[i], `${i}-${Date.now().toString().slice(-4)}`),
         address: `${rand(1, 400)} Đường Phố, ${ward.ten}, ${province.ten_tinh}`,
         province_id: province.ma_tinh,
         ward_id: ward.ma,
         latitude: 10 + Math.random() * 10,
         longitude: 105 + Math.random() * 5,
         description: `${VENUE_NAMES[i]} là địa điểm chuyên nghiệp, chuẩn quốc tế.`,
         amenities: pickSome(AMENITIES_LIST, rand(3, 5)),
         phone: `09${rand(10, 99)}${rand(100000, 999999)}`,
         default_price_morning: 80000 + rand(0, 5) * 10000,
         default_price_afternoon: 70000 + rand(0, 5) * 10000,
         default_price_evening: 120000 + rand(0, 5) * 10000,
         default_price_weekend_surcharge: 10 + rand(0, 4) * 5,
         status: 'active',
         commission_rate: 10,
         sort_order: i
       });
       venueRecords.push(venue);
       console.log(`🏟️  Venue [${i+1}/20]: ${venue.name}`);
    }

    // COURTS & SLOTS (simplified)
    for (const venue of venueRecords) {
      const numCourts = rand(3, 6);
      for (let j = 1; j <= numCourts; j++) {
        const court = await db.Court.create({ venue_id: venue.id, name: `Sân ${j}`, type: 'double', status: 'active' });
        const slots = [];
        for (let d = 0; d < 3; d++) { // Only 3 days for seeding speed
           const dt = new Date(); dt.setDate(dt.getDate() + d);
           const ds = dt.toISOString().split('T')[0];
           for (let h = 7; h < 22; h++) {
              slots.push({ court_id: court.id, venue_id: venue.id, date: ds, start_time: `${h}:00`, end_time: `${h+1}:00`, price: 100000, status: 'available' });
           }
        }
        await db.TimeSlot.bulkCreate(slots);
      }
      process.stdout.write('.');
    }

    await db.User.create({ name: 'Test User', email: 'user@pickleball.vn', phone: '0901234567', password_hash: passwordHash, role: 'user' });

    console.log('\n\n🎉 SEED COMPLETED!');
    process.exit(0);
  } catch (err) {
    console.error('💥 Seed failed:', err);
    process.exit(1);
  }
}

seed();
