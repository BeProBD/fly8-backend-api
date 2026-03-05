/**
 * Editor Program Controller
 */

const Program = require('../../models/Program');

/** GET /api/v1/editor/programs */
exports.getPrograms = async (req, res) => {
  try {
    const { limit = 20, page = 1, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (search) filter.$text = { $search: search };

    const programs = await Program.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Program.countDocuments(filter);

    res.json({
      success: true,
      data: programs,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch programs', error: error.message });
  }
};

/** POST /api/v1/editor/programs */
exports.createProgram = async (req, res) => {
  try {
    const required = ['country', 'universityName', 'location', 'programName', 'majors', 'programLevel', 'duration', 'intake'];
    for (const field of required) {
      if (!req.body[field]) {
        return res.status(400).json({ success: false, message: `${field} is required` });
      }
    }

    const program = new Program(req.body);
    await program.save();
    res.status(201).json({ success: true, message: 'Program created successfully', data: program });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Failed to create program', error: error.message });
  }
};

/** PUT /api/v1/editor/programs/:id */
exports.updateProgram = async (req, res) => {
  try {
    const program = await Program.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!program) return res.status(404).json({ success: false, message: 'Program not found' });
    res.json({ success: true, message: 'Program updated successfully', data: program });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update program', error: error.message });
  }
};

/** DELETE /api/v1/editor/programs/:id */
exports.deleteProgram = async (req, res) => {
  try {
    const program = await Program.findByIdAndDelete(req.params.id);
    if (!program) return res.status(404).json({ success: false, message: 'Program not found' });
    res.json({ success: true, message: 'Program deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete program', error: error.message });
  }
};
