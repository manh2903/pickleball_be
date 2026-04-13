const { Notification } = require('../models');

/**
 * Send a notification to a specific user
 * @param {Object} io - Socket.io instance
 * @param {Object} params - Notification parameters
 * @param {number} params.userId - Recipient ID
 * @param {string} params.type - Enum type
 * @param {string} params.title - Title
 * @param {string} params.body - Detailed message
 * @param {Object} [params.data] - Extra JSON data
 * @param {boolean} [params.broadcastToAdmin] - Whether to emit to entire admin room
 */
const sendNotification = async (io, { userId, type, title, body, data = {}, broadcastToAdmin = false }) => {
  try {
    // 1. Save to Database
    const notification = await Notification.create({
      user_id: userId,
      type,
      title,
      body,
      data
    });

    // 2. Emit via Socket.io
    if (io) {
      if (broadcastToAdmin) {
        // Emit once to all admins
        io.to('admin-room').emit('new-notification', notification);
      } else {
        // Direct emit to the user's specific room
        io.to(`user-${userId}`).emit('new-notification', notification);
      }
    }

    return notification;
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

module.exports = {
  sendNotification
};
