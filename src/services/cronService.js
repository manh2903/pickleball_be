const cron = require('node-cron');
const db = require('../models');
const { Op } = require('sequelize');

/**
 * Cron Job Service to handle automated updates
 */
const initCronJobs = () => {
  // Run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('⏰ Running Cron Job: Auto-completing expired bookings...');
    
    const t = await db.sequelize.transaction();
    try {
      const now = new Date();
      // Format as string 'HH:mm:ss' or similar if needed, 
      // but comparing Date objects is safer if standard dates are used.
      
      /**
       * Logic: Find bookings where:
       * 1. Status is 'confirmed'
       * 2. All slots associated with the booking have an end time + date that is in the past.
       */
      
      const expiredBookings = await db.Booking.findAll({
        where: {
          status: 'confirmed',
          payment_status: 'paid'
        },
        include: [{
          model: db.TimeSlot,
          as: 'slots',
          attributes: ['date', 'end_time']
        }],
        transaction: t
      });

      let completedCount = 0;

      for (const booking of expiredBookings) {
        const slots = booking.slots || [];
        if (slots.length === 0) continue;

        // Check if the LATEST slot has ended
        // We find the max (date + end_time)
        const isExpired = slots.every(slot => {
          const slotEnd = new Date(`${slot.date.toString().split('T')[0]}T${slot.end_time}`);
          return slotEnd < now;
        });

        if (isExpired) {
          await booking.update({ status: 'completed' }, { transaction: t });
          completedCount++;
        }
      }

      await t.commit();
      if (completedCount > 0) {
        console.log(`✅ Auto-completed ${completedCount} bookings.`);
      }
    } catch (error) {
      if (!t.finished) await t.rollback();
      console.error('❌ Cron Job Error (Auto-complete):', error);
    }
  });

  console.log('🚀 Cron Jobs initialized');
};

module.exports = { initCronJobs };
