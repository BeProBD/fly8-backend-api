/**
 * Public Country Controller
 * Handles public/marketing endpoints for countries (no authentication required)
 */

const Country = require('../../models/Country');

/**
 * Get all countries
 * GET /api/v1/public/countries
 */
exports.getAllCountries = async (req, res) => {
  try {
    const countries = await Country.find({ isActive: { $ne: false } })
      .select('code name flagUrl heroImage quickFacts')
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      message: 'Countries retrieved successfully',
      data: countries,
      count: countries.length,
    });
  } catch (error) {
    console.error('Error fetching countries:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch countries',
      error: error.message,
    });
  }
};

/**
 * Get country details by code
 * GET /api/v1/public/countries/:code
 * Also supports: GET /api/v1/country/getCountryDetails?countryname=:code (legacy)
 */
exports.getCountryDetails = async (req, res) => {
  try {
    // Support both param and query string (legacy support)
    const code = req.params.code || req.query.countryname;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Country code is required',
      });
    }

    const country = await Country.findOne({
      code: { $regex: new RegExp(`^${code}$`, 'i') },
    });

    if (!country) {
      return res.status(404).json({
        success: false,
        message: `Country not found with code: ${code}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: country,
    });
  } catch (error) {
    console.error('Error fetching country details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch country details',
      error: error.message,
    });
  }
};

/**
 * Get country by name
 * GET /api/v1/public/countries/name/:name
 */
exports.getCountryByName = async (req, res) => {
  try {
    const { name } = req.params;

    const country = await Country.findOne({
      name: { $regex: new RegExp(name, 'i') },
    });

    if (!country) {
      return res.status(404).json({
        success: false,
        message: `Country not found with name: ${name}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: country,
    });
  } catch (error) {
    console.error('Error fetching country:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch country',
      error: error.message,
    });
  }
};
