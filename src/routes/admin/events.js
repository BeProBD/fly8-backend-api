/**
 * Admin Event Routes
 * Manages registrations for German Course and GSTU
 * Requires authentication and super_admin role
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../../middlewares/auth');
const {
  // German Course
  getGermanCourseRegistrations,
  getGermanCourseStats,
  deleteGermanCourseRegistration,
  // GSTU
  getGstuRegistrations,
  getGstuStats,
  collectGstuTicket,
} = require('../../controllers/admin/eventController');

// All routes require authentication and super_admin role
router.use(authMiddleware);
router.use(roleMiddleware('super_admin'));

// =============================================================================
// GERMAN COURSE ROUTES
// =============================================================================

// GET /api/v1/admin/events/german-course - Get all registrations
router.get('/german-course', getGermanCourseRegistrations);

// GET /api/v1/admin/events/german-course/stats - Get statistics
router.get('/german-course/stats', getGermanCourseStats);
router.get('/german-course/statistics', getGermanCourseStats); // Legacy

// DELETE /api/v1/admin/events/german-course/:id - Delete registration
router.delete('/german-course/:id', deleteGermanCourseRegistration);

// Legacy routes (for /api/v1/german-course/*)
router.get('/registrations', getGermanCourseRegistrations);
router.get('/statistics', getGermanCourseStats);

// =============================================================================
// GSTU ROUTES
// =============================================================================

// GET /api/v1/admin/events/gstu - Get all registrations
router.get('/gstu', getGstuRegistrations);

// GET /api/v1/admin/events/gstu/stats - Get statistics
router.get('/gstu/stats', getGstuStats);
router.get('/gstu/statistics', getGstuStats); // Legacy

// PUT /api/v1/admin/events/gstu/:registrationNumber/ticket - Mark ticket collected
router.put('/gstu/:registrationNumber/ticket', collectGstuTicket);
router.put('/gstu/collect-ticket/:registrationNumber', collectGstuTicket); // Legacy

module.exports = router;
