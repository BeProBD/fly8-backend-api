const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const University = require('../models/University');

// Get all universities (dashboard view - legacy compatible)
router.get('/', async (req, res) => {
  try {
    const { country, isActive, featured, limit, page } = req.query;
    const filter = {};

    // Default to active universities
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    } else {
      filter.isActive = true;
    }

    if (country) {
      filter.country = country;
    }

    if (featured === 'true') {
      filter.featured = true;
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [universities, total] = await Promise.all([
      University.find(filter)
        .sort({ ranking: 1, universityname: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      University.countDocuments(filter)
    ]);

    // Map to include legacy field names for backward compatibility
    const mappedUniversities = universities.map(uni => ({
      ...uni,
      // Legacy field mappings (dashboard frontend may use these)
      universityId: uni.universitycode || uni.universityId,
      name: uni.universityname || uni.name,
      city: uni.location?.city || uni.city,
      logo: uni.logoUrl || uni.logo
    }));

    res.json({
      universities: mappedUniversities,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching universities:', error);
    res.status(500).json({ error: 'Failed to fetch universities' });
  }
});

// Get single university by ID or code
router.get('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;

    // Try to find by universitycode first, then by universityId (legacy), then by MongoDB _id
    let university = await University.findOne({ universitycode: identifier });

    if (!university) {
      university = await University.findOne({ universityId: identifier });
    }

    if (!university && identifier.match(/^[0-9a-fA-F]{24}$/)) {
      university = await University.findById(identifier);
    }

    if (!university) {
      return res.status(404).json({ error: 'University not found' });
    }

    // Add legacy field mappings
    const response = university.toObject();
    response.universityId = response.universitycode || response.universityId;
    response.name = response.universityname || response.name;
    response.city = response.location?.city || response.city;
    response.logo = response.logoUrl || response.logo;

    res.json({ university: response });
  } catch (error) {
    console.error('Error fetching university:', error);
    res.status(500).json({ error: 'Failed to fetch university' });
  }
});

// Create university (admin only)
router.post('/', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const data = { ...req.body };

    // Generate universitycode if not provided
    if (!data.universitycode) {
      // Generate from university name or use UUID
      if (data.universityname) {
        data.universitycode = data.universityname
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50);
      } else if (data.name) {
        // Legacy field support
        data.universityname = data.name;
        data.universitycode = data.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50);
      } else {
        data.universitycode = uuidv4();
      }
    }

    // Also set legacy universityId for backward compatibility
    data.universityId = data.universitycode;

    const university = new University(data);
    await university.save();

    res.status(201).json({ message: 'University created', university });
  } catch (error) {
    console.error('Error creating university:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'University with this code already exists' });
    }
    res.status(500).json({ error: 'Failed to create university' });
  }
});

// Update university (admin only)
router.put('/:identifier', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { identifier } = req.params;

    // Find university by code, universityId, or MongoDB _id
    let university = await University.findOne({ universitycode: identifier });

    if (!university) {
      university = await University.findOne({ universityId: identifier });
    }

    if (!university && identifier.match(/^[0-9a-fA-F]{24}$/)) {
      university = await University.findById(identifier);
    }

    if (!university) {
      return res.status(404).json({ error: 'University not found' });
    }

    // Update fields
    Object.assign(university, req.body);
    await university.save();

    res.json({ message: 'University updated', university });
  } catch (error) {
    console.error('Error updating university:', error);
    res.status(500).json({ error: 'Failed to update university' });
  }
});

// Delete university (admin only)
router.delete('/:identifier', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { identifier } = req.params;

    // Find university by code, universityId, or MongoDB _id
    let university = await University.findOneAndDelete({ universitycode: identifier });

    if (!university) {
      university = await University.findOneAndDelete({ universityId: identifier });
    }

    if (!university && identifier.match(/^[0-9a-fA-F]{24}$/)) {
      university = await University.findByIdAndDelete(identifier);
    }

    if (!university) {
      return res.status(404).json({ error: 'University not found' });
    }

    res.json({ message: 'University deleted' });
  } catch (error) {
    console.error('Error deleting university:', error);
    res.status(500).json({ error: 'Failed to delete university' });
  }
});

module.exports = router;