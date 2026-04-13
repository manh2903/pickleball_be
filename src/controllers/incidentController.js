const db = require('../models');
const { ApiError } = require('../middleware/errorMiddleware');

/**
 * Incident Reporting Controller
 */
const incidentController = {
  // Staff: Create incident
  createIncident: async (req, res, next) => {
    try {
      const { venue_id, court_id, title, description, severity, image_urls } = req.body;
      
      // Verify staff belongs to this venue
      if (req.user.role === 'staff' && req.user.venue_id !== parseInt(venue_id)) {
        throw new ApiError(403, 'Bạn không thể báo cáo sự cố cho địa điểm này');
      }

      const incident = await db.Incident.create({
        venue_id,
        court_id: court_id || null,
        reported_by: req.user.id,
        title,
        description,
        severity: severity || 'medium',
        image_urls: image_urls || [],
        status: 'open'
      });

      // Notify owner of the venue? (Future enhancement)

      res.status(201).json({ success: true, message: 'Báo cáo sự cố thành công', data: incident });
    } catch (err) {
      next(err);
    }
  },

  // Staff/Owner: List incidents for a venue
  getVenueIncidents: async (req, res, next) => {
    try {
      const { venue_id } = req.params;
      const { status, severity, page = 1, limit = 20 } = req.query;

      // Access control: Only staff of this venue or owner of this venue
      if (req.user.role === 'staff' && req.user.venue_id !== parseInt(venue_id)) {
        throw new ApiError(403, 'Bạn không có quyền xem sự cố của địa điểm này');
      }
      
      if (req.user.role === 'owner') {
        const venue = await db.Venue.findOne({ where: { id: venue_id, owner_id: req.user.id } });
        if (!venue) throw new ApiError(403, 'Bạn không sở hữu địa điểm này');
      }

      const where = { venue_id };
      if (status) where.status = status;
      if (severity) where.severity = severity;

      const { count, rows } = await db.Incident.findAndCountAll({
        where,
        include: [
          { model: db.User, as: 'reporter', attributes: ['id', 'name'] },
          { model: db.Court, as: 'court', attributes: ['id', 'name'] }
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      });

      res.json({
        success: true,
        data: {
          incidents: rows,
          total: count,
          page: parseInt(page),
          totalPages: Math.ceil(count / parseInt(limit))
        }
      });
    } catch (err) {
      next(err);
    }
  },

  // Owner: Resolve/Update incident status
  updateIncidentStatus: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, resolution_notes } = req.body;

      const incident = await db.Incident.findByPk(id, {
        include: [{ model: db.Venue, as: 'venue' }]
      });
      if (!incident) throw new ApiError(404, 'Không tìm thấy báo cáo sự cố');

      // Only owner of the venue can update
      if (incident.venue.owner_id !== req.user.id) {
        throw new ApiError(403, 'Bạn không có quyền cập nhật sự cố này');
      }

      const updateData = { status };
      if (status === 'resolved' || status === 'closed') {
        updateData.resolved_by = req.user.id;
        updateData.resolved_at = new Date();
        updateData.resolution_notes = resolution_notes;
      }

      await incident.update(updateData);
      
      res.json({ success: true, message: 'Cập nhật trạng thái sự cố thành công', data: incident });
    } catch (err) {
      next(err);
    }
  },

  // Admin: List incidents across the whole platform
  adminGetAllIncidents: async (req, res, next) => {
    try {
      const { status, severity, search, page = 1, limit = 20 } = req.query;
      const where = {};

      if (status && status !== 'all') where.status = status;
      if (severity && severity !== 'all') where.severity = severity;
      if (search) {
        const { Op } = require('sequelize');
        where[Op.or] = [
          { title: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } },
          { '$venue.name$': { [Op.like]: `%${search}%` } },
          { '$reporter.name$': { [Op.like]: `%${search}%` } },
        ];
      }

      const { count, rows } = await db.Incident.findAndCountAll({
        where,
        include: [
          { model: db.User, as: 'reporter', attributes: ['id', 'name', 'email'] },
          { model: db.User, as: 'resolver', attributes: ['id', 'name'], required: false },
          { model: db.Court, as: 'court', attributes: ['id', 'name'], required: false },
          {
            model: db.Venue,
            as: 'venue',
            attributes: ['id', 'name'],
            include: [{ model: db.User, as: 'owner', attributes: ['id', 'name'] }]
          }
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        distinct: true,
        subQuery: false,
      });

      res.json({
        success: true,
        data: {
          incidents: rows,
          total: count,
          page: parseInt(page),
          totalPages: Math.ceil(count / parseInt(limit)),
        }
      });
    } catch (err) {
      next(err);
    }
  },

  // Admin: Update incident status across the whole platform
  adminUpdateIncidentStatus: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, resolution_notes } = req.body;

      const incident = await db.Incident.findByPk(id);
      if (!incident) throw new ApiError(404, 'Không tìm thấy báo cáo sự cố');

      const updateData = { status };
      if (status === 'resolved' || status === 'closed') {
        updateData.resolved_by = req.user.id;
        updateData.resolved_at = new Date();
        updateData.resolution_notes = resolution_notes;
      } else if (resolution_notes !== undefined) {
        updateData.resolution_notes = resolution_notes;
      }

      await incident.update(updateData);

      res.json({ success: true, message: 'Admin đã cập nhật trạng thái sự cố thành công', data: incident });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = incidentController;
