const db = require('../models');
const { Op } = require('sequelize');

/**
 * Gets the active subscription of an owner
 * @param {number} ownerId 
 * @returns {Object|null}
 */
const getActiveSubscription = async (ownerId) => {
  const sub = await db.OwnerSubscription.findOne({
    where: {
      owner_id: ownerId,
      status: 'active',
      end_date: { [Op.gt]: new Date() }
    },
    include: [{ model: db.SubscriptionPlan, as: 'plan' }],
    order: [['end_date', 'DESC']]
  });

  return sub;
};

/**
 * Checks if owner can create more venues
 * @param {number} ownerId 
 * @returns {boolean}
 */
const canCreateVenue = async (ownerId) => {
  const sub = await getActiveSubscription(ownerId);
  if (!sub) return false;

  const currentCount = await db.Venue.count({ where: { owner_id: ownerId } });
  return currentCount < sub.plan.max_venues;
};

/**
 * Checks if owner can create more courts in a venue
 * @param {number} ownerId 
 * @param {number} venueId 
 * @returns {boolean}
 */
const canCreateCourt = async (ownerId, venueId) => {
  const sub = await getActiveSubscription(ownerId);
  if (!sub) return false;

  const currentCount = await db.Court.count({ where: { venue_id: venueId } });
  return currentCount < sub.plan.max_courts_per_venue;
};

module.exports = {
  getActiveSubscription,
  canCreateVenue,
  canCreateCourt
};
