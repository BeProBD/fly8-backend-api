/**
 * Upload Routes
 * File upload endpoints with role-based access control
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const {
  uploadFile,
  uploadMultipleFiles,
  uploadTaskFiles,
  uploadServiceRequestDocument,
  deleteFile,
  getSignedUploadParams
} = require('../controllers/uploadController');

/**
 * @route   POST /api/upload/file
 * @desc    Upload single file
 * @access  Authenticated
 */
router.post('/file',
  authMiddleware,
  uploadFile
);

/**
 * @route   POST /api/upload/files
 * @desc    Upload multiple files
 * @access  Authenticated
 */
router.post('/files',
  authMiddleware,
  uploadMultipleFiles
);

/**
 * @route   POST /api/upload/task/:taskId
 * @desc    Upload files for task submission
 * @access  Student (assigned to task) or Super Admin
 */
router.post('/task/:taskId',
  authMiddleware,
  uploadTaskFiles
);

/**
 * @route   POST /api/upload/service-request/:serviceRequestId
 * @desc    Upload document for service request
 * @access  Authenticated (with ownership check)
 */
router.post('/service-request/:serviceRequestId',
  authMiddleware,
  uploadServiceRequestDocument
);

/**
 * @route   DELETE /api/upload/file
 * @desc    Delete uploaded file
 * @access  Super Admin only
 */
router.delete('/file',
  authMiddleware,
  roleMiddleware('super_admin'),
  deleteFile
);

/**
 * @route   GET /api/upload/signed-params
 * @desc    Get signed parameters for direct browser upload
 * @access  Authenticated
 */
router.get('/signed-params',
  authMiddleware,
  getSignedUploadParams
);

module.exports = router;
