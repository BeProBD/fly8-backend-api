/**
 * Editor Program Controller
 *
 * Programs can be linked to a University via universityId.
 * When universityId is provided the controller auto-populates
 * universityName, country, universityCode and (if not overridden) location
 * from the referenced University document, ensuring data consistency.
 */

const Program = require('../../models/Program');
const University = require('../../models/University');

/** GET /api/v1/editor/programs */
exports.getPrograms = async (req, res) => {
  try {
    const { limit = 20, page = 1, search, universityId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (search)       filter.$text        = { $search: search };
    if (universityId) filter.universityId = universityId;

    const programs = await Program.find(filter)
      .populate('universityId', 'universityName universitycode country location city imageUrl')
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

/**
 * Resolves university fields from universityId when present.
 * Returns the enriched body or throws with an error response payload.
 */
async function resolveUniversityFields(body, res) {
  if (!body.universityId) return body;

  const university = await University.findById(body.universityId);
  if (!university) {
    res.status(404).json({ success: false, message: 'University not found. Please select a valid university.' });
    return null; // signals caller to abort
  }

  return {
    ...body,
    universityName: university.universityName,
    country: university.country,
    // Use program-supplied location first; fall back to university city/location
    location: body.location || university.location || university.city || '',
    universityCode: university.universitycode,
    universityWebsite: body.universityWebsite || university.website || '',
  };
}

/** POST /api/v1/editor/programs */
exports.createProgram = async (req, res) => {
  try {
    let body = { ...req.body };

    // Populate university fields from the referenced document
    body = await resolveUniversityFields(body, res);
    if (!body) return; // university not found – response already sent

    const required = ['country', 'universityName', 'location', 'programName', 'majors', 'programLevel', 'duration', 'intake'];
    for (const field of required) {
      if (!body[field]) {
        return res.status(400).json({ success: false, message: `${field} is required` });
      }
    }

    const program = new Program(body);
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
    let body = { ...req.body };

    // Re-sync university fields whenever universityId changes
    if (body.universityId) {
      body = await resolveUniversityFields(body, res);
      if (!body) return;
    }

    const program = await Program.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
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
