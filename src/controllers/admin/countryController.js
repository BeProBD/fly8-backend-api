/**
 * Admin Country Controller
 * CRUD operations for countries (super_admin only)
 */

const Country = require('../../models/Country');

/**
 * Create country
 * POST /api/v1/admin/countries
 */
exports.createCountry = async (req, res) => {
  try {
    const { code, name } = req.body;

    if (!code || !name) {
      return res.status(400).json({
        success: false,
        message: 'Code and name are required',
      });
    }

    const existingCountry = await Country.findOne({ code: code.toUpperCase() });
    if (existingCountry) {
      return res.status(400).json({
        success: false,
        message: `Country with code '${code}' already exists`,
      });
    }

    const country = new Country({
      ...req.body,
      code: code.toUpperCase(),
    });
    await country.save();

    return res.status(201).json({
      success: true,
      message: 'Country created successfully',
      data: country,
    });
  } catch (error) {
    console.error('Error creating country:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create country',
      error: error.message,
    });
  }
};

/**
 * Update country
 * PUT /api/v1/admin/countries/:code
 */
exports.updateCountry = async (req, res) => {
  try {
    const { code } = req.params;

    const country = await Country.findOne({ code: code.toUpperCase() });
    if (!country) {
      return res.status(404).json({
        success: false,
        message: `Country not found with code: ${code}`,
      });
    }

    const updatedCountry = await Country.findOneAndUpdate(
      { code: code.toUpperCase() },
      req.body,
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Country updated successfully',
      data: updatedCountry,
    });
  } catch (error) {
    console.error('Error updating country:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update country',
      error: error.message,
    });
  }
};

/**
 * Delete country
 * DELETE /api/v1/admin/countries/:code
 */
exports.deleteCountry = async (req, res) => {
  try {
    const { code } = req.params;

    const country = await Country.findOne({ code: code.toUpperCase() });
    if (!country) {
      return res.status(404).json({
        success: false,
        message: `Country not found with code: ${code}`,
      });
    }

    await Country.findOneAndDelete({ code: code.toUpperCase() });

    return res.status(200).json({
      success: true,
      message: 'Country deleted successfully',
      data: country,
    });
  } catch (error) {
    console.error('Error deleting country:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete country',
      error: error.message,
    });
  }
};
