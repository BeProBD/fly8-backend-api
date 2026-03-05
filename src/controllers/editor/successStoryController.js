/**
 * Editor Success Story Controller
 * Full CRUD for student success stories
 */

const SuccessStory = require('../../models/SuccessStory');
const { cloudinary } = require('../../config/cloudinary');

const uploadToCloudinary = async file => {
  const base64Image = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(base64Image, {
    resource_type: 'image',
    folder: 'fly8-success-stories',
    timeout: 120000,
  });
  return result.secure_url;
};

/** GET /api/v1/editor/success-stories */
exports.getSuccessStories = async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const stories = await SuccessStory.find()
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'firstName lastName');

    const total = await SuccessStory.countDocuments();

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

/** GET /api/v1/editor/success-stories/:id */
exports.getSuccessStory = async (req, res) => {
  try {
    const story = await SuccessStory.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: 'Success story not found' });
    res.json({ success: true, data: story });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch success story', error: error.message });
  }
};

/** POST /api/v1/editor/success-stories */
exports.createSuccessStory = async (req, res) => {
  try {
    const { studentName, country, university, program, quote, year, flag, isPublished, order } = req.body;

    if (!studentName || !country || !university || !program || !quote) {
      return res.status(400).json({ success: false, message: 'studentName, country, university, program, and quote are required' });
    }

    let avatar;
    if (req.file) {
      avatar = await uploadToCloudinary(req.file);
    }

    const story = new SuccessStory({
      studentName,
      country,
      university,
      program,
      quote,
      year: year || '',
      flag: flag || '',
      isPublished: isPublished !== 'false' && isPublished !== false,
      order: parseInt(order) || 0,
      createdBy: req.user._id,
      ...(avatar && { avatar }),
    });

    await story.save();
    res.status(201).json({ success: true, message: 'Success story created', data: story });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create success story', error: error.message });
  }
};

/** PUT /api/v1/editor/success-stories/:id */
exports.updateSuccessStory = async (req, res) => {
  try {
    const story = await SuccessStory.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: 'Success story not found' });

    const { studentName, country, university, program, quote, year, flag, isPublished, order } = req.body;

    if (studentName !== undefined) story.studentName = studentName;
    if (country !== undefined) story.country = country;
    if (university !== undefined) story.university = university;
    if (program !== undefined) story.program = program;
    if (quote !== undefined) story.quote = quote;
    if (year !== undefined) story.year = year;
    if (flag !== undefined) story.flag = flag;
    if (isPublished !== undefined) story.isPublished = isPublished !== 'false' && isPublished !== false;
    if (order !== undefined) story.order = parseInt(order) || 0;

    if (req.file) {
      story.avatar = await uploadToCloudinary(req.file);
    }

    await story.save();
    res.json({ success: true, message: 'Success story updated', data: story });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update success story', error: error.message });
  }
};

/** DELETE /api/v1/editor/success-stories/:id */
exports.deleteSuccessStory = async (req, res) => {
  try {
    const story = await SuccessStory.findByIdAndDelete(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: 'Success story not found' });
    res.json({ success: true, message: 'Success story deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete success story', error: error.message });
  }
};
