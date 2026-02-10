/**
 * Admissions Routes
 * University application management endpoints for agent, student, and admin roles
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const {
  createByAgent,
  getAgentApplications,
  getAgentApplicationById,
  updateStatus,
  uploadDocument,
  addRemark,
  updateChecklist,
  getStudentApplications,
  getStudentApplicationById,
  acceptOffer,
  assignByAdmin,
  getAdminApplications,
  getAdminApplicationById
} = require('../controllers/applicationController');

// ============================================
// AGENT ROUTES
// ============================================

router.post(
  '/agent/create',
  authMiddleware,
  roleMiddleware('agent'),
  createByAgent
);

router.get(
  '/agent',
  authMiddleware,
  roleMiddleware('agent'),
  getAgentApplications
);

router.get(
  '/agent/:id',
  authMiddleware,
  roleMiddleware('agent'),
  getAgentApplicationById
);

router.patch(
  '/agent/:id/status',
  authMiddleware,
  roleMiddleware('agent'),
  updateStatus
);

router.post(
  '/agent/:id/upload-doc',
  authMiddleware,
  roleMiddleware('agent'),
  uploadDocument
);

router.post(
  '/agent/:id/remark',
  authMiddleware,
  roleMiddleware('agent'),
  addRemark
);

router.patch(
  '/agent/:id/checklist',
  authMiddleware,
  roleMiddleware('agent'),
  updateChecklist
);

// ============================================
// STUDENT ROUTES
// ============================================

router.get(
  '/student',
  authMiddleware,
  roleMiddleware('student'),
  getStudentApplications
);

router.get(
  '/student/:id',
  authMiddleware,
  roleMiddleware('student'),
  getStudentApplicationById
);

router.post(
  '/student/:id/upload-doc',
  authMiddleware,
  roleMiddleware('student'),
  uploadDocument
);

router.post(
  '/student/:id/accept-offer',
  authMiddleware,
  roleMiddleware('student'),
  acceptOffer
);

// ============================================
// ADMIN ROUTES
// ============================================

router.post(
  '/admin/assign',
  authMiddleware,
  roleMiddleware('super_admin'),
  assignByAdmin
);

router.get(
  '/admin',
  authMiddleware,
  roleMiddleware('super_admin'),
  getAdminApplications
);

router.get(
  '/admin/:id',
  authMiddleware,
  roleMiddleware('super_admin'),
  getAdminApplicationById
);

router.patch(
  '/admin/:id/status',
  authMiddleware,
  roleMiddleware('super_admin'),
  updateStatus
);

router.post(
  '/admin/:id/upload-doc',
  authMiddleware,
  roleMiddleware('super_admin'),
  uploadDocument
);

router.post(
  '/admin/:id/remark',
  authMiddleware,
  roleMiddleware('super_admin'),
  addRemark
);

router.patch(
  '/admin/:id/checklist',
  authMiddleware,
  roleMiddleware('super_admin'),
  updateChecklist
);

module.exports = router;
