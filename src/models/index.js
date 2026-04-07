'use strict';
const sequelize = require('../config/database');

const User = require('./User');
const Venue = require('./Venue');
const Court = require('./Court');
const TimeSlot = require('./TimeSlot');
const Booking = require('./Booking');
const Payment = require('./Payment');
const Review = require('./Review');
const Coupon = require('./Coupon');
const Membership = require('./Membership');
const Notification = require('./Notification');
const Shift = require('./Shift');
const Incident = require('./Incident');
const EquipmentRental = require('./EquipmentRental');
const WithdrawalRequest = require('./WithdrawalRequest');
const PlatformSetting = require('./PlatformSetting');
const Province = require('./Province');
const Ward = require('./Ward');

// ====================================================================
// ASSOCIATIONS
// ====================================================================

// ---- User ----
User.hasMany(Venue, { foreignKey: 'owner_id', as: 'venues' });           // owner → venues
User.hasMany(Booking, { foreignKey: 'user_id', as: 'bookings' });
User.hasMany(Review, { foreignKey: 'user_id', as: 'reviews' });
User.hasMany(Membership, { foreignKey: 'user_id', as: 'memberships' });
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
User.hasMany(Shift, { foreignKey: 'staff_id', as: 'shifts' });           // staff shifts
User.hasMany(Incident, { foreignKey: 'reported_by', as: 'reportedIncidents' });
User.hasMany(WithdrawalRequest, { foreignKey: 'owner_id', as: 'withdrawals' });

// ---- Venue (Tier 2 - Địa điểm) ----
Venue.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });
Venue.hasMany(Court, { foreignKey: 'venue_id', as: 'courts' });
Venue.hasMany(TimeSlot, { foreignKey: 'venue_id', as: 'timeSlots' });
Venue.hasMany(Booking, { foreignKey: 'venue_id', as: 'bookings' });
Venue.hasMany(Review, { foreignKey: 'venue_id', as: 'reviews' });
Venue.hasMany(Shift, { foreignKey: 'venue_id', as: 'shifts' });
Venue.hasMany(Incident, { foreignKey: 'venue_id', as: 'incidents' });
Venue.hasMany(Coupon, { foreignKey: 'venue_id', as: 'coupons' });

// ---- Court (Tier 3 - Sân con) ----
Court.belongsTo(Venue, { foreignKey: 'venue_id', as: 'venue' });
Court.hasMany(TimeSlot, { foreignKey: 'court_id', as: 'timeSlots' });
Court.hasMany(Review, { foreignKey: 'court_id', as: 'reviews' });
Court.hasMany(Incident, { foreignKey: 'court_id', as: 'incidents' });

// ---- TimeSlot ----
TimeSlot.belongsTo(Court, { foreignKey: 'court_id', as: 'court' });
TimeSlot.belongsTo(Venue, { foreignKey: 'venue_id', as: 'venue' });
TimeSlot.belongsTo(Booking, { foreignKey: 'booking_id', as: 'mainBooking' });

// ---- Booking ----
Booking.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Booking.belongsTo(Venue, { foreignKey: 'venue_id', as: 'venue' });
Booking.hasMany(TimeSlot, { foreignKey: 'booking_id', as: 'slots' });
Booking.belongsTo(Coupon, { foreignKey: 'coupon_id', as: 'coupon' });
Booking.hasMany(Payment, { foreignKey: 'booking_id', as: 'payments' });
Booking.hasOne(Review, { foreignKey: 'booking_id', as: 'review' });
Booking.hasMany(EquipmentRental, { foreignKey: 'booking_id', as: 'equipmentRentals' });

// ---- Payment ----
Payment.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });

// ---- Review ----
Review.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Review.belongsTo(Venue, { foreignKey: 'venue_id', as: 'venue' });
Review.belongsTo(Court, { foreignKey: 'court_id', as: 'court' });
Review.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });

// ---- Coupon ----
Coupon.belongsTo(Venue, { foreignKey: 'venue_id', as: 'venue' });
Coupon.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Coupon.hasMany(Booking, { foreignKey: 'coupon_id', as: 'bookings' });

// ---- Membership ----
Membership.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ---- Notification ----
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ---- Shift ----
Shift.belongsTo(User, { foreignKey: 'staff_id', as: 'staff' });
Shift.belongsTo(Venue, { foreignKey: 'venue_id', as: 'venue' });

// ---- Incident ----
Incident.belongsTo(Venue, { foreignKey: 'venue_id', as: 'venue' });
Incident.belongsTo(Court, { foreignKey: 'court_id', as: 'court' });
Incident.belongsTo(User, { foreignKey: 'reported_by', as: 'reporter' });
Incident.belongsTo(User, { foreignKey: 'resolved_by', as: 'resolver' });

// ---- EquipmentRental ----
EquipmentRental.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });

// ---- WithdrawalRequest ----
WithdrawalRequest.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });
WithdrawalRequest.belongsTo(User, { foreignKey: 'processed_by', as: 'processor' });

// ---- Locations ----
Province.hasMany(Ward, { foreignKey: 'province_ma', as: 'wards' });
Ward.belongsTo(Province, { foreignKey: 'province_ma', as: 'province' });

// Venue location relationships
Venue.belongsTo(Province, { foreignKey: 'province_id', as: 'provinceState' });
Venue.belongsTo(Ward, { foreignKey: 'ward_id', as: 'wardState' });
Province.hasMany(Venue, { foreignKey: 'province_id', as: 'venues' });
Ward.hasMany(Venue, { foreignKey: 'ward_id', as: 'venues' });

// ====================================================================
const db = {
  sequelize,
  User,
  Venue,
  Court,
  TimeSlot,
  Booking,
  Payment,
  Review,
  Coupon,
  Membership,
  Notification,
  Shift,
  Incident,
  EquipmentRental,
  WithdrawalRequest,
  PlatformSetting,
  Province,
  Ward,
};

module.exports = db;
