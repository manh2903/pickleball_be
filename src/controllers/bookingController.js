const db = require("../models");
const { ApiError } = require("../middleware/errorMiddleware");
const { Op } = require("sequelize");
const qrcode = require("qrcode");

/**
 * GET /api/bookings/availability?court_id=&date=
 * Returns time slots for a court on a specific date
 */
const getAvailability = async (req, res, next) => {
  try {
    const { court_id, venue_id, date } = req.query;

    // Validate required fields
    if (!date) throw new ApiError(400, "Thiếu date");
    if (!court_id && !venue_id) throw new ApiError(400, "Thiếu court_id hoặc venue_id");

    // Validate date (không cho phép ngày trong quá khứ)
    const requestDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(requestDate.getTime())) throw new ApiError(400, "Date không hợp lệ");

    const isPastDate = requestDate < today;

    let venue;
    let courts = [];

    // 1. Find Venue and Courts
    if (court_id) {
      const court = await db.Court.findByPk(court_id, {
        include: [{ model: db.Venue, as: "venue" }],
      });
      if (!court) throw new ApiError(404, "Không tìm thấy sân");
      venue = court.venue;
      courts = [court];
    } else if (venue_id) {
      const isSlug = isNaN(Number(venue_id));
      const venueWhere = isSlug ? { slug: venue_id } : { id: venue_id };
      venue = await db.Venue.findOne({
        where: venueWhere,
        include: [
          {
            model: db.Court,
            as: "courts",
            where: { status: { [Op.in]: ["active", "maintenance"] } },
            required: false,
          },
        ],
      });
      if (!venue) throw new ApiError(404, "Không tìm thấy địa điểm");
      courts = venue.courts || [];
    }

    if (courts.length === 0) {
      return res.json({
        success: true,
        data: {
          venue,
          slots: [],
          message: "Không có sân nào hoạt động",
        },
      });
    }

    // 2. Sync status for future slots (nếu court chuyển sang maintenance)
    const courtIds = courts.map((c) => c.id);
    const maintenanceCourtIds = courts.filter((c) => c.status === "maintenance").map((c) => c.id);

    if (maintenanceCourtIds.length > 0 && !isPastDate) {
      await db.TimeSlot.update(
        { status: "maintenance" },
        {
          where: {
            court_id: { [Op.in]: maintenanceCourtIds },
            date: { [Op.gte]: date },
            status: { [Op.ne]: "maintenance" }, // Chỉ update slot chưa phải maintenance
          },
        },
      );
    }

    // 3. Smart Sync Slots (Tạo nếu thiếu - xử lý trường hợp chủ sân đổi giờ)
    if (courts.length > 0 && !isPastDate) {
      const t = await db.sequelize.transaction();
      try {
        const startHour = venue.open_time ? parseInt(venue.open_time.split(":")[0]) : 6;
        const endHour = venue.close_time ? parseInt(venue.close_time.split(":")[0]) : 22;

        // Lấy danh sách slot hiện có để so sánh
        const existingSlots = await db.TimeSlot.findAll({
          where: { court_id: { [Op.in]: courtIds }, date },
          attributes: ["court_id", "start_time"],
          transaction: t,
        });

        // Tạo map để check nhanh: {courtId: [7, 8, 9...]}
        const existingMap = {};
        existingSlots.forEach((s) => {
          const h = parseInt(s.start_time.split(":")[0]);
          if (!existingMap[s.court_id]) existingMap[s.court_id] = [];
          existingMap[s.court_id].push(h);
        });

        const slotsToCreate = [];
        const dayOfWeek = requestDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        for (const court of courts) {
          if (court.status === "inactive") continue;

          for (let h = startHour; h < endHour; h++) {
            // Nếu giờ này chưa có trong DB cho sân này -> Thêm vào list tạo mới
            if (!existingMap[court.id]?.includes(h)) {
              const startTimeStr = `${h.toString().padStart(2, "0")}:00:00`;
              const endTimeStr = `${(h + 1).toString().padStart(2, "0")}:00:00`;

              let basePrice;
              if (h < 12) {
                basePrice = court.price_morning !== null && court.price_morning !== undefined ? court.price_morning : venue.default_price_morning;
              } else if (h >= 17) {
                basePrice = court.price_evening !== null && court.price_evening !== undefined ? court.price_evening : venue.default_price_evening;
              } else {
                basePrice = venue.default_price_afternoon;
              }

              const surcharge = isWeekend ? parseFloat(venue.default_price_weekend_surcharge || 0) : 0;
              const finalPrice = Math.round(parseFloat(basePrice) * (1 + surcharge / 100));

              slotsToCreate.push({
                court_id: court.id,
                venue_id: venue.id,
                date,
                start_time: startTimeStr,
                end_time: endTimeStr,
                price: finalPrice,
                status: court.status === "maintenance" ? "maintenance" : "available",
              });
            }
          }
        }

        if (slotsToCreate.length > 0) {
          console.log(`Syncing: Creating ${slotsToCreate.length} missing slots for ${date}`);
          await db.TimeSlot.bulkCreate(slotsToCreate, { transaction: t });
        }
        await t.commit();
      } catch (genErr) {
        await t.rollback();
        console.error("Error syncing slots:", genErr);
      }
    }

    // 4. Fetch all slots (newly created or existing)
    // Lọc lại lần cuối để chỉ lấy trong khung giờ hoạt động hiện tại (xử lý khi chủ sân thu hẹp giờ)
    const startHourStr = venue.open_time || "06:00:00";
    const endHourStr = venue.close_time || "22:00:00";

    const slots = await db.TimeSlot.findAll({
      where: {
        court_id: { [Op.in]: courtIds },
        date,
        start_time: { [Op.gte]: startHourStr },
        end_time: { [Op.lte]: endHourStr },
      },
      include: [{ model: db.Court, as: "court", attributes: ["id", "name", "type", "status"] }],
      order: [["start_time", "ASC"]],
    });

    // 5. Format response để dễ sử dụng
    const formattedSlots = slots.map((slot) => ({
      id: slot.id,
      court_id: slot.court_id,
      court_name: slot.court?.name,
      court_type: slot.court?.type,
      court_status: slot.court?.status,
      start_time: slot.start_time,
      end_time: slot.end_time,
      price: slot.price,
      status: slot.status, // available, booked, maintenance
      is_bookable: slot.status === "available" && slot.court?.status === "active",
    }));

    res.json({
      success: true,
      data: {
        venue: {
          id: venue.id,
          name: venue.name,
          slug: venue.slug,
          address: venue.address,
          open_time: venue.open_time || "06:00",
          close_time: venue.close_time || "22:00",
        },
        date,
        is_past_date: isPastDate,
        slots: formattedSlots,
        summary: {
          total_slots: formattedSlots.length,
          available_slots: formattedSlots.filter((s) => s.is_bookable).length,
          booked_slots: formattedSlots.filter((s) => s.status === "booked").length,
          maintenance_slots: formattedSlots.filter((s) => s.status === "maintenance").length,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/bookings — Create booking (user)
 */
const createBooking = async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const { slot_ids, slot_id, coupon_code, notes, payment_method = "vnpay" } = req.body;
    const user = req.user;

    const ids = slot_ids || (slot_id ? [slot_id] : []);
    if (ids.length === 0) throw new ApiError(400, "Vui lòng chọn ít nhất một khung giờ");

    // Online bookings MUST use online payment to prevent "bùng" sân
    if (payment_method !== "vnpay") {
      throw new ApiError(400, "Phương thức thanh toán không hợp lệ cho đặt sân trực tuyến. Vui lòng sử dụng VNPay.");
    }

    const slots = await db.TimeSlot.findAll({
      where: { id: { [Op.in]: ids } },
      include: [
        { model: db.Court, as: "court" },
        { model: db.Venue, as: "venue", attributes: ["id", "commission_rate", "status"] },
      ],
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (slots.length !== ids.length) throw new ApiError(404, "Một số khung giờ không tồn tại");

    const venueId = slots[0].venue_id;

    for (const s of slots) {
      if (s.status !== "available") throw new ApiError(409, `Slot ${s.start_time} đã được đặt`);
      if (s.venue_id !== venueId) throw new ApiError(400, "Tất cả slot phải cùng một địa điểm");
    }

    let totalPrice = slots.reduce((sum, s) => sum + parseFloat(s.price), 0);
    const originalTotalPrice = totalPrice;
    let couponId = null;
    let couponType = "venue"; // default
    let discountAmount = 0;

    if (coupon_code) {
      const coupon = await db.Coupon.findOne({
        where: {
          code: coupon_code,
          status: "active",
          [Op.or]: [{ end_date: null }, { end_date: { [Op.gte]: new Date() } }],
          [Op.or]: [{ usage_limit: null }, { usage_limit: { [Op.gt]: db.sequelize.col("used_count") } }],
        },
        transaction: t,
      });

      if (!coupon) throw new ApiError(400, "Mã giảm giá không hợp lệ hoặc đã hết hạn");
      if (totalPrice < (coupon.min_booking_amount || 0)) {
        throw new ApiError(400, `Cần tối thiểu ${new Intl.NumberFormat("vi-VN").format(coupon.min_booking_amount)}đ để dùng mã này`);
      }

      if (coupon.discount_type === "percentage") {
        discountAmount = Math.round((totalPrice * coupon.discount_value) / 100);
        if (coupon.max_discount_amount) discountAmount = Math.min(discountAmount, coupon.max_discount_amount);
      } else {
        discountAmount = coupon.discount_value;
      }

      totalPrice = Math.max(0, totalPrice - discountAmount);
      couponId = coupon.id;
      couponType = coupon.type; // 'venue' or 'platform'
      await coupon.increment("used_count", { transaction: t });
    }

    const bookingCode = `PB${Date.now().toString().slice(-6)}`;
    const qrData = JSON.stringify({ code: bookingCode, slot_ids: ids, user_id: user.id });
    const qrCodeBase64 = await qrcode.toDataURL(qrData);

    const venue = slots[0].venue;
    const platformSetting = await db.PlatformSetting.findOne({ where: { key: "default_commission_rate" } });
    const defaultRate = parseFloat(platformSetting?.value || 0);
    const rate = venue.commission_rate > 0 ? venue.commission_rate : defaultRate;

    // Tính toán tài chính dựa trên loại phiếu giảm giá
    let commissionAmount = 0;
    let ownerRevenue = 0;

    if (couponId && couponType === "platform") {
      // Nền tảng trả tiền cho khoản giảm giá: Chủ sở hữu nhận được doanh thu dựa trên giá GỐC.
      const originalCommission = Math.round((originalTotalPrice * rate) / 100);
      ownerRevenue = originalTotalPrice - originalCommission;
      // Lợi nhuận của Admin giảm đi discountAmount
      commissionAmount = originalCommission - discountAmount;
    } else {
      // Chủ sở hữu trả tiền hoặc không có phiếu giảm giá: Chủ sở hữu nhận được doanh thu dựa trên giá CUỐI CÙNG
      commissionAmount = Math.round((totalPrice * rate) / 100);
      ownerRevenue = totalPrice - commissionAmount;
    }

    const { customer_name, customer_phone, customer_email } = req.body;

    const booking = await db.Booking.create(
      {
        booking_code: bookingCode,
        user_id: user.id,
        venue_id: venueId,
        customer_name,
        customer_phone,
        customer_email,
        booking_type: "online",
        status: "confirmed",
        total_price: totalPrice,
        original_price: originalTotalPrice, // Optional store for transparency
        payment_status: "unpaid",
        payment_method: payment_method,
        coupon_id: couponId,
        discount_amount: discountAmount,
        commission_rate: rate,
        commission_amount: commissionAmount,
        owner_revenue: ownerRevenue,
        qr_code: qrCodeBase64,
        notes,
      },
      { transaction: t },
    );

    await db.TimeSlot.update({ booking_id: booking.id, status: "booked" }, { where: { id: { [Op.in]: ids } }, transaction: t });

    const courtId = slots[0].court_id;
    const io = req.app.get("io");
    io?.to(`court-${courtId}`).emit("slots-updated", { ids, status: "booked", userId: req.user.id });
    io?.to(`venue-${venueId}`).emit("new-booking", { booking, slots });
    io?.to("admin-room").emit("new-booking", { booking, venue_name: venue.name });

    await t.commit();

    // Notify user if email exists (Move this logic to ONLY after payment or confirmed cash)
    /*
    if (user.email) {
      sendEmail({ ... }).catch((e) => console.error("Booking Email failed", e));
    }
    */

    let paymentUrl = null;
    if (payment_method === "vnpay") {
      const vnpay = require("../utils/vnpay");
      paymentUrl = vnpay.createPaymentUrl(req, {
        orderId: booking.booking_code,
        amount: booking.total_price,
      });
    }

    res.status(201).json({ success: true, data: booking, paymentUrl });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

const { sendEmail } = require("../utils/mailer");

/**
 * Confirm Cash Payment by Owner/Staff
 */
const confirmPayment = async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const booking = await db.Booking.findByPk(req.params.id, {
      include: [{ model: db.User, as: "user", attributes: ["id", "name", "email"] }],
      transaction: t,
    });
    if (!booking) throw new ApiError(404, "Không tìm thấy booking");

    const venue = await db.Venue.findByPk(booking.venue_id);
    if (!venue) throw new ApiError(404, "Không tìm thấy venue");

    if (venue.owner_id !== req.user.id && req.user.role !== "admin" && req.user.role !== "staff") {
      throw new ApiError(403, "Bạn không có quyền xác nhận thanh toán này");
    }

    if (booking.payment_status === "paid") throw new ApiError(400, "Lượt đặt này đã được thanh toán");

    await booking.update({ payment_status: "paid" }, { transaction: t });

    await db.Payment.create(
      {
        booking_id: booking.id,
        amount: booking.total_price,
        method: booking.payment_method || "cash",
        status: "completed",
        collected_by: req.user.id,
        note: "Xác nhận thanh toán tiền mặt bởi quản lý",
      },
      { transaction: t },
    );

    if (booking.owner_revenue > 0) {
      const owner = await db.User.findByPk(venue.owner_id, { transaction: t });
      if (owner) await owner.increment("wallet_balance", { by: booking.owner_revenue, transaction: t });
    }

    await t.commit();

    // Socket notification for real-time status update in dashboards
    const io = req.app.get("io");
    io?.to(`venue-${booking.venue_id}`).emit("booking-status-updated", { id: booking.id, status: "paid" });
    io?.to("admin-room").emit("booking-status-updated", { id: booking.id, status: "paid" });

    // Inform user via email
    if (booking.user?.email) {
      sendEmail({
        to: booking.user.email,
        subject: "✅ Thanh toán thành công - Pickleball Court Marketplace",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p>Chào <strong>${booking.user.name}</strong>,</p>
            <p>Đơn đặt sân <strong>${booking.booking_code}</strong> của bạn đã được xác nhận thanh toán thành công.</p>
            <p>Hẹn gặp bạn tại sân!</p>
          </div>
        `,
      }).catch((e) => console.error("Confirm Email failed", e));
    }

    res.json({ success: true, message: "Xác nhận thanh toán thành công" });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

const getMyBookings = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const where = { user_id: req.user.id };
    if (status) where.status = status;

    const { count, rows } = await db.Booking.findAndCountAll({
      where,
      include: [
        {
          model: db.TimeSlot,
          as: "slots",
          attributes: ["date", "start_time", "end_time"],
          include: [{ model: db.Court, as: "court", include: [{ model: db.Venue, as: "venue", attributes: ["name", "address"] }] }],
        },
        { model: db.Payment, as: "payments", attributes: ["method", "status"] },
      ],
      order: [["created_at", "DESC"]],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      distinct: true,
    });
    res.json({ success: true, data: { bookings: rows, total: count } });
  } catch (err) {
    next(err);
  }
};

const getBookingById = async (req, res, next) => {
  try {
    const idOrCode = req.params.id;
    // Stronger detection: If it starts with PB or WI, it's definitely a code
    const isCode = typeof idOrCode === "string" && (idOrCode.startsWith("PB") || idOrCode.startsWith("WI") || isNaN(Number(idOrCode)));
    const where = isCode ? { booking_code: idOrCode } : { id: idOrCode };

    const booking = await db.Booking.findOne({
      where,
      include: [
        {
          model: db.TimeSlot,
          as: "slots",
          include: [{ model: db.Court, as: "court", include: [{ model: db.Venue, as: "venue" }] }],
        },
        { model: db.User, as: "user", attributes: ["id", "name", "phone"] },
        { model: db.Payment, as: "payments" },
      ],
    });

    if (!booking) throw new ApiError(404, "Không tìm thấy booking");

    // Privacy Check: User can see their own, Owner sees their venue's, Admin sees all
    const isOwner = booking.slots?.[0]?.court?.venue?.owner_id == req.user?.id;
    const isUser = booking.user_id == req.user?.id;
    const isAdmin = req.user?.role === "admin";
    const isStaff = req.user?.role === "staff";

    if (!isUser && !isOwner && !isAdmin && !isStaff) {
      console.log("❌ Privacy Check Failed for Booking:", booking.booking_code);
      console.log("--- Booking User ID:", booking.user_id);
      console.log("--- Request User ID:", req.user?.id);
      console.log("--- Request User Role:", req.user?.role);

      throw new ApiError(403, "Bạn không có quyền truy cập thông tin lượt đặt này.");
    }

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

const cancelBooking = async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const booking = await db.Booking.findByPk(req.params.id, { transaction: t });
    if (!booking) throw new ApiError(404, "Không tìm thấy booking");
    await booking.update({ status: "cancelled", cancelled_at: new Date() }, { transaction: t });
    await db.TimeSlot.update({ status: "available", booking_id: null }, { where: { booking_id: booking.id }, transaction: t });
    await t.commit();
    res.json({ success: true, message: "Hủy thành công" });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

const checkIn = async (req, res, next) => {
  try {
    const { booking_code } = req.body;
    const booking = await db.Booking.findOne({ where: { booking_code } });
    if (!booking) throw new ApiError(404, "Mã không tồn tại");
    await booking.update({ status: "checked_in", check_in_at: new Date() });
    res.json({ success: true, message: "Check-in thành công" });
  } catch (err) {
    next(err);
  }
};

const createWalkInBooking = async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const { slot_ids, customer_name, customer_phone, customer_email, notes } = req.body;
    const slots = await db.TimeSlot.findAll({
      where: { id: { [Op.in]: slot_ids } },
      include: [
        { model: db.Court, as: "court" },
        { model: db.Venue, as: "venue" },
      ],
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (slots.length === 0) throw new ApiError(404, "Không tìm thấy khung giờ");

    const venue = slots[0].venue;
    const platformSetting = await db.PlatformSetting.findOne({ where: { key: "default_commission_rate" } });
    const defaultRate = parseFloat(platformSetting?.value || 0);
    const rate = venue.commission_rate > 0 ? venue.commission_rate : defaultRate;

    const bookingCode = `WI${Date.now().toString().slice(-8)}`;
    const totalPrice = slots.reduce((sum, s) => sum + parseFloat(s.price), 0);
    const commissionAmount = Math.round((totalPrice * rate) / 100);
    const ownerRevenue = totalPrice - commissionAmount;

    const booking = await db.Booking.create(
      {
        booking_code: bookingCode,
        venue_id: venue.id,
        customer_name,
        customer_phone,
        customer_email,
        booking_type: "walkin",
        status: "confirmed",
        total_price: totalPrice,
        payment_status: "unpaid",
        payment_method: "cash",
        commission_rate: rate,
        commission_amount: commissionAmount,
        owner_revenue: ownerRevenue,
        notes,
      },
      { transaction: t },
    );
    await db.TimeSlot.update({ booking_id: booking.id, status: "booked" }, { where: { id: { [Op.in]: slot_ids } }, transaction: t });
    await t.commit();
    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

const ownerGetVenueBookings = async (req, res, next) => {
  try {
    const { status, venue_id, search, page = 1, limit = 10 } = req.query;

    // 1. Determine venues context
    let venueIds = [];
    if (venue_id) {
      // Verify ownership/staff access
      const v = await db.Venue.findOne({ where: { id: venue_id, owner_id: req.user.id } });
      if (!v && req.user.role !== "admin") throw new ApiError(403, "Không có quyền truy cập cơ sở này");
      venueIds = [venue_id];
    } else {
      const venues = await db.Venue.findAll({ where: { owner_id: req.user.id }, attributes: ["id"] });
      venueIds = venues.map((v) => v.id);
    }

    // 2. Build filter
    const where = { venue_id: { [Op.in]: venueIds } };
    if (status && status !== "all") where.status = status;

    if (search) {
      where[Op.or] = [
        { booking_code: { [Op.like]: `%${search}%` } },
        { customer_name: { [Op.like]: `%${search}%` } },
        { customer_phone: { [Op.like]: `%${search}%` } },
        { "$user.name$": { [Op.like]: `%${search}%` } },
        { "$user.phone$": { [Op.like]: `%${search}%` } },
      ];
    }

    // 3. Execution
    const { count, rows } = await db.Booking.findAndCountAll({
      where,
      include: [
        {
          model: db.TimeSlot,
          as: "slots",
          attributes: ["date", "start_time", "end_time"],
          include: [{ model: db.Court, as: "court", attributes: ["id", "name"] }],
        },
        { model: db.User, as: "user", attributes: ["id", "name", "phone", "email"] },
      ],
      order: [["created_at", "DESC"]],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      distinct: true,
      subQuery: false, // Required for complex includes with limit
    });

    res.json({
      success: true,
      data: {
        bookings: rows,
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

const ownerGetBookingDetail = async (req, res, next) => {
  try {
    const booking = await db.Booking.findByPk(req.params.id, {
      include: [
        {
          model: db.TimeSlot,
          as: "slots",
          include: [{ model: db.Court, as: "court", include: [{ model: db.Venue, as: "venue" }] }],
        },
        { model: db.User, as: "user", attributes: ["name", "phone", "email"] },
      ],
    });
    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

const getAllBookings = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = {};
    if (status) where.status = status;
    const { count, rows } = await db.Booking.findAndCountAll({
      where,
      include: [
        {
          model: db.TimeSlot,
          as: "slots",
          include: [{ model: db.Court, as: "court", attributes: ["name"] }],
        },
        { model: db.User, as: "user", attributes: ["name", "phone"] },
      ],
      order: [["created_at", "DESC"]],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      distinct: true,
    });
    res.json({ success: true, data: { bookings: rows, total: count } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAvailability,
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  checkIn,
  createWalkInBooking,
  confirmPayment,
  ownerGetVenueBookings,
  ownerGetBookingDetail,
  getAllBookings,
};
