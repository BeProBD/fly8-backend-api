/**
 * Public University Routes
 * No authentication required
 */

const express = require('express');
const router = express.Router();
const {
  getAllUniversities,
  getUniversityById,
  getUniversityByCode,
  getUniversitiesByCountry,
  getUniversityStats,
} = require('../../controllers/public/universityController');

// GET /api/v1/public/universities - Get all universities
router.get('/', getAllUniversities);

// GET /api/v1/public/universities/stats - Get university statistics
router.get('/stats', getUniversityStats);

// GET /api/v1/public/universities/country/:country - Get universities by country
router.get('/country/:country', getUniversitiesByCountry);

// GET /api/v1/public/universities/code/:universitycode - Get university by code
router.get('/code/:universitycode', getUniversityByCode);

// GET /api/v1/public/universities/:id - Get university by ID
router.get('/:id', getUniversityById);

module.exports = router;
