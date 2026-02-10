/**
 * Admin University Controller
 * CRUD operations for universities (super_admin only)
 */

const University = require('../../models/University');

/**
 * Create university
 * POST /api/v1/admin/universities
 */
exports.createUniversity = async (req, res) => {
  try {
    const { universitycode, universityName, country } = req.body;

    if (!universitycode || !universityName || !country) {
      return res.status(400).json({
        success: false,
        message: 'universitycode, universityName, and country are required fields',
      });
    }

    const existingUniversity = await University.findOne({ universitycode });
    if (existingUniversity) {
      return res.status(400).json({
        success: false,
        message: `University with code '${universitycode}' already exists`,
      });
    }

    const university = new University(req.body);
    await university.save();

    return res.status(201).json({
      success: true,
      message: 'University created successfully',
      data: university,
    });
  } catch (error) {
    console.error('Error creating university:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create university',
      error: error.message,
    });
  }
};

/**
 * Update university by ID
 * PUT /api/v1/admin/universities/:id
 */
exports.updateUniversity = async (req, res) => {
  try {
    const { id } = req.params;

    const university = await University.findById(id);
    if (!university) {
      return res.status(404).json({
        success: false,
        message: `University not found with id: ${id}`,
      });
    }

    if (req.body.universitycode && req.body.universitycode !== university.universitycode) {
      const existingUniversity = await University.findOne({
        universitycode: req.body.universitycode,
      });
      if (existingUniversity) {
        return res.status(400).json({
          success: false,
          message: `University with code '${req.body.universitycode}' already exists`,
        });
      }
    }

    const updatedUniversity = await University.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({
      success: true,
      message: 'University updated successfully',
      data: updatedUniversity,
    });
  } catch (error) {
    console.error('Error updating university:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update university',
      error: error.message,
    });
  }
};

/**
 * Update university by code
 * PUT /api/v1/admin/universities/code/:universitycode
 */
exports.updateUniversityByCode = async (req, res) => {
  try {
    const { universitycode } = req.params;

    const university = await University.findOne({ universitycode });
    if (!university) {
      return res.status(404).json({
        success: false,
        message: `University not found with code: ${universitycode}`,
      });
    }

    const updatedUniversity = await University.findOneAndUpdate(
      { universitycode },
      req.body,
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'University updated successfully',
      data: updatedUniversity,
    });
  } catch (error) {
    console.error('Error updating university:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update university',
      error: error.message,
    });
  }
};

/**
 * Delete university by ID
 * DELETE /api/v1/admin/universities/:id
 */
exports.deleteUniversity = async (req, res) => {
  try {
    const { id } = req.params;

    const university = await University.findById(id);
    if (!university) {
      return res.status(404).json({
        success: false,
        message: `University not found with id: ${id}`,
      });
    }

    await University.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'University deleted successfully',
      data: university,
    });
  } catch (error) {
    console.error('Error deleting university:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete university',
      error: error.message,
    });
  }
};

/**
 * Delete university by code
 * DELETE /api/v1/admin/universities/code/:universitycode
 */
exports.deleteUniversityByCode = async (req, res) => {
  try {
    const { universitycode } = req.params;

    const university = await University.findOne({ universitycode });
    if (!university) {
      return res.status(404).json({
        success: false,
        message: `University not found with code: ${universitycode}`,
      });
    }

    await University.findOneAndDelete({ universitycode });

    return res.status(200).json({
      success: true,
      message: 'University deleted successfully',
      data: university,
    });
  } catch (error) {
    console.error('Error deleting university:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete university',
      error: error.message,
    });
  }
};
