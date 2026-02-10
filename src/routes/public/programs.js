/**
 * Public Program Routes
 * No authentication required
 */

const express = require('express');
const router = express.Router();
const {
  getAllPrograms,
  getProgramById,
  getProgramsByCountry,
  getProgramsByUniversity,
  getProgramsByLevel,
  getProgramStats,
} = require('../../controllers/public/programController');

// GET /api/v1/public/programs - Get all programs
router.get('/', getAllPrograms);

// GET /api/v1/public/programs/stats - Get program statistics
router.get('/stats', getProgramStats);

// GET /api/v1/public/programs/country/:country - Get programs by country
router.get('/country/:country', getProgramsByCountry);

// GET /api/v1/public/programs/university/:universityName - Get programs by university
router.get('/university/:universityName', getProgramsByUniversity);

// GET /api/v1/public/programs/level/:level - Get programs by level
router.get('/level/:level', getProgramsByLevel);

// GET /api/v1/public/programs/:id - Get program by ID
router.get('/:id', getProgramById);

module.exports = router;
