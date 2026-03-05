/**
 * Public CMS Event Controller
 * Read-only access to published CMS events
 */

const CmsEvent = require('../../models/CmsEvent');

/** GET /api/v1/public/cms-events */
exports.getCmsEvents = async (req, res) => {
  try {
    const { limit = 50, page = 1, featured } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { isPublished: true };
    if (featured === 'true') filter.isFeatured = true;

    const events = await CmsEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-createdBy -__v');

    const total = await CmsEvent.countDocuments(filter);

    res.json({
      success: true,
      data: events,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch events', error: error.message });
  }
};

/** GET /api/v1/public/cms-events/:idOrSlug */
exports.getCmsEvent = async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    // Try by slug first, then by _id
    let event = await CmsEvent.findOne({ slug: idOrSlug, isPublished: true }).select('-createdBy -__v');
    if (!event) {
      event = await CmsEvent.findOne({ _id: idOrSlug, isPublished: true }).select('-createdBy -__v').catch(() => null);
    }
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch event', error: error.message });
  }
};
