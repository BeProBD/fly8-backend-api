const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const Student = require('../models/Student');
const ServiceApplication = require('../models/ServiceApplication');
const ServiceRequest = require('../models/ServiceRequest');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { logAudit } = require('../utils/auditLogger');
const { emitToUser } = require('../socket/socketManager');

/**
 * @route   GET /api/counselors/dashboard
 * @desc    Get counselor dashboard data
 * @access  Counselor
 */
router.get('/dashboard', authMiddleware, roleMiddleware('counselor'), async (req, res) => {
  try {
    const counselorId = req.user.userId;

    // Get counts
    const assignedStudents = await Student.countDocuments({ assignedCounselor: counselorId });
    const activeRequests = await ServiceRequest.countDocuments({
      assignedCounselor: counselorId,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }
    });
    const pendingTasks = await Task.countDocuments({
      assignedBy: counselorId,
      status: { $in: ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'] }
    });
    const completedRequests = await ServiceRequest.countDocuments({
      assignedCounselor: counselorId,
      status: 'COMPLETED'
    });

    // Get recent service requests
    const recentRequests = await ServiceRequest.find({ assignedCounselor: counselorId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const enrichedRequests = await Promise.all(
      recentRequests.map(async (request) => {
        const student = await Student.findOne({ studentId: request.studentId }).lean();
        const user = student ? await User.findOne({ userId: student.userId }).select('-password').lean() : null;
        return {
          ...request,
          requestId: request.serviceRequestId,
          student: { ...student, user }
        };
      })
    );

    res.json({
      stats: {
        assignedStudents,
        activeRequests,
        pendingTasks,
        completedRequests
      },
      recentRequests: enrichedRequests
    });
  } catch (error) {
    console.error('Counselor dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

/**
 * @route   GET /api/counselors/students
 * @desc    Get counselor's assigned students
 * @access  Counselor
 */
router.get('/students', authMiddleware, roleMiddleware('counselor'), async (req, res) => {
  try {
    const students = await Student.find({ assignedCounselor: req.user.userId })
      .sort({ createdAt: -1 })
      .lean();

    const studentsWithDetails = await Promise.all(
      students.map(async (student) => {
        const user = await User.findOne({ userId: student.userId }).select('-password').lean();
        const serviceRequests = await ServiceRequest.find({ studentId: student.studentId }).lean();
        const tasks = await Task.find({ assignedTo: student.userId, assignedBy: req.user.userId }).lean();

        return {
          ...student,
          user,
          serviceRequests,
          tasks,
          activeRequests: serviceRequests.filter(sr => ['ASSIGNED', 'IN_PROGRESS'].includes(sr.status)).length,
          pendingTasks: tasks.filter(t => ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'].includes(t.status)).length
        };
      })
    );

    res.json({ students: studentsWithDetails });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

/**
 * @route   GET /api/counselors/service-requests
 * @desc    Get counselor's assigned service requests
 * @access  Counselor
 */
router.get('/service-requests', authMiddleware, roleMiddleware('counselor'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const filter = { assignedCounselor: req.user.userId };
    if (status && status !== 'all') filter.status = status;

    const serviceRequests = await ServiceRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await ServiceRequest.countDocuments(filter);

    // Enrich with student and task data
    const enrichedRequests = await Promise.all(
      serviceRequests.map(async (request) => {
        const student = await Student.findOne({ studentId: request.studentId }).lean();
        const user = student ? await User.findOne({ userId: student.userId }).select('-password').lean() : null;
        const tasks = await Task.find({ serviceRequestId: request.serviceRequestId }).lean();

        return {
          ...request,
          requestId: request.serviceRequestId,
          student: { ...student, user },
          tasks,
          taskStats: {
            total: tasks.length,
            completed: tasks.filter(t => t.status === 'COMPLETED').length,
            pending: tasks.filter(t => ['PENDING', 'IN_PROGRESS'].includes(t.status)).length,
            submitted: tasks.filter(t => t.status === 'SUBMITTED').length
          }
        };
      })
    );

    res.json({
      serviceRequests: enrichedRequests,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get service requests error:', error);
    res.status(500).json({ error: 'Failed to fetch service requests' });
  }
});

// Get assigned students (for counselors) - Legacy endpoint
router.get('/my-students', authMiddleware, roleMiddleware('counselor'), async (req, res) => {
  try {
    const students = await Student.find({ assignedCounselor: req.user.userId });
    
    const studentsWithDetails = [];
    for (const student of students) {
      const user = await User.findOne({ userId: student.userId }).select('-password');
      const applications = await ServiceApplication.find({ studentId: student.studentId });
      
      studentsWithDetails.push({
        ...student.toObject(),
        user,
        applications
      });
    }

    res.json({ students: studentsWithDetails });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Update service application status
router.put('/applications/:applicationId', authMiddleware, roleMiddleware('counselor'), async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status, notes } = req.body;

    const application = await ServiceApplication.findOne({ applicationId });
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    application.status = status || application.status;
    
    if (notes) {
      application.notes.push({
        text: notes,
        addedBy: req.user.userId,
        addedAt: new Date()
      });
    }

    if (status === 'completed') {
      application.completedAt = new Date();
    }

    await application.save();

    res.json({ message: 'Application updated', application });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update application' });
  }
});

/**
 * @route   PATCH /api/counselors/service-requests/:requestId/progress
 * @desc    Update service request progress (counselor)
 * @access  Counselor
 */
router.patch('/service-requests/:requestId/progress', authMiddleware, roleMiddleware('counselor'), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, note } = req.body;

    const serviceRequest = await ServiceRequest.findOne({
      $or: [{ serviceRequestId: requestId }, { _id: requestId }],
      assignedCounselor: req.user.userId
    });

    if (!serviceRequest) {
      return res.status(404).json({ error: 'Service request not found or not assigned to you' });
    }

    // Validate status transition
    const validStatuses = ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    serviceRequest.status = status;
    serviceRequest.statusHistory = serviceRequest.statusHistory || [];
    serviceRequest.statusHistory.push({
      status,
      changedBy: req.user.userId,
      changedAt: new Date(),
      note: note || ''
    });

    if (status === 'COMPLETED') {
      serviceRequest.completedAt = new Date();
    }

    await serviceRequest.save();

    await logAudit(
      req.user.userId,
      'service_request_status_updated',
      'service_request',
      requestId,
      { status, note },
      req
    );

    res.json({ message: 'Status updated', serviceRequest });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

/**
 * @route   POST /api/counselors/service-requests/:requestId/notes
 * @desc    Add note to service request (counselor)
 * @access  Counselor
 */
router.post('/service-requests/:requestId/notes', authMiddleware, roleMiddleware('counselor'), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { text, isInternal = false } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Note text is required' });
    }

    const serviceRequest = await ServiceRequest.findOne({
      $or: [{ serviceRequestId: requestId }, { _id: requestId }],
      assignedCounselor: req.user.userId
    });

    if (!serviceRequest) {
      return res.status(404).json({ error: 'Service request not found or not assigned to you' });
    }

    serviceRequest.notes = serviceRequest.notes || [];
    serviceRequest.notes.push({
      text: text.trim(),
      addedBy: req.user.userId,
      addedAt: new Date(),
      isInternal
    });

    await serviceRequest.save();

    res.json({ message: 'Note added', serviceRequest });
  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

module.exports = router;