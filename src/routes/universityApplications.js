/**
 * University Application Routes
 *
 * Dedicated endpoints for the Apply-University workflow.
 * The underlying ServiceRequest continues to be managed via the existing
 * /api/v1/service-requests routes (assignment, notes, status updates), so
 * admin/counselor flows remain unchanged.
 */

const express = require('express');
const router = express.Router();
const {
  authMiddleware,
  roleMiddleware,
} = require('../middlewares/auth');
const {
  enforceStudentInteractionMode,
  enforceInteractionMode,
} = require('../middlewares/interactionMode');
const {
  createUniversityApplication,
  getUniversityApplications,
  getUniversityApplicationById,
  uploadApplicationDocument,
  updateStage,
  updateApplicationStatus,
} = require('../controllers/universityApplicationController');

/**
 * @route   POST /api/v1/university-applications
 * @desc    Create a new University Application (also creates ServiceRequest)
 * @access  Student only (blocked if interactionMode is rep-counselor)
 */
router.post(
  '/',
  authMiddleware,
  roleMiddleware('student'),
  enforceStudentInteractionMode,
  createUniversityApplication,
);

/**
 * @route   GET /api/v1/university-applications
 * @desc    List University Applications (role-filtered)
 * @access  Authenticated
 */
router.get(
  '/',
  authMiddleware,
  enforceStudentInteractionMode,
  getUniversityApplications,
);

/**
 * @route   GET /api/v1/university-applications/:applicationId
 * @desc    Get a single University Application by ID
 * @access  Authenticated (ownership/role enforced in controller)
 */
router.get(
  '/:applicationId',
  authMiddleware,
  enforceInteractionMode,
  getUniversityApplicationById,
);

/**
 * @route   POST /api/v1/university-applications/:applicationId/documents
 * @desc    Upload a document to a University Application
 * @access  Authenticated (ownership/role enforced in controller)
 */
router.post(
  '/:applicationId/documents',
  authMiddleware,
  enforceInteractionMode,
  uploadApplicationDocument,
);

/**
 * @route   PATCH /api/v1/university-applications/:applicationId/stages/:stageKey
 * @desc    Update a single stage (status, notes) — counselor/agent/admin only
 */
router.patch(
  '/:applicationId/stages/:stageKey',
  authMiddleware,
  roleMiddleware('counselor', 'agent', 'super_admin'),
  updateStage,
);

/**
 * @route   PATCH /api/v1/university-applications/:applicationId/status
 * @desc    Update overall application/document status — counselor/agent/admin
 */
router.patch(
  '/:applicationId/status',
  authMiddleware,
  roleMiddleware('counselor', 'agent', 'super_admin'),
  updateApplicationStatus,
);

module.exports = router;
