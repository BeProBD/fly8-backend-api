/**
 * Admin Program Controller
 * CRUD operations for programs (super_admin only)
 */

const Program = require('../../models/Program');

/**
 * Create program
 * POST /api/v1/admin/programs
 */
exports.createProgram = async (req, res) => {
  try {
    const {
      country,
      universityName,
      location,
      programName,
      majors,
      programLevel,
      duration,
      intake,
    } = req.body;

    if (!country || !universityName || !location || !programName || !majors || !programLevel || !duration || !intake) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided',
      });
    }

    const program = new Program(req.body);
    await program.save();

    return res.status(201).json({
      success: true,
      message: 'Program created successfully',
      data: program,
    });
  } catch (error) {
    console.error('Error creating program:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create program',
      error: error.message,
    });
  }
};

/**
 * Update program
 * PUT /api/v1/admin/programs/:id
 */
exports.updateProgram = async (req, res) => {
  try {
    const { id } = req.params;

    const program = await Program.findById(id);
    if (!program) {
      return res.status(404).json({
        success: false,
        message: `Program not found with id: ${id}`,
      });
    }

    const updatedProgram = await Program.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({
      success: true,
      message: 'Program updated successfully',
      data: updatedProgram,
    });
  } catch (error) {
    console.error('Error updating program:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update program',
      error: error.message,
    });
  }
};

/**
 * Delete program
 * DELETE /api/v1/admin/programs/:id
 */
exports.deleteProgram = async (req, res) => {
  try {
    const { id } = req.params;

    const program = await Program.findById(id);
    if (!program) {
      return res.status(404).json({
        success: false,
        message: `Program not found with id: ${id}`,
      });
    }

    await Program.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Program deleted successfully',
      data: program,
    });
  } catch (error) {
    console.error('Error deleting program:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete program',
      error: error.message,
    });
  }
};
