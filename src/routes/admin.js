/**
 * Admin Routes
 * Super Admin management endpoints
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const { validate, adminNotificationSchemas } = require('../middlewares/validation');
const User = require('../models/User');
const Student = require('../models/Student');
const ServiceRequest = require('../models/ServiceRequest');
const ServiceApplication = require('../models/ServiceApplication');
const Notification = require('../models/Notification');
const Commission = require('../models/Commission');
const { logAudit, logAssignmentEvent } = require('../utils/auditLogger');
const { emitToUser } = require('../socket/socketManager');
const notificationService = require('../services/notificationService');
const StudentNote = require('../models/StudentNote');

/**
 * @route   GET /api/admin/metrics
 * @desc    Get dashboard metrics
 * @access  Super Admin
 */
router.get('/metrics', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const [
      totalStudents,
      totalCounselors,
      totalAgents,
      pendingServiceRequests,
      activeServiceRequests,
      completedServiceRequests
    ] = await Promise.all([
      Student.countDocuments(),
      User.countDocuments({ role: 'counselor', isActive: true }),
      User.countDocuments({ role: 'agent', isActive: true }),
      ServiceRequest.countDocuments({ status: 'PENDING_ADMIN_ASSIGNMENT' }),
      ServiceRequest.countDocuments({ status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } }),
      ServiceRequest.countDocuments({ status: 'COMPLETED' })
    ]);

    res.json({
      metrics: {
        totalStudents,
        totalCounselors,
        totalAgents,
        pendingServiceRequests,
        activeServiceRequests,
        completedServiceRequests
      }
    });
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

/**
 * @route   GET /api/admin/students
 * @desc    Get all students with details, search, and pagination
 * @access  Super Admin
 */
router.get('/students', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build base filter
    const filter = {};
    if (status && status !== 'all') filter.status = status;

    let studentIds = null;

    // If search is provided, we need to search across multiple collections
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');

      // Find users matching the search (students, agents)
      const matchingUsers = await User.find({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex }
        ]
      }).select('userId').lean();

      const matchingUserIds = matchingUsers.map(u => u.userId);

      // Find students where:
      // 1. Their user matches the search, OR
      // 2. Their assigned agent matches the search
      const matchingStudents = await Student.find({
        $or: [
          { userId: { $in: matchingUserIds } },
          { assignedAgent: { $in: matchingUserIds } },
          { assignedCounselor: { $in: matchingUserIds } }
        ]
      }).select('studentId').lean();

      studentIds = matchingStudents.map(s => s.studentId);

      // Add to filter
      filter.studentId = { $in: studentIds };
    }

    // Get total count for pagination
    const total = await Student.countDocuments(filter);

    // Get paginated students
    const students = await Student.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Enrich with user data, assigned agent, assigned counselor
    const enrichedStudents = await Promise.all(
      students.map(async (student) => {
        // Get student's user data
        const user = await User.findOne({ userId: student.userId })
          .select('-password')
          .lean();

        // Get assigned agent data
        let assignedAgent = null;
        if (student.assignedAgent) {
          assignedAgent = await User.findOne({ userId: student.assignedAgent })
            .select('userId firstName lastName email phone avatar')
            .lean();
        }

        // Get assigned counselor data
        let assignedCounselor = null;
        if (student.assignedCounselor) {
          assignedCounselor = await User.findOne({ userId: student.assignedCounselor })
            .select('userId firstName lastName email phone avatar')
            .lean();
        }

        // Get service requests
        const serviceRequests = await ServiceRequest.find({ studentId: student.studentId })
          .select('serviceType status createdAt')
          .lean();

        return {
          ...student,
          user,
          assignedAgent,
          assignedCounselor,
          serviceRequests
        };
      })
    );

    res.json({
      students: enrichedStudents,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

/**
 * @route   GET /api/admin/students/:studentId
 * @desc    Get single student details
 * @access  Super Admin
 */
router.get('/students/:studentId', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findOne({ studentId }).lean();
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const user = await User.findOne({ userId: student.userId })
      .select('-password')
      .lean();
    const serviceRequests = await ServiceRequest.find({ studentId }).lean();

    res.json({
      student: { ...student, user, serviceRequests }
    });
  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({ error: 'Failed to fetch student' });
  }
});

/**
 * @route   GET /api/admin/students/:studentId/notes
 * @desc    Get all notes for a student (super admin view)
 * @access  Super Admin
 */
router.get('/students/:studentId/notes', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { studentId } = req.params;

    // Verify student exists
    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get all notes for this student
    const notes = await StudentNote.find({ studentId })
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with author details
    const enrichedNotes = await Promise.all(
      notes.map(async (note) => {
        const author = await User.findOne({ userId: note.authorId })
          .select('firstName lastName avatar role')
          .lean();
        return {
          ...note,
          author: author ? {
            firstName: author.firstName,
            lastName: author.lastName,
            avatar: author.avatar,
            role: author.role
          } : null
        };
      })
    );

    res.json({ notes: enrichedNotes });
  } catch (error) {
    console.error('Get student notes error:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

/**
 * @route   POST /api/admin/students/:studentId/notes
 * @desc    Add a note for a student (super admin)
 * @access  Super Admin
 */
router.post('/students/:studentId/notes', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { text, parentNoteId } = req.body;
    const adminId = req.user.userId;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Note text is required' });
    }

    // Verify student exists
    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Create note
    const note = new StudentNote({
      noteId: uuidv4(),
      studentId,
      authorId: adminId,
      authorRole: 'super_admin',
      text: text.trim(),
      parentNoteId: parentNoteId || null
    });

    await note.save();

    // Get author details for response
    const author = {
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      avatar: req.user.avatar,
      role: 'super_admin'
    };

    // Notify the assigned agent about the reply
    if (student.assignedAgent) {
      const notification = new Notification({
        notificationId: uuidv4(),
        recipientId: student.assignedAgent,
        type: 'GENERAL',
        title: 'Admin Reply on Student Note',
        message: `Super Admin replied to a note about student`,
        channel: 'DASHBOARD',
        priority: 'NORMAL',
        metadata: { studentId, noteId: note.noteId }
      });
      await notification.save();
      emitToUser(student.assignedAgent, 'student_note_added', { studentId, noteId: note.noteId });
    }

    await logAudit(
      adminId,
      'admin_student_note_added',
      'student_note',
      note.noteId,
      { studentId, text: text.substring(0, 100), parentNoteId },
      req
    );

    res.status(201).json({
      message: 'Note added successfully',
      note: { ...note.toObject(), author }
    });
  } catch (error) {
    console.error('Add student note error:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

/**
 * @route   PUT /api/admin/students/:studentId/assign-counselor
 * @desc    Assign counselor to student
 * @access  Super Admin
 */
router.put('/students/:studentId/assign-counselor', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { counselorId } = req.body;

    if (!counselorId) {
      return res.status(400).json({ error: 'Counselor ID is required' });
    }

    // Verify counselor exists
    const counselor = await User.findOne({ userId: counselorId, role: 'counselor' });
    if (!counselor) {
      return res.status(404).json({ error: 'Counselor not found' });
    }

    const student = await Student.findOneAndUpdate(
      { studentId },
      { assignedCounselor: counselorId },
      { new: true }
    );

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Audit log
    await logAssignmentEvent(req, 'student', studentId, 'counselor', counselorId);

    // Notify counselor
    const notification = new Notification({
      notificationId: uuidv4(),
      recipientId: counselorId,
      type: 'GENERAL',
      title: 'New Student Assigned',
      message: 'A new student has been assigned to you',
      channel: 'BOTH',
      metadata: { studentId }
    });
    await notification.save();
    emitToUser(counselorId, 'new_notification', notification);

    res.json({ message: 'Counselor assigned successfully', student });
  } catch (error) {
    console.error('Assign counselor error:', error);
    res.status(500).json({ error: 'Failed to assign counselor' });
  }
});

/**
 * @route   PUT /api/admin/students/:studentId/assign-agent
 * @desc    Assign agent to student
 * @access  Super Admin
 */
router.put('/students/:studentId/assign-agent', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { agentId, commissionPercentage } = req.body;

    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    // Verify agent exists
    const agent = await User.findOne({ userId: agentId, role: 'agent' });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const student = await Student.findOneAndUpdate(
      { studentId },
      {
        assignedAgent: agentId,
        commissionPercentage: commissionPercentage || 10
      },
      { new: true }
    );

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Audit log
    await logAssignmentEvent(req, 'student', studentId, 'agent', agentId);

    // Notify agent
    const notification = new Notification({
      notificationId: uuidv4(),
      recipientId: agentId,
      type: 'GENERAL',
      title: 'New Student Assigned',
      message: `A new student has been assigned to you with ${commissionPercentage || 10}% commission`,
      channel: 'BOTH',
      metadata: { studentId }
    });
    await notification.save();
    emitToUser(agentId, 'new_notification', notification);

    res.json({ message: 'Agent assigned successfully', student });
  } catch (error) {
    console.error('Assign agent error:', error);
    res.status(500).json({ error: 'Failed to assign agent' });
  }
});

/**
 * @route   GET /api/admin/counselors/stats
 * @desc    Get counselor statistics for dashboard
 * @access  Super Admin
 */
router.get('/counselors/stats', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const total = await User.countDocuments({ role: 'counselor' });
    const active = await User.countDocuments({ role: 'counselor', isActive: true });
    const inactive = await User.countDocuments({ role: 'counselor', isActive: false });
    const totalActiveAssignments = await ServiceRequest.countDocuments({
      assignedCounselor: { $ne: null },
      status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentlyAdded = await User.countDocuments({
      role: 'counselor',
      createdAt: { $gte: thirtyDaysAgo }
    });

    res.json({ stats: { total, active, inactive, totalActiveAssignments, recentlyAdded } });
  } catch (error) {
    console.error('Get counselor stats error:', error);
    res.status(500).json({ error: 'Failed to fetch counselor statistics' });
  }
});

/**
 * @route   GET /api/admin/counselors
 * @desc    Get all counselors with pagination and filters
 * @access  Super Admin
 */
router.get('/counselors', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = 'all', sortBy = 'createdAt', order = 'desc' } = req.query;
    const query = { role: 'counselor' };

    if (status === 'active') query.isActive = true;
    else if (status === 'inactive') query.isActive = false;

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const counselors = await User.find(query)
      .select('-password')
      .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await User.countDocuments(query);

    const enrichedCounselors = await Promise.all(
      counselors.map(async (counselor) => {
        const totalStudents = await Student.countDocuments({ assignedCounselor: counselor.userId });
        const activeAssignments = await ServiceRequest.countDocuments({
          assignedCounselor: counselor.userId,
          status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }
        });
        return { ...counselor, _id: counselor.userId, totalStudents, activeAssignments, assignedStudents: { length: totalStudents } };
      })
    );

    res.json({
      success: true,
      counselors: enrichedCounselors,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('Get counselors error:', error);
    res.status(500).json({ error: 'Failed to fetch counselors' });
  }
});

/**
 * @route   POST /api/admin/counselors
 * @desc    Create a new counselor
 * @access  Super Admin
 */
router.post('/counselors', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, country } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists' });
    }

    const user = new User({
      userId: uuidv4(),
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      role: 'counselor',
      phone: phone || '',
      country: country || '',
      avatar: `https://api.dicebear.com/5.x/initials/svg?seed=${firstName}${lastName}`,
      isActive: true
    });

    await user.save();
    await logAudit(req.user.userId, 'user_created', 'user', user.userId, { role: 'counselor', email }, req);

    res.status(201).json({
      success: true,
      message: 'Counselor created successfully',
      counselor: { ...user.toObject(), password: undefined, _id: user.userId }
    });
  } catch (error) {
    console.error('Create counselor error:', error);
    res.status(500).json({ success: false, message: 'Failed to create counselor' });
  }
});

/**
 * @route   GET /api/admin/counselors/:userId
 * @desc    Get single counselor by ID with full details
 * @access  Super Admin
 */
router.get('/counselors/:userId', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const counselor = await User.findOne({ userId, role: 'counselor' }).select('-password').lean();

    if (!counselor) {
      return res.status(404).json({ success: false, message: 'Counselor not found' });
    }

    const assignedStudentsData = await Student.find({ assignedCounselor: userId }).lean();
    const assignedStudents = await Promise.all(
      assignedStudentsData.map(async (student) => {
        const user = await User.findOne({ userId: student.userId }).select('-password').lean();
        const services = await ServiceRequest.find({ studentId: student.studentId }).select('serviceType status priority appliedAt').lean();
        return { ...student, user, services: services.map(s => ({ ...s, _id: s.serviceRequestId, type: 'ServiceRequest', assignedAt: s.appliedAt })) };
      })
    );

    const serviceRequests = await ServiceRequest.find({ assignedCounselor: userId }).sort({ createdAt: -1 }).lean();

    let tasks = [];
    try {
      const Task = require('../models/Task');
      const taskData = await Task.find({ assignedBy: userId }).sort({ createdAt: -1 }).limit(20).lean();
      tasks = await Promise.all(taskData.map(async (task) => {
        const studentUser = await User.findOne({ userId: task.assignedTo }).select('firstName lastName email').lean();
        return { ...task, student: studentUser };
      }));
    } catch (e) { /* Task model may not exist */ }

    const stats = {
      totalStudents: assignedStudents.length,
      activeAssignments: serviceRequests.filter(r => ['ASSIGNED', 'IN_PROGRESS'].includes(r.status)).length,
      completedAssignments: serviceRequests.filter(r => r.status === 'COMPLETED').length,
      pendingAssignments: serviceRequests.filter(r => r.status === 'PENDING_ADMIN_ASSIGNMENT').length
    };

    res.json({ success: true, counselor: { ...counselor, _id: counselor.userId }, assignedStudents, serviceApplications: serviceRequests, preApplicationServices: [], tasks, stats });
  } catch (error) {
    console.error('Get counselor by ID error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch counselor details' });
  }
});

/**
 * @route   PUT /api/admin/counselors/:userId
 * @desc    Update counselor profile
 * @access  Super Admin
 */
router.put('/counselors/:userId', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, phone, country, avatar } = req.body;

    const updates = {};
    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    if (phone !== undefined) updates.phone = phone;
    if (country !== undefined) updates.country = country;
    if (avatar) updates.avatar = avatar;

    const counselor = await User.findOneAndUpdate({ userId, role: 'counselor' }, updates, { new: true }).select('-password');
    if (!counselor) return res.status(404).json({ success: false, message: 'Counselor not found' });

    await logAudit(req.user.userId, 'user_updated', 'user', userId, updates, req);
    res.json({ success: true, message: 'Counselor updated successfully', counselor: { ...counselor.toObject(), _id: counselor.userId } });
  } catch (error) {
    console.error('Update counselor error:', error);
    res.status(500).json({ success: false, message: 'Failed to update counselor' });
  }
});

/**
 * @route   PATCH /api/admin/counselors/:userId/status
 * @desc    Update counselor status (activate/deactivate)
 * @access  Super Admin
 */
router.patch('/counselors/:userId/status', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') return res.status(400).json({ success: false, message: 'isActive must be a boolean' });

    const counselor = await User.findOneAndUpdate({ userId, role: 'counselor' }, { isActive }, { new: true }).select('-password');
    if (!counselor) return res.status(404).json({ success: false, message: 'Counselor not found' });

    await logAudit(req.user.userId, isActive ? 'user_activated' : 'user_deactivated', 'user', userId, { isActive }, req);
    res.json({ success: true, message: `Counselor ${isActive ? 'activated' : 'deactivated'} successfully`, counselor: { ...counselor.toObject(), _id: counselor.userId } });
  } catch (error) {
    console.error('Update counselor status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update counselor status' });
  }
});

/**
 * @route   DELETE /api/admin/counselors/:userId
 * @desc    Delete counselor (soft delete by deactivating)
 * @access  Super Admin
 */
router.delete('/counselors/:userId', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { permanent = 'false' } = req.query;

    const activeAssignments = await ServiceRequest.countDocuments({
      assignedCounselor: userId,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }
    });

    if (activeAssignments > 0 && permanent === 'true') {
      return res.status(400).json({ success: false, message: `Cannot delete counselor with ${activeAssignments} active assignment(s)`, activeAssignments });
    }

    if (permanent === 'true') {
      const counselor = await User.findOneAndDelete({ userId, role: 'counselor' });
      if (!counselor) return res.status(404).json({ success: false, message: 'Counselor not found' });
      await logAudit(req.user.userId, 'user_deleted', 'user', userId, { permanent: true }, req);
      return res.json({ success: true, message: 'Counselor permanently deleted' });
    }

    const counselor = await User.findOneAndUpdate({ userId, role: 'counselor' }, { isActive: false }, { new: true }).select('-password');
    if (!counselor) return res.status(404).json({ success: false, message: 'Counselor not found' });

    await logAudit(req.user.userId, 'user_deactivated', 'user', userId, { softDelete: true }, req);
    res.json({ success: true, message: 'Counselor deactivated successfully', counselor: { ...counselor.toObject(), _id: counselor.userId }, activeAssignments });
  } catch (error) {
    console.error('Delete counselor error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete counselor' });
  }
});

/**
 * @route   POST /api/admin/counselors/:userId/reset-password
 * @desc    Reset counselor password
 * @access  Super Admin
 */
router.post('/counselors/:userId/reset-password', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const counselor = await User.findOne({ userId, role: 'counselor' });
    if (!counselor) return res.status(404).json({ success: false, message: 'Counselor not found' });

    counselor.password = newPassword;
    await counselor.save();

    await logAudit(req.user.userId, 'password_reset', 'user', userId, { resetBy: 'admin' }, req);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset counselor password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

/**
 * @route   GET /api/admin/agents/stats
 * @desc    Get agent statistics for dashboard
 * @access  Super Admin
 */
router.get('/agents/stats', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const total = await User.countDocuments({ role: 'agent' });
    const active = await User.countDocuments({ role: 'agent', isActive: true });
    const inactive = await User.countDocuments({ role: 'agent', isActive: false });

    // Total students assigned to agents
    const totalStudentsReferred = await Student.countDocuments({ assignedAgent: { $ne: null } });

    // Total commissions
    const commissionStats = await Commission.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      }
    ]);

    const commissionsByStatus = {
      pending: { count: 0, total: 0 },
      approved: { count: 0, total: 0 },
      paid: { count: 0, total: 0 }
    };
    commissionStats.forEach(s => {
      commissionsByStatus[s._id] = { count: s.count, total: s.total };
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentlyAdded = await User.countDocuments({
      role: 'agent',
      createdAt: { $gte: thirtyDaysAgo }
    });

    res.json({
      stats: {
        total,
        active,
        inactive,
        totalStudentsReferred,
        totalCommissionsPaid: commissionsByStatus.paid.total,
        pendingCommissions: commissionsByStatus.pending.total + commissionsByStatus.approved.total,
        recentlyAdded
      }
    });
  } catch (error) {
    console.error('Get agent stats error:', error);
    res.status(500).json({ error: 'Failed to fetch agent statistics' });
  }
});

/**
 * @route   GET /api/admin/agents
 * @desc    Get all agents with pagination and filters
 * @access  Super Admin
 */
router.get('/agents', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = 'all', sortBy = 'createdAt', order = 'desc' } = req.query;
    const query = { role: 'agent' };

    if (status === 'active') query.isActive = true;
    else if (status === 'inactive') query.isActive = false;

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const agents = await User.find(query)
      .select('-password')
      .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await User.countDocuments(query);

    // Enrich with assignment counts and commissions
    const enrichedAgents = await Promise.all(
      agents.map(async (agent) => {
        const totalStudents = await Student.countDocuments({ assignedAgent: agent.userId });
        const referredStudents = await Student.countDocuments({ referredBy: agent.userId });

        const commissionAgg = await Commission.aggregate([
          { $match: { agentId: agent.userId } },
          {
            $group: {
              _id: '$status',
              total: { $sum: '$amount' }
            }
          }
        ]);

        let totalEarnings = 0;
        let pendingEarnings = 0;
        commissionAgg.forEach(c => {
          if (c._id === 'paid') totalEarnings = c.total;
          if (c._id === 'pending' || c._id === 'approved') pendingEarnings += c.total;
        });

        return {
          ...agent,
          _id: agent.userId,
          totalStudents,
          referredStudents,
          assignedStudents: { length: totalStudents },
          totalEarnings: agent.totalEarnings || totalEarnings,
          pendingEarnings: agent.pendingEarnings || pendingEarnings,
          commissionRate: agent.commissionPercentage || 10
        };
      })
    );

    res.json({
      success: true,
      agents: enrichedAgents,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

/**
 * @route   POST /api/admin/agents
 * @desc    Create a new agent
 * @access  Super Admin
 */
router.post('/agents', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, country, commissionPercentage = 10 } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (commissionPercentage < 0 || commissionPercentage > 100) {
      return res.status(400).json({ success: false, message: 'Commission percentage must be between 0 and 100' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists' });
    }

    const user = new User({
      userId: uuidv4(),
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      role: 'agent',
      phone: phone || '',
      country: country || '',
      commissionPercentage,
      avatar: `https://api.dicebear.com/5.x/initials/svg?seed=${firstName}${lastName}`,
      isActive: true
    });

    await user.save();
    await logAudit(req.user.userId, 'user_created', 'user', user.userId, { role: 'agent', email, commissionPercentage }, req);

    res.status(201).json({
      success: true,
      message: 'Agent created successfully',
      agent: { ...user.toObject(), password: undefined, _id: user.userId, commissionRate: commissionPercentage }
    });
  } catch (error) {
    console.error('Create agent error:', error);
    res.status(500).json({ success: false, message: 'Failed to create agent' });
  }
});

/**
 * @route   GET /api/admin/agents/:userId
 * @desc    Get single agent by ID with full details
 * @access  Super Admin
 */
router.get('/agents/:userId', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const agent = await User.findOne({ userId, role: 'agent' }).select('-password').lean();

    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    // Get assigned students
    const assignedStudentsData = await Student.find({ assignedAgent: userId }).lean();
    const assignedStudents = await Promise.all(
      assignedStudentsData.map(async (student) => {
        const user = await User.findOne({ userId: student.userId }).select('-password').lean();
        const services = await ServiceRequest.find({ studentId: student.studentId }).select('serviceType status priority appliedAt').lean();
        return {
          ...student,
          user,
          services: services.map(s => ({ ...s, _id: s.serviceRequestId, type: 'ServiceRequest', assignedAt: s.appliedAt }))
        };
      })
    );

    // Get referred students (students this agent brought in)
    const referredStudentsData = await Student.find({ referredBy: userId }).lean();
    const referredStudents = await Promise.all(
      referredStudentsData.map(async (student) => {
        const user = await User.findOne({ userId: student.userId }).select('-password').lean();
        return { ...student, user };
      })
    );

    // Get commission history
    const commissions = await Commission.find({ agentId: userId }).sort({ createdAt: -1 }).limit(50).lean();

    // Calculate stats
    const commissionStats = await Commission.aggregate([
      { $match: { agentId: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      }
    ]);

    const stats = {
      totalStudents: assignedStudents.length,
      referredStudents: referredStudents.length,
      totalEarnings: 0,
      pendingEarnings: 0,
      paidCommissions: 0,
      pendingCommissions: 0
    };

    commissionStats.forEach(c => {
      if (c._id === 'paid') {
        stats.totalEarnings = c.total;
        stats.paidCommissions = c.count;
      }
      if (c._id === 'pending' || c._id === 'approved') {
        stats.pendingEarnings += c.total;
        stats.pendingCommissions += c.count;
      }
    });

    res.json({
      success: true,
      agent: { ...agent, _id: agent.userId, commissionRate: agent.commissionPercentage || 10 },
      assignedStudents,
      referredStudents,
      commissions,
      stats
    });
  } catch (error) {
    console.error('Get agent by ID error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch agent details' });
  }
});

/**
 * @route   PUT /api/admin/agents/:userId
 * @desc    Update agent profile
 * @access  Super Admin
 */
router.put('/agents/:userId', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, phone, country, avatar, bankDetails } = req.body;

    const updates = {};
    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    if (phone !== undefined) updates.phone = phone;
    if (country !== undefined) updates.country = country;
    if (avatar) updates.avatar = avatar;
    if (bankDetails) updates.bankDetails = bankDetails;

    const agent = await User.findOneAndUpdate({ userId, role: 'agent' }, updates, { new: true }).select('-password');
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

    await logAudit(req.user.userId, 'user_updated', 'user', userId, updates, req);
    res.json({
      success: true,
      message: 'Agent updated successfully',
      agent: { ...agent.toObject(), _id: agent.userId, commissionRate: agent.commissionPercentage || 10 }
    });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ success: false, message: 'Failed to update agent' });
  }
});

/**
 * @route   PATCH /api/admin/agents/:userId/status
 * @desc    Update agent status (activate/deactivate)
 * @access  Super Admin
 */
router.patch('/agents/:userId/status', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') return res.status(400).json({ success: false, message: 'isActive must be a boolean' });

    const agent = await User.findOneAndUpdate({ userId, role: 'agent' }, { isActive }, { new: true }).select('-password');
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

    await logAudit(req.user.userId, isActive ? 'user_activated' : 'user_deactivated', 'user', userId, { isActive }, req);
    res.json({
      success: true,
      message: `Agent ${isActive ? 'activated' : 'deactivated'} successfully`,
      agent: { ...agent.toObject(), _id: agent.userId, commissionRate: agent.commissionPercentage || 10 }
    });
  } catch (error) {
    console.error('Update agent status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update agent status' });
  }
});

/**
 * @route   PATCH /api/admin/agents/:userId/commission
 * @desc    Update agent commission percentage
 * @access  Super Admin
 */
router.patch('/agents/:userId/commission', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { commissionPercentage } = req.body;

    if (typeof commissionPercentage !== 'number' || commissionPercentage < 0 || commissionPercentage > 100) {
      return res.status(400).json({ success: false, message: 'Commission percentage must be a number between 0 and 100' });
    }

    const agent = await User.findOneAndUpdate(
      { userId, role: 'agent' },
      { commissionPercentage },
      { new: true }
    ).select('-password');

    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

    await logAudit(req.user.userId, 'commission_updated', 'user', userId, { commissionPercentage }, req);
    res.json({
      success: true,
      message: 'Commission percentage updated successfully',
      agent: { ...agent.toObject(), _id: agent.userId, commissionRate: commissionPercentage }
    });
  } catch (error) {
    console.error('Update agent commission error:', error);
    res.status(500).json({ success: false, message: 'Failed to update commission percentage' });
  }
});

/**
 * @route   DELETE /api/admin/agents/:userId
 * @desc    Delete agent (soft delete by deactivating)
 * @access  Super Admin
 */
router.delete('/agents/:userId', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { permanent = 'false' } = req.query;

    // Check for active assignments
    const activeStudents = await Student.countDocuments({ assignedAgent: userId });
    const pendingCommissions = await Commission.countDocuments({
      agentId: userId,
      status: { $in: ['pending', 'approved'] }
    });

    if ((activeStudents > 0 || pendingCommissions > 0) && permanent === 'true') {
      return res.status(400).json({
        success: false,
        message: `Cannot delete agent with ${activeStudents} assigned student(s) and ${pendingCommissions} pending commission(s)`,
        activeStudents,
        pendingCommissions
      });
    }

    if (permanent === 'true') {
      const agent = await User.findOneAndDelete({ userId, role: 'agent' });
      if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
      await logAudit(req.user.userId, 'user_deleted', 'user', userId, { permanent: true }, req);
      return res.json({ success: true, message: 'Agent permanently deleted' });
    }

    const agent = await User.findOneAndUpdate({ userId, role: 'agent' }, { isActive: false }, { new: true }).select('-password');
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

    await logAudit(req.user.userId, 'user_deactivated', 'user', userId, { softDelete: true }, req);
    res.json({
      success: true,
      message: 'Agent deactivated successfully',
      agent: { ...agent.toObject(), _id: agent.userId },
      activeStudents,
      pendingCommissions
    });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete agent' });
  }
});

/**
 * @route   POST /api/admin/agents/:userId/reset-password
 * @desc    Reset agent password
 * @access  Super Admin
 */
router.post('/agents/:userId/reset-password', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const agent = await User.findOne({ userId, role: 'agent' });
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

    agent.password = newPassword;
    await agent.save();

    await logAudit(req.user.userId, 'password_reset', 'user', userId, { resetBy: 'admin' }, req);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset agent password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

/**
 * @route   POST /api/admin/users
 * @desc    Create new counselor or agent
 * @access  Super Admin
 */
router.post('/users', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, phone, country } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate role
    if (!['counselor', 'agent'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be counselor or agent' });
    }

    // Check existing user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const user = new User({
      userId: uuidv4(),
      email,
      password,
      firstName,
      lastName,
      role,
      phone: phone || '',
      country: country || '',
      avatar: `https://api.dicebear.com/5.x/initials/svg?seed=${firstName} ${lastName}`,
      isActive: true
    });

    await user.save();

    // Audit log
    await logAudit(
      req.user.userId,
      'user_created',
      'user',
      user.userId,
      { role, email },
      req
    );

    res.status(201).json({
      message: 'User created successfully',
      user: { ...user.toObject(), password: undefined }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * @route   PUT /api/admin/users/:userId/status
 * @desc    Activate or deactivate user
 * @access  Super Admin
 */
router.put('/users/:userId/status', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }

    const user = await User.findOneAndUpdate(
      { userId },
      { isActive },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Audit log
    await logAudit(
      req.user.userId,
      isActive ? 'user_updated' : 'user_deactivated',
      'user',
      userId,
      { isActive },
      req
    );

    res.json({
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

/**
 * @route   GET /api/admin/service-requests
 * @desc    Get all service requests for admin
 * @access  Super Admin
 */
router.get('/service-requests', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status && status !== 'all') filter.status = status;

    const serviceRequests = await ServiceRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await ServiceRequest.countDocuments(filter);

    // Enrich with student, counselor, agent data
    const enrichedRequests = await Promise.all(
      serviceRequests.map(async (request) => {
        const student = await Student.findOne({ studentId: request.studentId }).lean();
        const studentUser = student ? await User.findOne({ userId: student.userId }).select('-password').lean() : null;

        let assignedCounselor = null;
        if (request.assignedCounselor) {
          assignedCounselor = await User.findOne({ userId: request.assignedCounselor }).select('-password').lean();
        }

        let assignedAgent = null;
        if (request.assignedAgent) {
          assignedAgent = await User.findOne({ userId: request.assignedAgent }).select('-password').lean();
        }

        return {
          ...request,
          requestId: request.serviceRequestId,
          student: { ...student, user: studentUser },
          assignedCounselor,
          assignedAgent
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

/**
 * @route   POST /api/admin/service-requests/:requestId/assign
 * @desc    Assign counselor/agent to service request
 * @access  Super Admin
 */
router.post('/service-requests/:requestId/assign', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { counselorId, agentId } = req.body;

    if (!counselorId && !agentId) {
      return res.status(400).json({ error: 'At least one of counselorId or agentId is required' });
    }

    const serviceRequest = await ServiceRequest.findOne({ serviceRequestId: requestId });
    if (!serviceRequest) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    // Validate counselor if provided
    if (counselorId) {
      const counselor = await User.findOne({ userId: counselorId, role: 'counselor' });
      if (!counselor) {
        return res.status(404).json({ error: 'Counselor not found' });
      }
      serviceRequest.assignedCounselor = counselorId;
    }

    // Validate agent if provided
    if (agentId) {
      const agent = await User.findOne({ userId: agentId, role: 'agent' });
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      serviceRequest.assignedAgent = agentId;
    }

    // Update status if pending
    if (serviceRequest.status === 'PENDING_ADMIN_ASSIGNMENT') {
      serviceRequest.status = 'ASSIGNED';
      serviceRequest.statusHistory.push({
        status: 'ASSIGNED',
        changedBy: req.user.userId,
        changedAt: new Date(),
        note: `Assigned by admin`
      });
    }

    await serviceRequest.save();

    // Audit log
    await logAudit(
      req.user.userId,
      'service_request_assigned',
      'serviceRequest',
      requestId,
      { counselorId, agentId },
      req
    );

    // Notify assigned users
    if (counselorId) {
      const notification = new Notification({
        notificationId: uuidv4(),
        recipientId: counselorId,
        type: 'SERVICE_REQUEST_ASSIGNED',
        title: 'New Service Request Assigned',
        message: `A ${serviceRequest.serviceType} service request has been assigned to you`,
        channel: 'BOTH',
        actionUrl: `/counselor/service-requests`,
        metadata: { serviceRequestId: requestId }
      });
      await notification.save();
      emitToUser(counselorId, 'new_notification', notification);
    }

    if (agentId) {
      const notification = new Notification({
        notificationId: uuidv4(),
        recipientId: agentId,
        type: 'SERVICE_REQUEST_ASSIGNED',
        title: 'New Service Request Assigned',
        message: `A ${serviceRequest.serviceType} service request has been assigned to you`,
        channel: 'BOTH',
        actionUrl: `/agent/students`,
        metadata: { serviceRequestId: requestId }
      });
      await notification.save();
      emitToUser(agentId, 'new_notification', notification);
    }

    // Notify student
    const student = await Student.findOne({ studentId: serviceRequest.studentId });
    if (student) {
      const notification = new Notification({
        notificationId: uuidv4(),
        recipientId: student.userId,
        type: 'SERVICE_REQUEST_ASSIGNED',
        title: 'Your Service Request Has Been Assigned',
        message: `A counselor has been assigned to your ${serviceRequest.serviceType} request`,
        channel: 'BOTH',
        actionUrl: `/dashboard/track`,
        metadata: { serviceRequestId: requestId }
      });
      await notification.save();
      emitToUser(student.userId, 'new_notification', notification);
    }

    res.json({ message: 'Service request assigned successfully', serviceRequest });
  } catch (error) {
    console.error('Assign service request error:', error);
    res.status(500).json({ error: 'Failed to assign service request' });
  }
});

/**
 * @route   PATCH /api/admin/service-requests/:requestId/status
 * @desc    Update service request status
 * @access  Super Admin
 */
router.patch('/service-requests/:requestId/status', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, note } = req.body;

    const validStatuses = ['PENDING_ADMIN_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const serviceRequest = await ServiceRequest.findOne({ serviceRequestId: requestId });
    if (!serviceRequest) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    const previousStatus = serviceRequest.status;
    serviceRequest.status = status;
    serviceRequest.statusHistory.push({
      status,
      changedBy: req.user.userId,
      changedAt: new Date(),
      note: note || `Status changed to ${status}`
    });

    if (status === 'COMPLETED') {
      serviceRequest.completedAt = new Date();
    }

    await serviceRequest.save();

    // Auto-create VAS commission when service request reaches COMPLETED
    if (status === 'COMPLETED' && serviceRequest.assignedAgent) {
      try {
        const commissionService = require('../services/commissionService');
        await commissionService.createVASCommission(serviceRequest, req.user.userId);
      } catch (commError) {
        console.error('Commission creation error (non-blocking):', commError.message);
      }
    }

    // Audit log
    await logAudit(
      req.user.userId,
      'service_request_status_changed',
      'serviceRequest',
      requestId,
      { previousStatus, newStatus: status, note },
      req
    );

    res.json({ message: 'Status updated successfully', serviceRequest });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

/**
 * @route   GET /api/admin/pending-assignments
 * @desc    Get pending assignments for dashboard
 * @access  Super Admin
 */
router.get('/pending-assignments', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const pendingRequests = await ServiceRequest.find({ status: 'PENDING_ADMIN_ASSIGNMENT' })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const enrichedRequests = await Promise.all(
      pendingRequests.map(async (request) => {
        const student = await Student.findOne({ studentId: request.studentId }).lean();
        const studentUser = student ? await User.findOne({ userId: student.userId }).select('-password').lean() : null;
        return {
          ...request,
          requestId: request.serviceRequestId,
          student: { ...student, user: studentUser }
        };
      })
    );

    res.json({ pendingAssignments: enrichedRequests });
  } catch (error) {
    console.error('Get pending assignments error:', error);
    res.status(500).json({ error: 'Failed to fetch pending assignments' });
  }
});

/**
 * @route   GET /api/admin/commissions
 * @desc    Get all commissions
 * @access  Super Admin
 */
router.get('/commissions', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status) filter.status = status;

    const commissions = await Commission.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Commission.countDocuments(filter);

    // Get summary
    const summary = await Commission.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      }
    ]);

    const summaryObj = {
      pending: { count: 0, total: 0 },
      approved: { count: 0, total: 0 },
      paid: { count: 0, total: 0 }
    };

    summary.forEach(s => {
      summaryObj[s._id] = { count: s.count, total: s.total };
    });

    res.json({
      commissions,
      summary: summaryObj,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get commissions error:', error);
    res.status(500).json({ error: 'Failed to fetch commissions' });
  }
});

/**
 * @route   PUT /api/admin/commissions/:commissionId/approve
 * @desc    Approve commission
 * @access  Super Admin
 */
router.put('/commissions/:commissionId/approve', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { commissionId } = req.params;
    const commission = await Commission.findOne({ commissionId });
    if (!commission) return res.status(404).json({ error: 'Commission not found' });
    if (commission.status !== 'pending') return res.status(400).json({ error: 'Commission is not in pending status' });

    const { generateInvoiceNumber, updateAgentEarnings } = require('../services/commissionService');

    commission.status = 'approved';
    commission.approvedBy = req.user.userId;
    commission.approvedAt = new Date();
    commission.invoiceNumber = await generateInvoiceNumber();
    commission.statusHistory.push({
      status: 'approved',
      changedBy: req.user.userId,
      changedAt: new Date(),
      note: 'Approved by admin'
    });
    await commission.save();
    await updateAgentEarnings(commission.agentId);

    await logAudit(req.user.userId, 'commission_approved', 'commission', commissionId, { amount: commission.amount, agentId: commission.agentId }, req);

    const notification = new Notification({
      notificationId: uuidv4(),
      recipientId: commission.agentId,
      type: 'COMMISSION_CREDITED',
      title: 'Commission Approved',
      message: `Your commission of $${commission.amount.toFixed(2)} has been approved. Invoice: ${commission.invoiceNumber}`,
      channel: 'BOTH',
      metadata: { commissionId }
    });
    await notification.save();
    emitToUser(commission.agentId, 'new_notification', notification);
    emitToUser(commission.agentId, 'commission_approved', commission);

    res.json({ message: 'Commission approved', commission });
  } catch (error) {
    console.error('Approve commission error:', error);
    res.status(500).json({ error: 'Failed to approve commission' });
  }
});

/**
 * @route   PUT /api/admin/commissions/:commissionId/reject
 * @desc    Reject commission
 * @access  Super Admin
 */
router.put('/commissions/:commissionId/reject', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { commissionId } = req.params;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });

    const commission = await Commission.findOne({ commissionId });
    if (!commission) return res.status(404).json({ error: 'Commission not found' });
    if (commission.status !== 'pending') return res.status(400).json({ error: 'Only pending commissions can be rejected' });

    const { updateAgentEarnings } = require('../services/commissionService');

    commission.status = 'rejected';
    commission.rejectedBy = req.user.userId;
    commission.rejectedAt = new Date();
    commission.rejectionReason = reason;
    commission.statusHistory.push({
      status: 'rejected',
      changedBy: req.user.userId,
      changedAt: new Date(),
      note: `Rejected: ${reason}`
    });
    await commission.save();
    await updateAgentEarnings(commission.agentId);

    await logAudit(req.user.userId, 'commission_rejected', 'commission', commissionId, { amount: commission.amount, reason }, req);

    const notification = new Notification({
      notificationId: uuidv4(),
      recipientId: commission.agentId,
      type: 'COMMISSION_REJECTED',
      title: 'Commission Rejected',
      message: `Your commission of $${commission.amount.toFixed(2)} has been rejected. Reason: ${reason}`,
      channel: 'BOTH',
      priority: 'HIGH',
      metadata: { commissionId }
    });
    await notification.save();
    emitToUser(commission.agentId, 'new_notification', notification);

    res.json({ message: 'Commission rejected', commission });
  } catch (error) {
    console.error('Reject commission error:', error);
    res.status(500).json({ error: 'Failed to reject commission' });
  }
});

/**
 * @route   POST /api/admin/commissions/:commissionId/payout
 * @desc    Process commission payout (mark as paid)
 * @access  Super Admin
 */
router.post('/commissions/:commissionId/payout', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { commissionId } = req.params;
    const { externalReference } = req.body;

    const commission = await Commission.findOne({ commissionId });
    if (!commission) return res.status(404).json({ error: 'Commission not found' });
    if (commission.status !== 'approved') return res.status(400).json({ error: 'Commission must be approved before payout' });

    const { generateInvoiceNumber, updateAgentEarnings } = require('../services/commissionService');

    commission.status = 'paid';
    commission.paidAt = new Date();
    commission.processedBy = req.user.userId;
    commission.payoutReference = externalReference || '';
    if (!commission.invoiceNumber) {
      commission.invoiceNumber = await generateInvoiceNumber();
    }
    commission.statusHistory.push({
      status: 'paid',
      changedBy: req.user.userId,
      changedAt: new Date(),
      note: 'Payout processed by admin'
    });
    await commission.save();
    await updateAgentEarnings(commission.agentId);

    await logAudit(req.user.userId, 'commission_paid', 'commission', commissionId, { amount: commission.amount, agentId: commission.agentId }, req);

    const notification = new Notification({
      notificationId: uuidv4(),
      recipientId: commission.agentId,
      type: 'COMMISSION_CREDITED',
      title: 'Commission Paid',
      message: `Your commission of $${commission.amount.toFixed(2)} has been paid to your account`,
      channel: 'BOTH',
      metadata: { commissionId }
    });
    await notification.save();
    emitToUser(commission.agentId, 'new_notification', notification);
    emitToUser(commission.agentId, 'commission_paid', commission);

    res.json({ message: 'Commission payout processed', commission });
  } catch (error) {
    console.error('Process payout error:', error);
    res.status(500).json({ error: 'Failed to process payout' });
  }
});

/**
 * @route   POST /api/admin/commissions/create
 * @desc    Manually create a commission
 * @access  Super Admin
 */
router.post('/commissions/create', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { agentId, studentId, amount, commissionType, description, applicationId, serviceRequestId, universityName, serviceType, baseAmount, percentage } = req.body;

    if (!agentId || !studentId || !amount || !commissionType) {
      return res.status(400).json({ error: 'agentId, studentId, amount, and commissionType are required' });
    }

    const agent = await User.findOne({ userId: agentId, role: 'agent' });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const commission = new Commission({
      commissionId: uuidv4(),
      agentId,
      studentId,
      commissionType,
      applicationId,
      serviceRequestId,
      universityName,
      serviceType,
      baseAmount: baseAmount || amount,
      percentage: percentage || agent.commissionPercentage || 10,
      amount,
      currency: 'USD',
      status: 'approved',
      approvedBy: req.user.userId,
      approvedAt: new Date(),
      description: description || 'Manually created by admin',
      adminNotes: `Created by admin ${req.user.userId}`,
      statusHistory: [
        { status: 'pending', changedBy: req.user.userId, changedAt: new Date(), note: 'Manual commission created' },
        { status: 'approved', changedBy: req.user.userId, changedAt: new Date(), note: 'Auto-approved (admin created)' }
      ]
    });

    const { generateInvoiceNumber, updateAgentEarnings } = require('../services/commissionService');
    commission.invoiceNumber = await generateInvoiceNumber();
    await commission.save();
    await updateAgentEarnings(agentId);

    await logAudit(req.user.userId, 'commission_created', 'commission', commission.commissionId, { amount, agentId, manual: true }, req);

    const notification = new Notification({
      notificationId: uuidv4(),
      recipientId: agentId,
      type: 'COMMISSION_EARNED',
      title: 'New Commission Added',
      message: `A commission of $${amount.toFixed(2)} has been added to your account`,
      channel: 'BOTH',
      metadata: { commissionId: commission.commissionId }
    });
    await notification.save();
    emitToUser(agentId, 'new_notification', notification);

    res.json({ message: 'Commission created successfully', commission });
  } catch (error) {
    console.error('Create commission error:', error);
    res.status(500).json({ error: 'Failed to create commission' });
  }
});

/**
 * @route   POST /api/admin/commissions/bulk-approve
 * @desc    Bulk approve pending commissions
 * @access  Super Admin
 */
router.post('/commissions/bulk-approve', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { commissionIds } = req.body;
    if (!commissionIds || !Array.isArray(commissionIds) || commissionIds.length === 0) {
      return res.status(400).json({ error: 'commissionIds array is required' });
    }

    const { generateInvoiceNumber, updateAgentEarnings } = require('../services/commissionService');
    const results = { approved: 0, skipped: 0, errors: [] };
    const affectedAgents = new Set();

    for (const commissionId of commissionIds) {
      try {
        const commission = await Commission.findOne({ commissionId, status: 'pending' });
        if (!commission) { results.skipped++; continue; }

        commission.status = 'approved';
        commission.approvedBy = req.user.userId;
        commission.approvedAt = new Date();
        commission.invoiceNumber = await generateInvoiceNumber();
        commission.statusHistory.push({
          status: 'approved',
          changedBy: req.user.userId,
          changedAt: new Date(),
          note: 'Bulk approved by admin'
        });
        await commission.save();
        affectedAgents.add(commission.agentId);
        results.approved++;

        // Notify agent
        const notification = new Notification({
          notificationId: uuidv4(),
          recipientId: commission.agentId,
          type: 'COMMISSION_CREDITED',
          title: 'Commission Approved',
          message: `Your commission of $${commission.amount.toFixed(2)} has been approved`,
          channel: 'DASHBOARD'
        });
        await notification.save();
        emitToUser(commission.agentId, 'new_notification', notification);
      } catch (e) {
        results.errors.push({ commissionId, error: e.message });
      }
    }

    // Update earnings for all affected agents
    for (const agentId of affectedAgents) {
      await updateAgentEarnings(agentId);
    }

    await logAudit(req.user.userId, 'commissions_bulk_approved', 'commission', null, { count: results.approved }, req);
    res.json({ message: `${results.approved} commissions approved`, results });
  } catch (error) {
    console.error('Bulk approve error:', error);
    res.status(500).json({ error: 'Failed to bulk approve commissions' });
  }
});

// =============================================================================
// PAYOUT MANAGEMENT (Admin)
// =============================================================================

const Payout = require('../models/Payout');

/**
 * @route   GET /api/admin/payouts
 * @desc    Get all payout requests
 * @access  Super Admin
 */
router.get('/payouts', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { status, agentId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (status) query.status = status;
    if (agentId) query.agentId = agentId;

    const [payouts, total] = await Promise.all([
      Payout.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Payout.countDocuments(query)
    ]);

    // Enrich with agent names
    const enrichedPayouts = await Promise.all(payouts.map(async (p) => {
      const agent = await User.findOne({ userId: p.agentId }).select('firstName lastName email').lean();
      return { ...p, agent };
    }));

    res.json({
      payouts: enrichedPayouts,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('Get payouts error:', error);
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

/**
 * @route   POST /api/admin/payouts/:payoutId/process
 * @desc    Process a payout request (mark as completed, pay linked commissions)
 * @access  Super Admin
 */
router.post('/payouts/:payoutId/process', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { payoutId } = req.params;
    const { externalReference, note } = req.body;

    const payout = await Payout.findOne({ payoutId });
    if (!payout) return res.status(404).json({ error: 'Payout not found' });
    if (payout.status !== 'requested' && payout.status !== 'processing') {
      return res.status(400).json({ error: 'Payout is not in a processable state' });
    }

    const { generateInvoiceNumber, updateAgentEarnings } = require('../services/commissionService');

    payout.status = 'completed';
    payout.processedAt = new Date();
    payout.processedBy = req.user.userId;
    payout.externalReference = externalReference || '';
    payout.adminNote = note || '';
    payout.invoiceNumber = `FLY8-PAY-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    payout.statusHistory.push({
      status: 'completed',
      changedBy: req.user.userId,
      changedAt: new Date(),
      note: note || 'Payout processed'
    });
    await payout.save();

    // Mark all linked commissions as paid
    for (const commissionId of payout.commissionIds) {
      const commission = await Commission.findOne({ commissionId });
      if (commission && commission.status === 'approved') {
        commission.status = 'paid';
        commission.paidAt = new Date();
        commission.processedBy = req.user.userId;
        commission.payoutReference = payout.payoutId;
        if (!commission.invoiceNumber) {
          commission.invoiceNumber = await generateInvoiceNumber();
        }
        commission.statusHistory.push({
          status: 'paid',
          changedBy: req.user.userId,
          changedAt: new Date(),
          note: `Paid via payout ${payout.payoutId}`
        });
        await commission.save();
      }
    }

    await updateAgentEarnings(payout.agentId);

    await logAudit(req.user.userId, 'payout_processed', 'payout', payoutId, { amount: payout.amount, agentId: payout.agentId }, req);

    // Notify agent
    const notification = new Notification({
      notificationId: uuidv4(),
      recipientId: payout.agentId,
      type: 'PAYOUT_COMPLETED',
      title: 'Payout Processed',
      message: `Your payout of $${payout.amount.toFixed(2)} has been processed`,
      channel: 'BOTH',
      priority: 'HIGH'
    });
    await notification.save();
    emitToUser(payout.agentId, 'new_notification', notification);
    emitToUser(payout.agentId, 'payout_completed', payout);

    res.json({ message: 'Payout processed successfully', payout });
  } catch (error) {
    console.error('Process payout error:', error);
    res.status(500).json({ error: 'Failed to process payout' });
  }
});

/**
 * @route   POST /api/admin/payouts/:payoutId/reject
 * @desc    Reject a payout request
 * @access  Super Admin
 */
router.post('/payouts/:payoutId/reject', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { payoutId } = req.params;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });

    const payout = await Payout.findOne({ payoutId });
    if (!payout) return res.status(404).json({ error: 'Payout not found' });
    if (payout.status !== 'requested') return res.status(400).json({ error: 'Only requested payouts can be rejected' });

    payout.status = 'failed';
    payout.failureReason = reason;
    payout.statusHistory.push({
      status: 'failed',
      changedBy: req.user.userId,
      changedAt: new Date(),
      note: `Rejected: ${reason}`
    });
    await payout.save();

    await logAudit(req.user.userId, 'payout_rejected', 'payout', payoutId, { amount: payout.amount, reason }, req);

    const notification = new Notification({
      notificationId: uuidv4(),
      recipientId: payout.agentId,
      type: 'PAYOUT_FAILED',
      title: 'Payout Request Rejected',
      message: `Your payout request of $${payout.amount.toFixed(2)} was rejected. Reason: ${reason}`,
      channel: 'BOTH',
      priority: 'HIGH'
    });
    await notification.save();
    emitToUser(payout.agentId, 'new_notification', notification);

    res.json({ message: 'Payout request rejected', payout });
  } catch (error) {
    console.error('Reject payout error:', error);
    res.status(500).json({ error: 'Failed to reject payout' });
  }
});

// ============================================
// ADMIN NOTIFICATION MANAGEMENT ROUTES
// ============================================

/**
 * @route   GET /api/admin/notifications/stats
 * @desc    Get notification statistics
 * @access  Super Admin
 */
router.get('/notifications/stats', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const stats = await notificationService.getNotificationStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notification statistics' });
  }
});

/**
 * @route   GET /api/admin/notifications
 * @desc    Get all notifications (admin view)
 * @access  Super Admin
 */
router.get('/notifications', authMiddleware, roleMiddleware('super_admin'), validate(adminNotificationSchemas.query, 'query'), async (req, res) => {
  try {
    const result = await notificationService.getAllNotificationsAdmin(req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Get all notifications error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

/**
 * @route   GET /api/admin/notifications/:notificationId
 * @desc    Get single notification details
 * @access  Super Admin
 */
router.get('/notifications/:notificationId', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await notificationService.getNotificationById(notificationId);

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, notification });
  } catch (error) {
    console.error('Get notification by ID error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notification' });
  }
});

/**
 * @route   POST /api/admin/notifications
 * @desc    Create and send notification
 * @access  Super Admin
 */
router.post('/notifications', authMiddleware, roleMiddleware('super_admin'), validate(adminNotificationSchemas.create, 'body'), async (req, res) => {
  try {
    const result = await notificationService.createAdminNotification(req.body, req.user.userId);

    // Audit log
    await logAudit(
      req.user.userId,
      'notification_created',
      'notification',
      result.notificationIds[0] || 'bulk',
      {
        targetType: req.body.targetType,
        targetRole: req.body.targetRole,
        recipientCount: result.total,
        title: req.body.title
      },
      req
    );

    res.status(201).json({
      success: true,
      message: `Notification sent to ${result.total} recipient(s)`,
      stats: result
    });
  } catch (error) {
    console.error('Create notification error:', error);
    if (error.message === 'No active recipients found for the specified criteria') {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to create notification' });
  }
});

/**
 * @route   PATCH /api/admin/notifications/:notificationId
 * @desc    Update notification (archive/unarchive)
 * @access  Super Admin
 */
router.patch('/notifications/:notificationId', authMiddleware, roleMiddleware('super_admin'), validate(adminNotificationSchemas.update, 'body'), async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { isArchived } = req.body;

    let notification;
    if (isArchived) {
      notification = await notificationService.archiveNotification(notificationId, req.user.userId);
    } else {
      notification = await notificationService.unarchiveNotification(notificationId);
    }

    res.json({
      success: true,
      message: `Notification ${isArchived ? 'archived' : 'unarchived'} successfully`,
      notification
    });
  } catch (error) {
    console.error('Update notification error:', error);
    if (error.message === 'Notification not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to update notification' });
  }
});

/**
 * @route   DELETE /api/admin/notifications/:notificationId
 * @desc    Delete notification permanently
 * @access  Super Admin
 */
router.delete('/notifications/:notificationId', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { notificationId } = req.params;
    await notificationService.deleteNotification(notificationId);

    // Audit log
    await logAudit(
      req.user.userId,
      'notification_deleted',
      'notification',
      notificationId,
      {},
      req
    );

    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Delete notification error:', error);
    if (error.message === 'Notification not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to delete notification' });
  }
});

/**
 * @route   POST /api/admin/notifications/bulk
 * @desc    Bulk actions on notifications
 * @access  Super Admin
 */
router.post('/notifications/bulk', authMiddleware, roleMiddleware('super_admin'), validate(adminNotificationSchemas.bulkAction, 'body'), async (req, res) => {
  try {
    const { notificationIds, action } = req.body;
    const result = await notificationService.bulkAction(notificationIds, action, req.user.userId);

    // Audit log
    await logAudit(
      req.user.userId,
      `notifications_bulk_${action}`,
      'notification',
      'bulk',
      { count: notificationIds.length, action },
      req
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} notification(s) ${action}d successfully`,
      result
    });
  } catch (error) {
    console.error('Bulk action error:', error);
    res.status(500).json({ success: false, error: 'Failed to perform bulk action' });
  }
});

/**
 * @route   GET /api/admin/users/recipients
 * @desc    Get available recipients for notification targeting
 * @access  Super Admin
 */
router.get('/users/recipients', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const result = await notificationService.getAvailableRecipients(req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Get recipients error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch recipients' });
  }
});

// =============================================================================
// AGENT SERVICE REQUEST APPROVAL ENDPOINTS
// =============================================================================

/**
 * @route   GET /api/admin/agent-requests/pending-count
 * @desc    Get count of pending agent requests (for dashboard badge)
 * @access  Super Admin
 * NOTE: This route MUST be defined BEFORE /agent-requests/:requestId routes
 */
router.get('/agent-requests/pending-count', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const count = await ServiceRequest.countDocuments({
      isAgentInitiated: true,
      agentApprovalStatus: 'PENDING_APPROVAL'
    });

    res.json({ success: true, count });
  } catch (error) {
    console.error('Get pending count error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pending count' });
  }
});

/**
 * @route   GET /api/admin/agent-requests
 * @desc    Get all agent-initiated service requests (pending, approved, rejected)
 * @access  Super Admin
 */
router.get('/agent-requests', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // Build filter for agent-initiated requests only
    const filter = { isAgentInitiated: true };

    // Filter by approval status if provided
    if (status && status !== 'all') {
      filter.agentApprovalStatus = status;
    }

    const serviceRequests = await ServiceRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await ServiceRequest.countDocuments(filter);

    // Get counts by status for dashboard
    const statusCounts = await ServiceRequest.aggregate([
      { $match: { isAgentInitiated: true } },
      { $group: { _id: '$agentApprovalStatus', count: { $sum: 1 } } }
    ]);

    const counts = {
      pending: 0,
      approved: 0,
      rejected: 0
    };
    statusCounts.forEach(s => {
      if (s._id === 'PENDING_APPROVAL') counts.pending = s.count;
      else if (s._id === 'APPROVED') counts.approved = s.count;
      else if (s._id === 'REJECTED') counts.rejected = s.count;
    });

    // Enrich with student and agent data
    const enrichedRequests = await Promise.all(
      serviceRequests.map(async (request) => {
        // Get student data
        const student = await Student.findOne({ studentId: request.studentId }).lean();
        const studentUser = student
          ? await User.findOne({ userId: student.userId }).select('-password').lean()
          : null;

        // Get agent data
        const agent = request.assignedAgent
          ? await User.findOne({ userId: request.assignedAgent }).select('-password').lean()
          : null;

        // Get approver data if approved/rejected
        const approver = request.approvedBy
          ? await User.findOne({ userId: request.approvedBy }).select('firstName lastName').lean()
          : null;

        return {
          ...request,
          student: studentUser ? {
            studentId: student?.studentId,
            firstName: studentUser.firstName,
            lastName: studentUser.lastName,
            email: studentUser.email,
            avatar: studentUser.avatar,
            institution: student?.institution,
            country: studentUser.country || student?.country
          } : null,
          agent: agent ? {
            userId: agent.userId,
            firstName: agent.firstName,
            lastName: agent.lastName,
            email: agent.email,
            avatar: agent.avatar
          } : null,
          approver: approver ? {
            firstName: approver.firstName,
            lastName: approver.lastName
          } : null
        };
      })
    );

    res.json({
      success: true,
      requests: enrichedRequests,
      counts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get agent requests error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch agent requests' });
  }
});

/**
 * @route   POST /api/admin/agent-requests/:requestId/approve
 * @desc    Approve an agent-initiated service request
 * @access  Super Admin
 */
router.post('/agent-requests/:requestId/approve', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { notes } = req.body;
    const adminId = req.user.userId;

    const serviceRequest = await ServiceRequest.findOne({
      serviceRequestId: requestId,
      isAgentInitiated: true
    });

    if (!serviceRequest) {
      return res.status(404).json({ success: false, error: 'Agent service request not found' });
    }

    if (serviceRequest.agentApprovalStatus !== 'PENDING_APPROVAL') {
      return res.status(400).json({
        success: false,
        error: `Request has already been ${serviceRequest.agentApprovalStatus.toLowerCase()}`
      });
    }

    // Update approval status
    serviceRequest.agentApprovalStatus = 'APPROVED';
    serviceRequest.approvedBy = adminId;
    serviceRequest.approvedAt = new Date();
    serviceRequest.approvalNotes = notes || '';
    serviceRequest.progress = 5; // Set initial progress now that it's approved

    // Add to status history
    serviceRequest.statusHistory = serviceRequest.statusHistory || [];
    serviceRequest.statusHistory.push({
      status: 'AGENT_REQUEST_APPROVED',
      changedBy: adminId,
      changedAt: new Date(),
      note: notes || 'Agent service request approved by Super Admin'
    });

    await serviceRequest.save();

    // Get agent and student details for notifications
    const agent = await User.findOne({ userId: serviceRequest.assignedAgent });
    const student = await Student.findOne({ studentId: serviceRequest.studentId });
    const studentUser = student ? await User.findOne({ userId: student.userId }) : null;

    // Notify the agent
    if (agent) {
      const notification = new Notification({
        notificationId: uuidv4(),
        recipientId: agent.userId,
        type: 'AGENT_REQUEST_APPROVED',
        title: 'Service Request Approved',
        message: `Your ${serviceRequest.serviceType.replace(/_/g, ' ')} request for ${studentUser?.firstName || 'student'} has been approved. You can now manage the service workflow.`,
        channel: 'BOTH',
        priority: 'HIGH',
        actionUrl: `/agent/service-requests/${serviceRequest.serviceRequestId}`,
        metadata: {
          serviceRequestId: serviceRequest.serviceRequestId,
          studentId: serviceRequest.studentId,
          serviceType: serviceRequest.serviceType
        }
      });
      await notification.save();
      emitToUser(agent.userId, 'new_notification', notification);
      emitToUser(agent.userId, 'agent_request_approved', {
        serviceRequestId: serviceRequest.serviceRequestId
      });
    }

    // Notify the student
    if (studentUser) {
      const studentNotification = new Notification({
        notificationId: uuidv4(),
        recipientId: studentUser.userId,
        type: 'SERVICE_REQUEST_APPROVED',
        title: 'Service Request Approved',
        message: `Your ${serviceRequest.serviceType.replace(/_/g, ' ')} service request has been approved and is now being processed.`,
        channel: 'BOTH',
        priority: 'NORMAL',
        metadata: {
          serviceRequestId: serviceRequest.serviceRequestId,
          serviceType: serviceRequest.serviceType
        }
      });
      await studentNotification.save();
      emitToUser(studentUser.userId, 'new_notification', studentNotification);
    }

    // Audit log
    await logAudit(
      adminId,
      'agent_request_approved',
      'service_request',
      requestId,
      {
        agentId: serviceRequest.assignedAgent,
        studentId: serviceRequest.studentId,
        serviceType: serviceRequest.serviceType,
        notes
      },
      req
    );

    res.json({
      success: true,
      message: 'Agent service request approved successfully',
      serviceRequest
    });
  } catch (error) {
    console.error('Approve agent request error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve agent request' });
  }
});

/**
 * @route   POST /api/admin/agent-requests/:requestId/reject
 * @desc    Reject an agent-initiated service request
 * @access  Super Admin
 */
router.post('/agent-requests/:requestId/reject', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;
    const adminId = req.user.userId;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required' });
    }

    const serviceRequest = await ServiceRequest.findOne({
      serviceRequestId: requestId,
      isAgentInitiated: true
    });

    if (!serviceRequest) {
      return res.status(404).json({ success: false, error: 'Agent service request not found' });
    }

    if (serviceRequest.agentApprovalStatus !== 'PENDING_APPROVAL') {
      return res.status(400).json({
        success: false,
        error: `Request has already been ${serviceRequest.agentApprovalStatus.toLowerCase()}`
      });
    }

    // Update approval status
    serviceRequest.agentApprovalStatus = 'REJECTED';
    serviceRequest.approvedBy = adminId;
    serviceRequest.rejectedAt = new Date();
    serviceRequest.approvalNotes = reason;
    serviceRequest.status = 'CANCELLED';

    // Add to status history
    serviceRequest.statusHistory = serviceRequest.statusHistory || [];
    serviceRequest.statusHistory.push({
      status: 'AGENT_REQUEST_REJECTED',
      changedBy: adminId,
      changedAt: new Date(),
      note: `Rejected: ${reason}`
    });

    await serviceRequest.save();

    // Get agent and student details for notifications
    const agent = await User.findOne({ userId: serviceRequest.assignedAgent });
    const student = await Student.findOne({ studentId: serviceRequest.studentId });
    const studentUser = student ? await User.findOne({ userId: student.userId }) : null;

    // Notify the agent
    if (agent) {
      const notification = new Notification({
        notificationId: uuidv4(),
        recipientId: agent.userId,
        type: 'AGENT_REQUEST_REJECTED',
        title: 'Service Request Rejected',
        message: `Your ${serviceRequest.serviceType.replace(/_/g, ' ')} request for ${studentUser?.firstName || 'student'} has been rejected. Reason: ${reason}`,
        channel: 'BOTH',
        priority: 'HIGH',
        metadata: {
          serviceRequestId: serviceRequest.serviceRequestId,
          studentId: serviceRequest.studentId,
          serviceType: serviceRequest.serviceType,
          reason
        }
      });
      await notification.save();
      emitToUser(agent.userId, 'new_notification', notification);
      emitToUser(agent.userId, 'agent_request_rejected', {
        serviceRequestId: serviceRequest.serviceRequestId,
        reason
      });
    }

    // Notify the student
    if (studentUser) {
      const studentNotification = new Notification({
        notificationId: uuidv4(),
        recipientId: studentUser.userId,
        type: 'SERVICE_REQUEST_REJECTED',
        title: 'Service Request Not Approved',
        message: `The ${serviceRequest.serviceType.replace(/_/g, ' ')} service request could not be processed at this time.`,
        channel: 'BOTH',
        priority: 'NORMAL',
        metadata: {
          serviceRequestId: serviceRequest.serviceRequestId,
          serviceType: serviceRequest.serviceType
        }
      });
      await studentNotification.save();
      emitToUser(studentUser.userId, 'new_notification', studentNotification);
    }

    // Audit log
    await logAudit(
      adminId,
      'agent_request_rejected',
      'service_request',
      requestId,
      {
        agentId: serviceRequest.assignedAgent,
        studentId: serviceRequest.studentId,
        serviceType: serviceRequest.serviceType,
        reason
      },
      req
    );

    res.json({
      success: true,
      message: 'Agent service request rejected',
      serviceRequest
    });
  } catch (error) {
    console.error('Reject agent request error:', error);
    res.status(500).json({ success: false, error: 'Failed to reject agent request' });
  }
});

module.exports = router;
