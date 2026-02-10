/**
 * Public University Controller
 * Handles public/marketing endpoints for universities (no authentication required)
 */

const University = require('../../models/University');

// Country name normalization mapping
const countryMappings = {
  'united states': ['usa', 'united states', 'us', 'unitedstates'],
  usa: ['usa', 'united states', 'us', 'unitedstates'],
  uk: ['uk', 'united kingdom', 'unitedkingdom'],
  'united kingdom': ['uk', 'united kingdom', 'unitedkingdom'],
  uae: ['uae', 'united arab emirates', 'unitedarabemirates'],
  'united arab emirates': ['uae', 'united arab emirates', 'unitedarabemirates'],
  'new zealand': ['new zealand', 'newzealand'],
  newzealand: ['new zealand', 'newzealand'],
  'south korea': ['south korea', 'southkorea', 'korea'],
  southkorea: ['south korea', 'southkorea', 'korea'],
  'czech republic': ['czech republic', 'czechrepublic', 'czech-republic'],
  czechrepublic: ['czech republic', 'czechrepublic', 'czech-republic'],
  'hong kong': ['hong kong', 'hongkong'],
  hongkong: ['hong kong', 'hongkong'],
};

/**
 * Get all universities with filters and pagination
 * GET /api/v1/public/universities
 */
exports.getAllUniversities = async (req, res) => {
  try {
    const { country, search, limit, page } = req.query;

    // Build filter object
    const filter = { isActive: true };

    if (country) {
      filter.country = { $regex: new RegExp(country, 'i') };
    }

    if (search) {
      filter.$or = [
        { universityName: { $regex: search, $options: 'i' } },
        { universitycode: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
      ];
    }

    // Pagination
    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const universities = await University.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    const total = await University.countDocuments(filter);

    return res.status(200).json({
      success: true,
      message: 'Universities retrieved successfully',
      data: universities,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error('Error fetching universities:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch universities',
      error: error.message,
    });
  }
};

/**
 * Get single university by ID
 * GET /api/v1/public/universities/:id
 */
exports.getUniversityById = async (req, res) => {
  try {
    const { id } = req.params;

    const university = await University.findById(id);

    if (!university) {
      return res.status(404).json({
        success: false,
        message: `University not found with id: ${id}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: university,
    });
  } catch (error) {
    console.error('Error fetching university:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch university',
      error: error.message,
    });
  }
};

/**
 * Get single university by code
 * GET /api/v1/public/universities/code/:universitycode
 */
exports.getUniversityByCode = async (req, res) => {
  try {
    const { universitycode } = req.params;

    const university = await University.findOne({ universitycode });

    if (!university) {
      return res.status(404).json({
        success: false,
        message: `University not found with code: ${universitycode}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: university,
    });
  } catch (error) {
    console.error('Error fetching university:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch university',
      error: error.message,
    });
  }
};

/**
 * Get universities by country
 * GET /api/v1/public/universities/country/:country
 */
exports.getUniversitiesByCountry = async (req, res) => {
  try {
    const { country } = req.params;

    const normalizedCountry = country.toLowerCase().trim();

    const countryVariations = [
      country,
      normalizedCountry,
      normalizedCountry.replace(/\s+/g, ''),
      normalizedCountry.replace(/\s+/g, '-'),
    ];

    const allVariations = countryMappings[normalizedCountry] || countryVariations;
    const regexPattern = allVariations
      .map(v => `^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
      .join('|');

    let universities = await University.find({
      country: { $regex: new RegExp(regexPattern, 'i') },
      isActive: true,
    }).sort({ universityName: 1 });

    // Fallback to partial match
    if (universities.length === 0) {
      universities = await University.find({
        country: { $regex: new RegExp(country, 'i') },
        isActive: true,
      }).sort({ universityName: 1 });
    }

    return res.status(200).json({
      success: true,
      message: `Found ${universities.length} universities in ${country}`,
      data: universities,
      count: universities.length,
    });
  } catch (error) {
    console.error('Error fetching universities by country:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch universities',
      error: error.message,
    });
  }
};

/**
 * Get university statistics
 * GET /api/v1/public/universities/stats
 */
exports.getUniversityStats = async (req, res) => {
  try {
    const total = await University.countDocuments({ isActive: true });

    const byCountry = await University.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$country',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalUniversities: total,
        universitiesByCountry: byCountry,
      },
    });
  } catch (error) {
    console.error('Error fetching university statistics:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message,
    });
  }
};
