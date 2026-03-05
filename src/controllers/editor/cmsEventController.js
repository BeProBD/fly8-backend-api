/**
 * Editor CMS Event Controller
 * Full CRUD for CMS-managed events
 */

const CmsEvent = require('../../models/CmsEvent');
const { cloudinary } = require('../../config/cloudinary');

const uploadToCloudinary = async file => {
  const base64Image = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(base64Image, {
    resource_type: 'image',
    folder: 'fly8-events',
    timeout: 120000,
  });
  return result.secure_url;
};

/** GET /api/v1/editor/cms-events */
exports.getCmsEvents = async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const events = await CmsEvent.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'firstName lastName');

    const total = await CmsEvent.countDocuments();

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

/** GET /api/v1/editor/cms-events/:id */
exports.getCmsEvent = async (req, res) => {
  try {
    const event = await CmsEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch event', error: error.message });
  }
};

/** POST /api/v1/editor/cms-events */
exports.createCmsEvent = async (req, res) => {
  try {
    const { title, description, location, startDate, endDate, category, isPublished, isFeatured } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required' });
    }

    // Ensure unique slug
    let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const existing = await CmsEvent.findOne({ slug });
    if (existing) slug = `${slug}-${Date.now()}`;

    let image;
    if (req.file) {
      image = await uploadToCloudinary(req.file);
    }

    const event = new CmsEvent({
      title,
      slug,
      description,
      location: location || '',
      category: category || 'General',
      isPublished: isPublished !== 'false' && isPublished !== false,
      isFeatured: isFeatured === 'true' || isFeatured === true,
      createdBy: req.user._id,
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
      ...(image && { image }),
    });

    await event.save();
    res.status(201).json({ success: true, message: 'Event created', data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create event', error: error.message });
  }
};

/** PUT /api/v1/editor/cms-events/:id */
exports.updateCmsEvent = async (req, res) => {
  try {
    const event = await CmsEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    const { title, description, location, startDate, endDate, category, isPublished, isFeatured } = req.body;

    if (title !== undefined) event.title = title;
    if (description !== undefined) event.description = description;
    if (location !== undefined) event.location = location;
    if (category !== undefined) event.category = category;
    if (isPublished !== undefined) event.isPublished = isPublished !== 'false' && isPublished !== false;
    if (isFeatured !== undefined) event.isFeatured = isFeatured === 'true' || isFeatured === true;
    if (startDate !== undefined) event.startDate = startDate ? new Date(startDate) : undefined;
    if (endDate !== undefined) event.endDate = endDate ? new Date(endDate) : undefined;

    if (req.file) {
      event.image = await uploadToCloudinary(req.file);
    }

    await event.save();
    res.json({ success: true, message: 'Event updated', data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update event', error: error.message });
  }
};

/** DELETE /api/v1/editor/cms-events/:id */
exports.deleteCmsEvent = async (req, res) => {
  try {
    const event = await CmsEvent.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete event', error: error.message });
  }
};
