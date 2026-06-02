const db = require('../models');
const { Op } = require('sequelize');

/**
 * Gets the active subscription of an owner or staff
 * @param {number} userId 
 * @returns {Object|null}
 */
const getActiveSubscription = async (userId) => {
  const user = await db.User.findByPk(userId);
  if (!user) return null;

  let ownerId = userId;
  if (user.role === 'staff' && user.venue_id) {
    const venue = await db.Venue.findByPk(user.venue_id);
    if (venue) {
      ownerId = venue.owner_id;
    }
  }

  const sub = await db.OwnerSubscription.findOne({
    where: {
      owner_id: ownerId,
      status: 'active',
      end_date: { [Op.gt]: new Date() }
    },
    include: [
      { model: db.SubscriptionPlan, as: 'plan' },
      { model: db.SubscriptionOption, as: 'option' }
    ],
    order: [['end_date', 'DESC']]
  });

  return sub;
};

/**
 * Checks if owner can create more venues
 */
const canCreateVenue = async (ownerId) => {
  const sub = await getActiveSubscription(ownerId);
  if (!sub) return false;

  const max = sub.option?.max_venues || sub.plan?.max_venues || 0;
  const currentCount = await db.Venue.count({ where: { owner_id: ownerId } });
  return currentCount < max;
};

/**
 * Checks if owner can create more courts in a venue
 */
const canCreateCourt = async (ownerId, venueId) => {
  const sub = await getActiveSubscription(ownerId);
  if (!sub) return false;

  const max = sub.option?.max_courts_per_venue || sub.plan?.max_courts_per_venue || 0;
  const currentCount = await db.Court.count({ where: { venue_id: venueId } });
  return currentCount < max;
};

module.exports = {
  getActiveSubscription,
  canCreateVenue,
  canCreateCourt
};
