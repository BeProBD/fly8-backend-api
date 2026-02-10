/**
 * Public Event Routes
 * Handles German Course and GSTU registrations
 * No authentication required
 */

const express = require('express');
const router = express.Router();
const {
  // German Course
  registerGermanCourse,
  getGermanCourseRegistration,
  checkGermanCourseEmail,
  // GSTU
  registerGstu,
  getGstuRegistration,
  checkGstuExisting,
} = require('../../controllers/public/eventController');

// =============================================================================
// GERMAN COURSE ROUTES
// =============================================================================

// POST /api/v1/public/events/german-course/register
router.post('/german-course/register', registerGermanCourse);

// POST /api/v1/public/events/german-course/check-email
router.post('/german-course/check-email', checkGermanCourseEmail);

// GET /api/v1/public/events/german-course/:registrationNumber
router.get('/german-course/:registrationNumber', getGermanCourseRegistration);

// Legacy routes support (for /api/v1/german-course/*)
router.post('/register', registerGermanCourse);
router.post('/check-email', checkGermanCourseEmail);
router.get('/registration/:registrationNumber', getGermanCourseRegistration);

// =============================================================================
// GSTU ROUTES
// =============================================================================

// POST /api/v1/public/events/gstu/register
router.post('/gstu/register', registerGstu);

// POST /api/v1/public/events/gstu/check-existing
router.post('/gstu/check-existing', checkGstuExisting);

// GET /api/v1/public/events/gstu/:registrationNumber
router.get('/gstu/:registrationNumber', getGstuRegistration);

// Legacy routes support (for /api/v1/gstu/*)
router.post('/register', registerGstu);
router.post('/check-existing', checkGstuExisting);
router.get('/register/:registrationNumber', getGstuRegistration);

module.exports = router;
