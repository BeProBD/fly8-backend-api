/**
 * Service Request Routes
 * Generic service lifecycle endpoints
 *
 * SECURITY: 3-layer interactionMode enforcement for students:
 *   Layer 1 — Middleware: enforceStudentInteractionMode / enforceInteractionMode
 *   Layer 2 — Controller: explicit interactionMode checks inside handlers
 *   Layer 3 — Query: DB queries exclude rep-counselor records for students
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const {
  enforceStudentInteractionMode,
  enforceInteractionMode
} = require('../middlewares/interactionMode');
const { validate, serviceRequestSchemas } = require('../middlewares/validation');
const {
  createServiceRequest,
  getServiceRequests,
  getServiceRequestById,
  assignServiceRequest,
  updateServiceRequestStatus,
  addServiceRequestNote,
  getServiceRequestStats
} = require('../controllers/serviceRequestController');

/**
 * @route   POST /api/service-requests
 * @desc    Create a new service request
 * @access  Student only (blocked if student interactionMode is rep-counselor)
 */
router.post('/',
  authMiddleware,
  roleMiddleware('student'),
  enforceStudentInteractionMode,
  validate(serviceRequestSchemas.create),
  createServiceRequest
);

/**
 * @route   GET /api/service-requests
 * @desc    Get all service requests (role-based filtering)
 * @access  Authenticated (All roles — students filtered by interactionMode in controller)
 */
router.get('/',
  authMiddleware,
  enforceStudentInteractionMode,
  getServiceRequests
);

/**
 * @route   GET /api/service-requests/stats
 * @desc    Get service request statistics
 * @access  Super Admin only
 */
router.get('/stats',
  authMiddleware,
  roleMiddleware('super_admin'),
  getServiceRequestStats
);

/**
 * @route   GET /api/service-requests/:serviceRequestId
 * @desc    Get single service request by ID
 * @access  Authenticated (with ownership check + interactionMode enforcement)
 */
router.get('/:serviceRequestId',
  authMiddleware,
  enforceInteractionMode,
  getServiceRequestById
);

/**
 * @route   POST /api/service-requests/:serviceRequestId/assign
 * @desc    Assign counselor or agent to service request
 * @access  Super Admin only
 */
router.post('/:serviceRequestId/assign',
  authMiddleware,
  roleMiddleware('super_admin'),
  validate(serviceRequestSchemas.assign),
  assignServiceRequest
);

/**
 * @route   PATCH /api/service-requests/:serviceRequestId/status
 * @desc    Update service request status
 * @access  Super Admin, Assigned Counselor/Agent
 */
router.patch('/:serviceRequestId/status',
  authMiddleware,
  roleMiddleware('super_admin', 'counselor', 'agent'),
  validate(serviceRequestSchemas.updateStatus),
  updateServiceRequestStatus
);

/**
 * @route   POST /api/service-requests/:serviceRequestId/notes
 * @desc    Add note to service request
 * @access  Authenticated (with ownership check + interactionMode enforcement)
 *          Students in rep-counselor mode are fully blocked
 */
router.post('/:serviceRequestId/notes',
  authMiddleware,
  enforceInteractionMode,
  validate(serviceRequestSchemas.addNote),
  addServiceRequestNote
);

module.exports = router;
