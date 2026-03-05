/**
 * Editor Offer Controller
 */

const Offer = require('../../models/Offer');
const { cloudinary } = require('../../config/cloudinary');

const uploadToCloudinary = async file => {
  const base64Image = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(base64Image, {
    resource_type: 'image',
    folder: 'fly8-offers',
    timeout: 120000,
  });
  return result.secure_url;
};

/** GET /api/v1/editor/offers */
exports.getOffers = async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const offers = await Offer.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'firstName lastName');

    const total = await Offer.countDocuments();
    res.json({
      success: true,
      data: offers,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch offers', error: error.message });
  }
};

/** POST /api/v1/editor/offers */
exports.createOffer = async (req, res) => {
  try {
    const { title, description, country, isActive } = req.body;
    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required' });
    }

    let bannerImage;
    if (req.file) {
      bannerImage = await uploadToCloudinary(req.file);
    }

    const offer = new Offer({
      title,
      description,
      country: country || '',
      isActive: isActive !== 'false' && isActive !== false,
      createdBy: req.user._id,
      ...(bannerImage && { bannerImage }),
    });

    await offer.save();
    res.status(201).json({ success: true, message: 'Offer created successfully', data: offer });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create offer', error: error.message });
  }
};

/** PUT /api/v1/editor/offers/:id */
exports.updateOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });

    const { title, description, country, isActive } = req.body;
    if (title) offer.title = title;
    if (description) offer.description = description;
    if (country !== undefined) offer.country = country;
    if (isActive !== undefined) offer.isActive = isActive !== 'false' && isActive !== false;

    if (req.file) {
      offer.bannerImage = await uploadToCloudinary(req.file);
    }

    await offer.save();
    res.json({ success: true, message: 'Offer updated successfully', data: offer });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update offer', error: error.message });
  }
};

/** DELETE /api/v1/editor/offers/:id */
exports.deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findByIdAndDelete(req.params.id);
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
    res.json({ success: true, message: 'Offer deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete offer', error: error.message });
  }
};
