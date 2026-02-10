/**
 * Public Country Routes
 * No authentication required
 */

const express = require('express');
const router = express.Router();
const {
  getAllCountries,
  getCountryDetails,
  getCountryByName,
} = require('../../controllers/public/countryController');

// GET /api/v1/public/countries - Get all countries
router.get('/', getAllCountries);

// GET /api/v1/country/getCountryDetails - Legacy support
router.get('/getCountryDetails', getCountryDetails);

// GET /api/v1/public/countries/name/:name - Get country by name
router.get('/name/:name', getCountryByName);

// GET /api/v1/public/countries/:code - Get country by code
router.get('/:code', getCountryDetails);

module.exports = router;
