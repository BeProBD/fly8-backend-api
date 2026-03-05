/**
 * Public Offer Controller
 */

const Offer = require('../../models/Offer');

/** GET /api/v1/public/offers */
exports.getPublicOffers = async (req, res) => {
  try {
    const { limit = 20, page = 1, country } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { isActive: true };
    if (country) filter.country = { $regex: new RegExp(`^${country}$`, 'i') };

    const offers = await Offer.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-createdBy');

    const total = await Offer.countDocuments(filter);
    res.json({
      success: true,
      data: offers,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch offers', error: error.message });
  }
};

/** GET /api/v1/public/offers/countries */
exports.getOfferCountries = async (req, res) => {
  try {
    const countries = await Offer.distinct('country', {
      isActive: true,
      country: { $exists: true, $ne: '' },
    });
    res.json({ success: true, data: countries.sort() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch countries', error: error.message });
  }
};

/** GET /api/v1/public/offers/:id */
exports.getOfferById = async (req, res) => {
  try {
    const offer = await Offer.findOne({ _id: req.params.id, isActive: true }).select('-createdBy');
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
    res.json({ success: true, data: offer });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch offer', error: error.message });
  }
};
