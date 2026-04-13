const db = require('../models');
const { ApiError } = require('../middleware/errorMiddleware');
const { sendNotification } = require('../services/notificationService');
const { sendEmail } = require('../utils/mailer');

/**
 * Withdrawal Controller — Handling financial payouts
 */
const withdrawalController = {
  // Owner: Request withdrawal
  requestWithdrawal: async (req, res, next) => {
    try {
      const { amount, bank_name, bank_account, bank_account_name, note } = req.body;
      const { Op } = require('sequelize');
      const owner = await db.User.findByPk(req.user.id);

      // 1. Compute pending balance to enforce holding policy
      const venues = await db.Venue.findAll({ where: { owner_id: req.user.id }, attributes: ['id'] });
      const venueIds = venues.map(v => v.id);
      let pending_balance = 0;
      if (venueIds.length > 0) {
        pending_balance = await db.Booking.sum('owner_revenue', {
          where: {
            venue_id: { [Op.in]: venueIds },
            status: 'confirmed',
            payment_status: 'paid'
          }
        }) || 0;
      }
      
      const available_balance = Math.max(0, (owner.wallet_balance || 0) - pending_balance);

      if (available_balance < amount) {
        throw new ApiError(400, `Số dư khả dụng không đủ (Đang tạm giữ: ${new Intl.NumberFormat('vi-VN').format(pending_balance)}đ chờ sân hoàn thành)`);
      }

      if (amount < 50000) {
        throw new ApiError(400, 'Số tiền rút tối thiểu là 50.000đ');
      }

      const t = await db.sequelize.transaction();
      try {
        // 1. Deduct from wallet balance immediately (locked until approved/rejected)
        await owner.decrement('wallet_balance', { by: amount, transaction: t });

        // 2. Create withdrawal request
        const request = await db.WithdrawalRequest.create({
          owner_id: req.user.id,
          amount,
          bank_name,
          bank_account,
          bank_account_name,
          status: 'pending',
          note
        }, { transaction: t });

        await t.commit();

        // Notify Admin
        const io = req.app.get('io');
        await sendNotification(io, {
          userId: 1, // Default admin
          type: 'withdrawal_requested',
          title: '💸 Yêu cầu rút tiền mới',
          body: `Chủ sân ${req.user.name} yêu cầu rút ${parseInt(amount).toLocaleString()} VNĐ.`,
          data: { request_id: request.id }
        });

        res.status(201).json({ success: true, message: 'Gửi yêu cầu rút tiền thành công', data: request });
      } catch (err) {
        await t.rollback();
        throw err;
      }
    } catch (err) {
      next(err);
    }
  },

  // Owner: List own withdrawal requests
  getMyWithdrawals: async (req, res, next) => {
    try {
      const { status, page = 1, limit = 10 } = req.query;
      const where = { owner_id: req.user.id };
      if (status) where.status = status;

      const { count, rows } = await db.WithdrawalRequest.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      });

      res.json({
        success: true,
        data: {
          requests: rows,
          total: count,
          page: parseInt(page),
          totalPages: Math.ceil(count / parseInt(limit))
        }
      });
    } catch (err) {
      next(err);
    }
  },

  // Admin: List all withdrawal requests
  adminGetAllWithdrawals: async (req, res, next) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const where = {};
      if (status) where.status = status;

      const { count, rows } = await db.WithdrawalRequest.findAndCountAll({
        where,
        include: [{ model: db.User, as: 'owner', attributes: ['id', 'name', 'email', 'phone'] }],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      });

      res.json({
        success: true,
        data: {
          requests: rows,
          total: count,
          page: parseInt(page),
          totalPages: Math.ceil(count / parseInt(limit))
        }
      });
    } catch (err) {
      next(err);
    }
  },

  // Admin: Process withdrawal
  adminUpdateWithdrawal: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, reject_reason, transaction_ref, note } = req.body;
      
      const request = await db.WithdrawalRequest.findByPk(id);
      if (!request) throw new ApiError(404, 'Không tìm thấy yêu cầu rút tiền');
      if (request.status !== 'pending' && request.status !== 'processing') {
        throw new ApiError(400, 'Yêu cầu này đã được xử lý xong');
      }

      if (status === 'rejected') {
        const t = await db.sequelize.transaction();
        try {
          // Refund the wallet balance to owner if rejected
          const owner = await db.User.findByPk(request.owner_id);
          await owner.increment('wallet_balance', { by: request.amount, transaction: t });
          
          await request.update({
            status: 'rejected',
            reject_reason,
            processed_by: req.user.id,
            processed_at: new Date(),
            note: note || request.note
          }, { transaction: t });

          await t.commit();
        } catch (err) {
          await t.rollback();
          throw err;
        }
      } else {
        // Approved/Completed/Processing
        await request.update({
          status,
          transaction_ref: transaction_ref || request.transaction_ref,
          processed_by: req.user.id,
          processed_at: status === 'completed' ? new Date() : request.processed_at,
          note: note || request.note
        });
      }

      // 1. Notify Owner of the decision
      const io = req.app.get('io');
      const isApproved = status === 'completed' || status === 'approved';
      const notificationType = isApproved ? 'withdrawal_approved' : 'withdrawal_rejected';
      const title = isApproved ? '✅ Rút tiền thành công' : '❌ Rút tiền bị từ chối';
      const body = isApproved 
        ? `Yêu cầu rút tiền #${request.id} của bạn đã được duyệt. Số tiền: ${request.amount.toLocaleString()} VNĐ.`
        : `Yêu cầu rút tiền #${request.id} của bạn đã bị từ chối. Lý do: ${reject_reason || 'Không có'}.`;

      await sendNotification(io, {
        userId: request.owner_id,
        type: notificationType,
        title: title,
        body: body,
        data: { request_id: request.id }
      });

      res.json({ success: true, message: 'Cập nhật yêu cầu thanh toán thành công' });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = withdrawalController;
