/**
 * Public Success Story Controller
 * Read-only access to published success stories
 */

const SuccessStory = require('../../models/SuccessStory');

/** GET /api/v1/public/success-stories */
exports.getSuccessStories = async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const stories = await SuccessStory.find({ isPublished: true })
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-createdBy -__v');

    const total = await SuccessStory.countDocuments({ isPublished: true });

    res.json({
      success: true,
      data: stories,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch success stories', error: error.message });
  }
};

/** GET /api/v1/public/success-stories/:id */
exports.getSuccessStory = async (req, res) => {
  try {
    const story = await SuccessStory.findOne({ _id: req.params.id, isPublished: true })
      .select('-createdBy -__v');
    if (!story) return res.status(404).json({ success: false, message: 'Success story not found' });
    res.json({ success: true, data: story });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch success story', error: error.message });
  }
};
