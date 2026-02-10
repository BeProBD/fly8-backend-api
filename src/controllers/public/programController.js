/**
 * Public Program Controller
 * Handles public/marketing endpoints for programs (no authentication required)
 */

const Program = require('../../models/Program');

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
};

/**
 * Get all programs with filters and pagination
 * GET /api/v1/public/programs
 */
exports.getAllPrograms = async (req, res) => {
  try {
    const {
      country,
      universityName,
      programLevel,
      majors,
      search,
      limit,
      page,
    } = req.query;

    // Build filter object
    const filter = { isActive: { $ne: false } };

    if (country) {
      filter.country = { $regex: new RegExp(country, 'i') };
    }
    if (universityName) {
      filter.universityName = { $regex: new RegExp(universityName, 'i') };
    }
    if (programLevel) {
      filter.programLevel = programLevel;
    }
    if (majors) {
      filter.majors = { $regex: new RegExp(majors, 'i') };
    }
    if (search) {
      filter.$or = [
        { programName: { $regex: search, $options: 'i' } },
        { majors: { $regex: search, $options: 'i' } },
        { universityName: { $regex: search, $options: 'i' } },
        { country: { $regex: search, $options: 'i' } },
      ];
    }

    // Pagination
    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const programs = await Program.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    const total = await Program.countDocuments(filter);

    return res.status(200).json({
      success: true,
      message: 'Programs retrieved successfully',
      data: programs,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error('Error fetching programs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch programs',
      error: error.message,
    });
  }
};

/**
 * Get single program by ID
 * GET /api/v1/public/programs/:id
 */
exports.getProgramById = async (req, res) => {
  try {
    const { id } = req.params;

    const program = await Program.findById(id);

    if (!program) {
      return res.status(404).json({
        success: false,
        message: `Program not found with id: ${id}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: program,
    });
  } catch (error) {
    console.error('Error fetching program:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch program',
      error: error.message,
    });
  }
};

/**
 * Get programs by country
 * GET /api/v1/public/programs/country/:country
 */
exports.getProgramsByCountry = async (req, res) => {
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

    let programs = await Program.find({
      country: { $regex: new RegExp(regexPattern, 'i') },
      isActive: { $ne: false },
    }).sort({ programName: 1 });

    // Fallback to partial match
    if (programs.length === 0) {
      programs = await Program.find({
        country: { $regex: new RegExp(country, 'i') },
        isActive: { $ne: false },
      }).sort({ programName: 1 });
    }

    return res.status(200).json({
      success: true,
      message: `Found ${programs.length} programs in ${country}`,
      data: programs,
      count: programs.length,
    });
  } catch (error) {
    console.error('Error fetching programs by country:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch programs',
      error: error.message,
    });
  }
};

/**
 * Get programs by university
 * GET /api/v1/public/programs/university/:universityName
 */
exports.getProgramsByUniversity = async (req, res) => {
  try {
    const { universityName } = req.params;

    const programs = await Program.find({
      universityName: { $regex: new RegExp(universityName, 'i') },
      isActive: { $ne: false },
    }).sort({ programLevel: 1, programName: 1 });

    return res.status(200).json({
      success: true,
      message: `Found ${programs.length} programs for ${universityName}`,
      data: programs,
      count: programs.length,
    });
  } catch (error) {
    console.error('Error fetching programs by university:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch programs',
      error: error.message,
    });
  }
};

/**
 * Get programs by level
 * GET /api/v1/public/programs/level/:level
 */
exports.getProgramsByLevel = async (req, res) => {
  try {
    const { level } = req.params;

    const programs = await Program.find({
      programLevel: level,
      isActive: { $ne: false },
    }).sort({ universityName: 1, programName: 1 });

    return res.status(200).json({
      success: true,
      message: `Found ${programs.length} ${level} programs`,
      data: programs,
      count: programs.length,
    });
  } catch (error) {
    console.error('Error fetching programs by level:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch programs',
      error: error.message,
    });
  }
};

/**
 * Get program statistics
 * GET /api/v1/public/programs/stats
 */
exports.getProgramStats = async (req, res) => {
  try {
    const total = await Program.countDocuments({ isActive: { $ne: false } });

    const byCountry = await Program.aggregate([
      { $match: { isActive: { $ne: false } } },
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

    const byLevel = await Program.aggregate([
      { $match: { isActive: { $ne: false } } },
      {
        $group: {
          _id: '$programLevel',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    const byUniversity = await Program.aggregate([
      { $match: { isActive: { $ne: false } } },
      {
        $group: {
          _id: '$universityName',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 10,
      },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalPrograms: total,
        programsByCountry: byCountry,
        programsByLevel: byLevel,
        topUniversities: byUniversity,
      },
    });
  } catch (error) {
    console.error('Error fetching program statistics:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message,
    });
  }
};
