/**
 * Admin Program Routes
 * Requires authentication and super_admin role
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../../middlewares/auth');
const {
  createProgram,
  updateProgram,
  deleteProgram,
} = require('../../controllers/admin/programController');

// All routes require authentication and super_admin role
router.use(authMiddleware);
router.use(roleMiddleware('super_admin'));

// POST /api/v1/admin/programs - Create program
router.post('/', createProgram);

// PUT /api/v1/admin/programs/:id - Update program
router.put('/:id', updateProgram);

// DELETE /api/v1/admin/programs/:id - Delete program
router.delete('/:id', deleteProgram);

module.exports = router;
