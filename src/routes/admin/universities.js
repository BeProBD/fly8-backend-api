/**
 * Admin University Routes
 * Requires authentication and super_admin role
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../../middlewares/auth');
const {
  createUniversity,
  updateUniversity,
  updateUniversityByCode,
  deleteUniversity,
  deleteUniversityByCode,
} = require('../../controllers/admin/universityController');

// All routes require authentication and super_admin role
router.use(authMiddleware);
router.use(roleMiddleware('super_admin'));

// POST /api/v1/admin/universities - Create university
router.post('/', createUniversity);

// PUT /api/v1/admin/universities/:id - Update university by ID
router.put('/:id', updateUniversity);

// PUT /api/v1/admin/universities/code/:universitycode - Update by code
router.put('/code/:universitycode', updateUniversityByCode);

// DELETE /api/v1/admin/universities/:id - Delete university by ID
router.delete('/:id', deleteUniversity);

// DELETE /api/v1/admin/universities/code/:universitycode - Delete by code
router.delete('/code/:universitycode', deleteUniversityByCode);

module.exports = router;
