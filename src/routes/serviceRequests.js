/**
 * Service Request Routes
 * Generic service lifecycle endpoints
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
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
 * @access  Student only
 */
router.post('/',
  authMiddleware,
  roleMiddleware('student'),
  createServiceRequest
);

/**
 * @route   GET /api/service-requests
 * @desc    Get all service requests (role-based filtering)
 * @access  Authenticated (All roles)
 */
router.get('/',
  authMiddleware,
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
 * @access  Authenticated (with ownership check)
 */
router.get('/:serviceRequestId',
  authMiddleware,
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
  updateServiceRequestStatus
);

/**
 * @route   POST /api/service-requests/:serviceRequestId/notes
 * @desc    Add note to service request
 * @access  Authenticated (with ownership check)
 */
router.post('/:serviceRequestId/notes',
  authMiddleware,
  addServiceRequestNote
);

module.exports = router;
