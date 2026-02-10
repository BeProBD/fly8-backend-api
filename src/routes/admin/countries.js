/**
 * Admin Country Routes
 * Requires authentication and super_admin role
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../../middlewares/auth');
const {
  createCountry,
  updateCountry,
  deleteCountry,
} = require('../../controllers/admin/countryController');

// All routes require authentication and super_admin role
router.use(authMiddleware);
router.use(roleMiddleware('super_admin'));

// POST /api/v1/admin/countries - Create country
router.post('/', createCountry);

// PUT /api/v1/admin/countries/:code - Update country
router.put('/:code', updateCountry);

// DELETE /api/v1/admin/countries/:code - Delete country
router.delete('/:code', deleteCountry);

module.exports = router;
