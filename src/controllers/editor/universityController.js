/**
 * Editor University Controller
 *
 * Editors manage universities (create, update, delete) and browse them
 * as the first step in a University → Programs drill-down workflow.
 */

const University = require('../../models/University');
const Program    = require('../../models/Program');

// ── GET /api/v1/editor/universities ─────────────────────────────────────────
exports.getUniversities = async (req, res) => {
  try {
    const { search, limit = 200, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (search) {
      filter.$or = [
        { universityName: { $regex: search, $options: 'i' } },
        { universitycode: { $regex: search, $options: 'i' } },
        { country: { $regex: search, $options: 'i' } },
      ];
    }

    const [universities, total] = await Promise.all([
      University.find(filter)
        .select('universityName universitycode country location city website imageUrl createdAt')
        .sort({ universityName: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      University.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: universities,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch universities', error: error.message });
  }
};

// ── POST /api/v1/editor/universities ────────────────────────────────────────
exports.createUniversity = async (req, res) => {
  try {
    const { universityName, country, location, website } = req.body;

    if (!universityName || !country) {
      return res.status(400).json({ success: false, message: 'universityName and country are required' });
    }

    // Auto-generate universitycode: <NAME8>_<CTRY3>_<TIMESTAMP4>
    const namePart    = universityName.replace(/[^A-Za-z0-9]/g, '').substring(0, 8).toUpperCase();
    const countryPart = country.replace(/[^A-Za-z0-9]/g, '').substring(0, 3).toUpperCase();
    const timePart    = Date.now().toString().slice(-4);
    const universitycode = `${namePart}_${countryPart}_${timePart}`;

    const university = new University({
      universityName,
      universitycode,
      country,
      location: location || '',
      website:  website  || '',
    });

    await university.save();

    res.status(201).json({
      success: true,
      message: 'University created successfully',
      data: university,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A university with this code already exists. Please try again.' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Failed to create university', error: error.message });
  }
};

// ── PUT /api/v1/editor/universities/:id ─────────────────────────────────────
exports.updateUniversity = async (req, res) => {
  try {
    const { universityName, country, location, website } = req.body;

    if (!universityName || !country) {
      return res.status(400).json({ success: false, message: 'universityName and country are required' });
    }

    const university = await University.findByIdAndUpdate(
      req.params.id,
      { universityName, country, location: location || '', website: website || '' },
      { new: true, runValidators: true }
    ).select('universityName universitycode country location city website imageUrl');

    if (!university) {
      return res.status(404).json({ success: false, message: 'University not found' });
    }

    // Keep denormalised strings on linked programs in sync
    await Program.updateMany(
      { universityId: university._id },
      { universityName: university.universityName, country: university.country }
    );

    res.json({ success: true, message: 'University updated successfully', data: university });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Failed to update university', error: error.message });
  }
};

// ── DELETE /api/v1/editor/universities/:id ───────────────────────────────────
// Cascade-deletes all programs that belong to this university.
exports.deleteUniversity = async (req, res) => {
  try {
    const university = await University.findById(req.params.id);
    if (!university) {
      return res.status(404).json({ success: false, message: 'University not found' });
    }

    // Cascade: remove all programs linked to this university
    const { deletedCount } = await Program.deleteMany({ universityId: university._id });

    await university.deleteOne();

    res.json({
      success: true,
      message: `University deleted along with ${deletedCount} associated program(s)`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete university', error: error.message });
  }
};
