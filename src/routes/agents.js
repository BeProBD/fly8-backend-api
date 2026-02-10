const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const Student = require('../models/Student');
const ServiceApplication = require('../models/ServiceApplication');
const ServiceRequest = require('../models/ServiceRequest');
const Task = require('../models/Task');
const Commission = require('../models/Commission');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { logAudit } = require('../utils/auditLogger');
const { emitToUser, emitToRole } = require('../socket/socketManager');
const StudentNote = require('../models/StudentNote');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/fileUpload');

/**
 * @route   GET /api/agents/dashboard
 * @desc    Get agent dashboard data
 * @access  Agent
 */
router.get('/dashboard', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const agentId = req.user.userId;

    // Get assigned students count
    const referredStudents = await Student.countDocuments({ assignedAgent: agentId });

    // Get active applications
    const activeApplications = await ServiceRequest.countDocuments({
      assignedAgent: agentId,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }
    });

    // Get commission stats
    const commissions = await Commission.find({ agentId });
    const totalCommission = commissions
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + c.amount, 0);
    const pendingCommission = commissions
      .filter(c => c.status === 'pending' || c.status === 'approved')
      .reduce((sum, c) => sum + c.amount, 0);

    // Get recent referrals
    const recentStudents = await Student.find({ assignedAgent: agentId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const referrals = await Promise.all(
      recentStudents.map(async (student) => {
        const user = await User.findOne({ userId: student.userId }).select('-password').lean();
        const commission = await Commission.findOne({ studentId: student.studentId, agentId }).lean();
        return {
          id: student.studentId,
          student: user,
          service: 'Service Request',
          commission: commission?.amount || 0,
          status: commission?.status || 'pending',
          date: student.createdAt
        };
      })
    );

    res.json({
      stats: {
        referredStudents,
        activeApplications,
        totalCommission,
        pendingCommission
      },
      referrals
    });
  } catch (error) {
    console.error('Agent dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get assigned students (for agents)
router.get('/my-students', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const students = await Student.find({ assignedAgent: req.user.userId });
    
    const studentsWithDetails = [];
    for (const student of students) {
      const user = await User.findOne({ userId: student.userId }).select('-password');
      const applications = await ServiceApplication.find({ 
        studentId: student.studentId,
        assignedAgent: req.user.userId 
      });
      
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

// Get commission data
router.get('/commissions', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const commissions = await Commission.find({ agentId: req.user.userId });
    
    const totalPending = commissions
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + c.amount, 0);
    
    const totalApproved = commissions
      .filter(c => c.status === 'approved')
      .reduce((sum, c) => sum + c.amount, 0);
    
    const totalPaid = commissions
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + c.amount, 0);

    res.json({
      commissions,
      summary: {
        totalPending,
        totalApproved,
        totalPaid,
        lifetimeEarnings: totalPaid,
        totalCommissions: commissions.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch commissions' });
  }
});

// Request commission payout
router.post('/commissions/:commissionId/request-payout', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { commissionId } = req.params;
    
    const commission = await Commission.findOne({ 
      commissionId,
      agentId: req.user.userId 
    });

    if (!commission) {
      return res.status(404).json({ error: 'Commission not found' });
    }

    if (commission.status !== 'approved') {
      return res.status(400).json({ error: 'Commission must be approved before payout' });
    }

    // In production, integrate with Stripe Connect or bank transfer
    commission.status = 'paid';
    commission.paidAt = new Date();
    await commission.save();

    await logAudit(
      req.user.userId,
      'commission_paid',
      'commission',
      commissionId,
      { amount: commission.amount },
      req
    );

    emitToUser(req.user.userId, 'commission_paid', commission);

    res.json({ message: 'Payout processed', commission });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process payout' });
  }
});

/**
 * @route   GET /api/agents/students
 * @desc    Get all students with agent involvement
 * @access  Agent
 */
router.get('/students', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const students = await Student.find({ assignedAgent: req.user.userId })
      .sort({ createdAt: -1 })
      .lean();

    const studentsWithDetails = await Promise.all(
      students.map(async (student) => {
        const user = await User.findOne({ userId: student.userId }).select('-password').lean();
        const serviceRequests = await ServiceRequest.find({
          studentId: student.studentId
        }).lean();
        const commission = await Commission.findOne({
          studentId: student.studentId,
          agentId: req.user.userId
        }).lean();

        return {
          ...student,
          user,
          serviceRequests,
          totalCommission: commission?.amount || 0,
          status: serviceRequests.length > 0 ? 'active' : 'pending'
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
 * @route   GET /api/agents/students/list
 * @desc    Get list of students for filtering (dropdown data)
 * @access  Agent
 * NOTE: This route MUST be defined BEFORE /students/:studentId to avoid Express catching "list" as a param
 */
router.get('/students/list', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const agentId = req.user.userId;

    const students = await Student.find({ assignedAgent: agentId })
      .select('studentId userId')
      .lean();

    const studentsList = await Promise.all(
      students.map(async (student) => {
        const user = await User.findOne({ userId: student.userId })
          .select('firstName lastName email avatar')
          .lean();
        return {
          studentId: student.studentId,
          firstName: user?.firstName || '',
          lastName: user?.lastName || '',
          email: user?.email || '',
          avatar: user?.avatar || ''
        };
      })
    );

    res.json({ students: studentsList });
  } catch (error) {
    console.error('Get students list error:', error);
    res.status(500).json({ error: 'Failed to fetch students list' });
  }
});

// =============================================================================
// STUDENT PROFILE MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * @route   GET /api/agents/students/:studentId
 * @desc    Get full student details with aggregated metrics
 * @access  Agent
 */
router.get('/students/:studentId', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const agentId = req.user.userId;

    // Verify agent has access to this student
    const student = await Student.findOne({ studentId, assignedAgent: agentId }).lean();
    if (!student) {
      return res.status(404).json({ error: 'Student not found or not assigned to you' });
    }

    // Get user data
    const user = await User.findOne({ userId: student.userId }).select('-password').lean();

    // Get service requests
    const serviceRequests = await ServiceRequest.find({ studentId }).lean();

    // Get applied service types (unique, non-cancelled)
    const appliedServices = [...new Set(
      serviceRequests
        .filter(sr => sr.status !== 'CANCELLED')
        .map(sr => sr.serviceType)
    )];

    // Get latest note
    const latestNote = await StudentNote.findOne({ studentId })
      .sort({ createdAt: -1 })
      .lean();

    // Count documents
    const documents = student.documents || {};
    const documentCount = Object.values(documents).filter(Boolean).length;

    // Calculate service metrics
    const serviceMetrics = {
      applied: serviceRequests.filter(sr => sr.status !== 'CANCELLED').length,
      inProgress: serviceRequests.filter(sr => ['ASSIGNED', 'IN_PROGRESS', 'WAITING_STUDENT'].includes(sr.status)).length,
      completed: serviceRequests.filter(sr => sr.status === 'COMPLETED').length
    };

    res.json({
      student: {
        ...student,
        firstName: user?.firstName,
        lastName: user?.lastName,
        email: user?.email,
        phone: user?.phone,
        avatar: user?.avatar,
        country: user?.country || student.country,
        appliedServices,
        serviceRequests,
        latestNote,
        documentCount,
        serviceMetrics
      }
    });
  } catch (error) {
    console.error('Get student details error:', error);
    res.status(500).json({ error: 'Failed to fetch student details' });
  }
});

/**
 * @route   PUT /api/agents/students/:studentId
 * @desc    Update student profile (personal and academic info)
 * @access  Agent
 */
router.put('/students/:studentId', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const agentId = req.user.userId;

    // Verify access
    const student = await Student.findOne({ studentId, assignedAgent: agentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found or not assigned to you' });
    }

    const {
      // User fields
      firstName,
      lastName,
      phone,
      country,
      // Student fields
      age,
      currentEducationLevel,
      fieldOfStudy,
      gpa,
      graduationYear,
      institution,
      ielts,
      toefl,
      gre,
      preferredCountries,
      preferredDegreeLevel,
      budget,
      careerGoals,
      industry,
      workLocation,
      interestedCountries
    } = req.body;

    // Update User fields if provided
    const userUpdate = {};
    if (firstName) userUpdate.firstName = firstName;
    if (lastName) userUpdate.lastName = lastName;
    if (phone !== undefined) userUpdate.phone = phone;
    if (country) userUpdate.country = country;

    if (Object.keys(userUpdate).length > 0) {
      await User.findOneAndUpdate({ userId: student.userId }, userUpdate);
    }

    // Update Student fields
    const studentUpdate = {};
    if (age !== undefined) studentUpdate.age = age;
    if (currentEducationLevel) studentUpdate.currentEducationLevel = currentEducationLevel;
    if (fieldOfStudy !== undefined) studentUpdate.fieldOfStudy = fieldOfStudy;
    if (gpa !== undefined) studentUpdate.gpa = gpa;
    if (graduationYear !== undefined) studentUpdate.graduationYear = graduationYear;
    if (institution !== undefined) studentUpdate.institution = institution;
    if (ielts !== undefined) studentUpdate.ielts = ielts;
    if (toefl !== undefined) studentUpdate.toefl = toefl;
    if (gre !== undefined) studentUpdate.gre = gre;
    if (preferredCountries) studentUpdate.preferredCountries = preferredCountries;
    if (preferredDegreeLevel !== undefined) studentUpdate.preferredDegreeLevel = preferredDegreeLevel;
    if (budget !== undefined) studentUpdate.budget = budget;
    if (careerGoals !== undefined) studentUpdate.careerGoals = careerGoals;
    if (industry) studentUpdate.industry = industry;
    if (workLocation) studentUpdate.workLocation = workLocation;
    if (interestedCountries) studentUpdate.interestedCountries = interestedCountries;

    const updatedStudent = await Student.findOneAndUpdate(
      { studentId },
      studentUpdate,
      { new: true }
    ).lean();

    // Get updated user data
    const updatedUser = await User.findOne({ userId: student.userId }).select('-password').lean();

    await logAudit(
      agentId,
      'student_profile_updated',
      'student',
      studentId,
      { ...userUpdate, ...studentUpdate },
      req
    );

    res.json({
      message: 'Profile updated successfully',
      student: {
        ...updatedStudent,
        firstName: updatedUser?.firstName,
        lastName: updatedUser?.lastName,
        email: updatedUser?.email,
        phone: updatedUser?.phone,
        avatar: updatedUser?.avatar,
        country: updatedUser?.country || updatedStudent.country
      }
    });
  } catch (error) {
    console.error('Update student profile error:', error);
    res.status(500).json({ error: 'Failed to update student profile' });
  }
});

/**
 * @route   POST /api/agents/students/:studentId/apply-service
 * @desc    Apply a service for a student (creates ServiceRequest)
 * @access  Agent
 */
router.post('/students/:studentId/apply-service', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { serviceType } = req.body;
    const agentId = req.user.userId;

    if (!serviceType) {
      return res.status(400).json({ error: 'serviceType is required' });
    }

    // Validate service type
    const validServiceTypes = [
      'PROFILE_ASSESSMENT',
      'UNIVERSITY_SHORTLISTING',
      'APPLICATION_ASSISTANCE',
      'VISA_GUIDANCE',
      'SCHOLARSHIP_SEARCH',
      'LOAN_ASSISTANCE',
      'ACCOMMODATION_HELP',
      'PRE_DEPARTURE_ORIENTATION'
    ];

    if (!validServiceTypes.includes(serviceType)) {
      return res.status(400).json({ error: 'Invalid service type' });
    }

    // Verify agent has access to this student
    const student = await Student.findOne({ studentId, assignedAgent: agentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found or not assigned to you' });
    }

    // Check if service already applied (and not cancelled)
    const existingRequest = await ServiceRequest.findOne({
      studentId,
      serviceType,
      status: { $nin: ['CANCELLED'] }
    });

    if (existingRequest) {
      return res.status(400).json({
        error: 'This service has already been applied for this student',
        existingRequestId: existingRequest.serviceRequestId
      });
    }

    // Create service request with agent-initiated workflow
    // Agent-initiated requests require Super Admin approval before agent can access
    const serviceRequest = new ServiceRequest({
      serviceRequestId: uuidv4(),
      studentId,
      serviceType,
      status: 'PENDING_ADMIN_ASSIGNMENT',
      assignedAgent: agentId,
      appliedAt: new Date(),
      progress: 0, // Start at 0 until approved
      priority: 'MEDIUM',
      // Agent-initiated specific fields
      isAgentInitiated: true,
      agentApprovalStatus: 'PENDING_APPROVAL',
      metadata: {
        appliedBy: 'agent',
        agentId,
        agentName: `${req.user.firstName} ${req.user.lastName}`,
        requiresApproval: true
      },
      statusHistory: [{
        status: 'PENDING_ADMIN_ASSIGNMENT',
        changedBy: agentId,
        changedAt: new Date(),
        note: 'Service applied by agent - awaiting Super Admin approval'
      }],
      notes: [],
      documents: []
    });

    await serviceRequest.save();

    // Update student's selectedServices
    if (!student.selectedServices) {
      student.selectedServices = [];
    }
    if (!student.selectedServices.includes(serviceType)) {
      student.selectedServices.push(serviceType);
      await student.save();
    }

    // Get student details for notification
    const studentUser = await User.findOne({ userId: student.userId });
    const studentName = studentUser ? `${studentUser.firstName} ${studentUser.lastName}` : 'a student';

    // Notify super admins - this is an agent request requiring approval
    const superAdmins = await User.find({ role: 'super_admin', isActive: true });
    for (const admin of superAdmins) {
      const notification = new Notification({
        notificationId: uuidv4(),
        recipientId: admin.userId,
        type: 'AGENT_SERVICE_REQUEST_PENDING',
        title: 'Agent Service Request - Approval Required',
        message: `Agent ${req.user.firstName} ${req.user.lastName} requested ${serviceType.replace(/_/g, ' ')} service for ${studentName}. Approval required.`,
        channel: 'BOTH',
        priority: 'HIGH',
        metadata: {
          studentId,
          studentName,
          serviceType,
          agentId,
          agentName: `${req.user.firstName} ${req.user.lastName}`,
          serviceRequestId: serviceRequest.serviceRequestId,
          requiresApproval: true
        }
      });
      await notification.save();
      emitToUser(admin.userId, 'new_notification', notification);
      emitToUser(admin.userId, 'agent_request_pending', {
        serviceRequestId: serviceRequest.serviceRequestId,
        agentId,
        studentId,
        serviceType
      });
    }

    // Notify the student
    if (studentUser) {
      const studentNotification = new Notification({
        notificationId: uuidv4(),
        recipientId: student.userId,
        type: 'SERVICE_REQUEST_CREATED',
        title: 'Service Applied for You',
        message: `A ${serviceType.replace(/_/g, ' ').toLowerCase()} service has been requested for you by your agent. Pending admin approval.`,
        channel: 'BOTH',
        priority: 'NORMAL',
        metadata: {
          serviceRequestId: serviceRequest.serviceRequestId,
          serviceType,
          status: 'pending_approval'
        }
      });
      await studentNotification.save();
      emitToUser(student.userId, 'new_notification', studentNotification);
    }

    await logAudit(
      agentId,
      'service_applied_for_student',
      'service_request',
      serviceRequest.serviceRequestId,
      { studentId, serviceType },
      req
    );

    res.status(201).json({
      message: 'Service request submitted successfully. Awaiting Super Admin approval.',
      serviceRequest,
      requiresApproval: true
    });
  } catch (error) {
    console.error('Apply service for student error:', error);
    res.status(500).json({ error: 'Failed to apply service' });
  }
});

/**
 * @route   GET /api/agents/students/:studentId/notes
 * @desc    Get all notes for a student
 * @access  Agent
 */
router.get('/students/:studentId/notes', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const agentId = req.user.userId;

    // Verify agent has access to this student
    const student = await Student.findOne({ studentId, assignedAgent: agentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found or not assigned to you' });
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
 * @route   POST /api/agents/students/:studentId/notes
 * @desc    Add a note for a student
 * @access  Agent
 */
router.post('/students/:studentId/notes', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { text } = req.body;
    const agentId = req.user.userId;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Note text is required' });
    }

    // Verify agent has access to this student
    const student = await Student.findOne({ studentId, assignedAgent: agentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found or not assigned to you' });
    }

    // Create note
    const note = new StudentNote({
      noteId: uuidv4(),
      studentId,
      authorId: agentId,
      authorRole: 'agent',
      text: text.trim()
    });

    await note.save();

    // Get author details for response
    const author = {
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      avatar: req.user.avatar,
      role: 'agent'
    };

    // Notify super admins about new note
    const superAdmins = await User.find({ role: 'super_admin', isActive: true });
    for (const admin of superAdmins) {
      const notification = new Notification({
        notificationId: uuidv4(),
        recipientId: admin.userId,
        type: 'GENERAL',
        title: 'New Student Note from Agent',
        message: `Agent ${req.user.firstName} ${req.user.lastName} added a note about a student`,
        channel: 'DASHBOARD',
        priority: 'NORMAL',
        metadata: { studentId, noteId: note.noteId, agentId }
      });
      await notification.save();
      emitToUser(admin.userId, 'student_note_added', { studentId, noteId: note.noteId });
    }

    await logAudit(
      agentId,
      'student_note_added',
      'student_note',
      note.noteId,
      { studentId, text: text.substring(0, 100) },
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
 * @route   POST /api/agents/students/:studentId/documents
 * @desc    Upload a document for a student
 * @access  Agent
 */
router.post('/students/:studentId/documents', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { documentType } = req.body;
    const agentId = req.user.userId;

    const validDocumentTypes = ['transcripts', 'testScores', 'sop', 'recommendation', 'resume', 'passport'];
    if (!validDocumentTypes.includes(documentType)) {
      return res.status(400).json({ error: 'Invalid document type. Valid types: ' + validDocumentTypes.join(', ') });
    }

    // Verify agent has access to this student
    const student = await Student.findOne({ studentId, assignedAgent: agentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found or not assigned to you' });
    }

    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const file = req.files.file;

    // Upload to Cloudinary
    const result = await uploadToCloudinary(file, {
      folder: `fly8/students/${student.userId}/documents`
    });

    // Update student document field
    if (!student.documents) {
      student.documents = {};
    }
    student.documents[documentType] = result.url;
    await student.save();

    await logAudit(
      agentId,
      'agent_uploaded_student_document',
      'student',
      studentId,
      { documentType, url: result.url },
      req
    );

    res.json({
      message: 'Document uploaded successfully',
      document: {
        type: documentType,
        url: result.url,
        publicId: result.publicId
      }
    });
  } catch (error) {
    console.error('Upload student document error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

/**
 * @route   DELETE /api/agents/students/:studentId/documents/:documentType
 * @desc    Delete a document for a student
 * @access  Agent
 */
router.delete('/students/:studentId/documents/:documentType', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { studentId, documentType } = req.params;
    const agentId = req.user.userId;

    const validDocumentTypes = ['transcripts', 'testScores', 'sop', 'recommendation', 'resume', 'passport'];
    if (!validDocumentTypes.includes(documentType)) {
      return res.status(400).json({ error: 'Invalid document type' });
    }

    // Verify agent has access to this student
    const student = await Student.findOne({ studentId, assignedAgent: agentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found or not assigned to you' });
    }

    // Check if document exists
    if (!student.documents || !student.documents[documentType]) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Remove document reference
    student.documents[documentType] = null;
    await student.save();

    await logAudit(
      agentId,
      'agent_deleted_student_document',
      'student',
      studentId,
      { documentType },
      req
    );

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete student document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

/**
 * @route   POST /api/agents/refer-student
 * @desc    Refer a new student
 * @access  Agent
 */
router.post('/refer-student', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { firstName, lastName, email, phone, country, destinationCountry, interestedServices, notes } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required' });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    // Create user account for the student
    const userId = uuidv4();
    const tempPassword = Math.random().toString(36).slice(-8); // Temporary password

    const user = new User({
      userId,
      email: email.toLowerCase(),
      password: tempPassword,
      firstName,
      lastName,
      phone: phone || '',
      country: country || '',
      role: 'student',
      avatar: `https://api.dicebear.com/5.x/initials/svg?seed=${firstName} ${lastName}`,
      isActive: true
    });
    await user.save();

    // Create student record
    const studentId = uuidv4();
    const student = new Student({
      studentId,
      userId,
      country: country || '',
      interestedCountries: destinationCountry ? [destinationCountry] : [],
      selectedServices: interestedServices || [],
      assignedAgent: req.user.userId,
      referredBy: req.user.userId,
      referralNotes: notes || '',
      onboardingCompleted: false,
      createdAt: new Date()
    });
    await student.save();

    // Audit log
    await logAudit(
      req.user.userId,
      'student_referred',
      'student',
      studentId,
      { email, firstName, lastName, referredBy: req.user.userId },
      req
    );

    // Notify super admins
    const notification = new Notification({
      notificationId: uuidv4(),
      recipientId: 'admin',
      type: 'GENERAL',
      title: 'New Student Referral',
      message: `Agent ${req.user.firstName} ${req.user.lastName} referred a new student: ${firstName} ${lastName}`,
      channel: 'DASHBOARD',
      metadata: { studentId, agentId: req.user.userId }
    });
    await notification.save();
    emitToRole('super_admin', 'new_notification', notification);

    res.status(201).json({
      message: 'Student referred successfully',
      student: { ...student.toObject(), user: { ...user.toObject(), password: undefined } }
    });
  } catch (error) {
    console.error('Refer student error:', error);
    res.status(500).json({ error: 'Failed to refer student' });
  }
});

/**
 * @route   GET /api/agents/commission-stats
 * @desc    Get commission statistics
 * @access  Agent
 */
router.get('/commission-stats', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const agentId = req.user.userId;

    const commissions = await Commission.find({ agentId });

    const paidCommissions = commissions.filter(c => c.status === 'paid');
    const pendingCommissions = commissions.filter(c => c.status === 'pending' || c.status === 'approved');

    // This month's earnings
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthPaid = paidCommissions
      .filter(c => new Date(c.paidAt) >= startOfMonth)
      .reduce((sum, c) => sum + c.amount, 0);

    // Last month's earnings for growth calculation
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastMonthPaid = paidCommissions
      .filter(c => {
        const paidDate = new Date(c.paidAt);
        return paidDate >= startOfLastMonth && paidDate <= endOfLastMonth;
      })
      .reduce((sum, c) => sum + c.amount, 0);

    // Calculate growth percentage
    const growth = lastMonthPaid > 0
      ? Math.round(((thisMonthPaid - lastMonthPaid) / lastMonthPaid) * 100)
      : thisMonthPaid > 0 ? 100 : 0;

    res.json({
      stats: {
        totalEarnings: paidCommissions.reduce((sum, c) => sum + c.amount, 0),
        pendingAmount: pendingCommissions.reduce((sum, c) => sum + c.amount, 0),
        paidAmount: paidCommissions.reduce((sum, c) => sum + c.amount, 0),
        thisMonth: thisMonthPaid,
        growth
      }
    });
  } catch (error) {
    console.error('Commission stats error:', error);
    res.status(500).json({ error: 'Failed to fetch commission stats' });
  }
});

/**
 * @route   GET /api/agents/commission-history
 * @desc    Get commission history with breakdown
 * @access  Agent
 */
router.get('/commission-history', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const agentId = req.user.userId;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const commissions = await Commission.find({ agentId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Commission.countDocuments({ agentId });

    // Enrich with student data
    const transactions = await Promise.all(
      commissions.map(async (commission) => {
        const student = await Student.findOne({ studentId: commission.studentId }).lean();
        const user = student ? await User.findOne({ userId: student.userId }).select('-password').lean() : null;
        return {
          id: commission.commissionId,
          student: user,
          service: commission.serviceType || 'Service Request',
          amount: commission.amount,
          status: commission.status,
          paidAt: commission.paidAt,
          createdAt: commission.createdAt
        };
      })
    );

    // Calculate breakdown by service type
    const allCommissions = await Commission.find({ agentId });
    const serviceBreakdown = {};

    allCommissions.forEach(c => {
      const service = c.serviceType || 'Other Services';
      if (!serviceBreakdown[service]) {
        serviceBreakdown[service] = { count: 0, total: 0 };
      }
      serviceBreakdown[service].count++;
      serviceBreakdown[service].total += c.amount;
    });

    const totalAmount = allCommissions.reduce((sum, c) => sum + c.amount, 0);
    const breakdown = Object.entries(serviceBreakdown).map(([service, data]) => ({
      service,
      count: data.count,
      total: data.total,
      percentage: totalAmount > 0 ? Math.round((data.total / totalAmount) * 100) : 0
    })).sort((a, b) => b.total - a.total);

    res.json({
      transactions,
      breakdown,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Commission history error:', error);
    res.status(500).json({ error: 'Failed to fetch commission history' });
  }
});

/**
 * @route   GET /api/agents/earnings
 * @desc    Get earnings summary
 * @access  Agent
 */
router.get('/earnings', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const agentId = req.user.userId;

    const commissions = await Commission.find({ agentId });

    const earnings = {
      total: commissions.reduce((sum, c) => sum + c.amount, 0),
      pending: commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0),
      approved: commissions.filter(c => c.status === 'approved').reduce((sum, c) => sum + c.amount, 0),
      paid: commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.amount, 0)
    };

    res.json({ earnings });
  } catch (error) {
    console.error('Earnings error:', error);
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
});

/**
 * @route   GET /api/agents/service-requests
 * @desc    Get service requests assigned to agent
 * @access  Agent
 */
router.get('/service-requests', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const agentId = req.user.userId;
    const { status, page = 1, limit = 20 } = req.query;

    const query = { assignedAgent: agentId };
    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const serviceRequests = await ServiceRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await ServiceRequest.countDocuments(query);

    // Enrich with student and counselor data
    const enrichedRequests = await Promise.all(
      serviceRequests.map(async (request) => {
        const student = await Student.findOne({ studentId: request.studentId }).lean();
        const studentUser = student ? await User.findOne({ userId: student.userId }).select('-password').lean() : null;

        let counselor = null;
        if (request.assignedCounselor) {
          counselor = await User.findOne({ userId: request.assignedCounselor }).select('-password').lean();
        }

        return {
          ...request,
          student: studentUser ? { ...student, user: studentUser, firstName: studentUser.firstName, lastName: studentUser.lastName, email: studentUser.email } : null,
          assignedCounselor: counselor
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
    console.error('Agent service requests error:', error);
    res.status(500).json({ error: 'Failed to fetch service requests' });
  }
});

/**
 * @route   PATCH /api/agents/service-requests/:requestId/progress
 * @desc    Update service request progress (agent)
 * @access  Agent
 */
router.patch('/service-requests/:requestId/progress', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, note } = req.body;

    const serviceRequest = await ServiceRequest.findOne({
      serviceRequestId: requestId,
      assignedAgent: req.user.userId
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
 * @route   POST /api/agents/service-requests/:requestId/notes
 * @desc    Add note to service request (agent)
 * @access  Agent
 */
router.post('/service-requests/:requestId/notes', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { text, isInternal = false } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Note text is required' });
    }

    const serviceRequest = await ServiceRequest.findOne({
      serviceRequestId: requestId,
      assignedAgent: req.user.userId
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

// =============================================================================
// CASE PIPELINE ENDPOINTS (Service Requests as Cases)
// =============================================================================

/**
 * @route   GET /api/agents/cases/pipeline
 * @desc    Get service requests grouped by status (Pipeline View)
 * @access  Agent
 */
router.get('/cases/pipeline', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const agentId = req.user.userId;

    // Get all service requests for this agent
    const serviceRequests = await ServiceRequest.find({ assignedAgent: agentId })
      .sort({ priority: -1, deadline: 1, createdAt: -1 })
      .lean();

    // Enrich with student data and task counts
    const enrichedRequests = await Promise.all(
      serviceRequests.map(async (request) => {
        const student = await Student.findOne({ studentId: request.studentId }).lean();
        const studentUser = student
          ? await User.findOne({ userId: student.userId }).select('firstName lastName email avatar phone').lean()
          : null;

        const taskCount = await Task.countDocuments({ serviceRequestId: request.serviceRequestId });
        const completedTaskCount = await Task.countDocuments({
          serviceRequestId: request.serviceRequestId,
          status: 'COMPLETED'
        });

        return {
          ...request,
          student: studentUser ? {
            ...student,
            firstName: studentUser.firstName,
            lastName: studentUser.lastName,
            email: studentUser.email,
            avatar: studentUser.avatar,
            phone: studentUser.phone
          } : null,
          taskStats: {
            total: taskCount,
            completed: completedTaskCount,
            percentage: taskCount > 0 ? Math.round((completedTaskCount / taskCount) * 100) : 0
          }
        };
      })
    );

    // Group by status for pipeline view
    const pipeline = {
      ASSIGNED: enrichedRequests.filter(r => r.status === 'ASSIGNED'),
      IN_PROGRESS: enrichedRequests.filter(r => r.status === 'IN_PROGRESS'),
      WAITING_STUDENT: enrichedRequests.filter(r => r.status === 'WAITING_STUDENT'),
      COMPLETED: enrichedRequests.filter(r => r.status === 'COMPLETED'),
      ON_HOLD: enrichedRequests.filter(r => r.status === 'ON_HOLD')
    };

    // Calculate stats
    const stats = {
      total: enrichedRequests.length,
      assigned: pipeline.ASSIGNED.length,
      inProgress: pipeline.IN_PROGRESS.length,
      waitingStudent: pipeline.WAITING_STUDENT.length,
      completed: pipeline.COMPLETED.length,
      onHold: pipeline.ON_HOLD.length,
      overdue: enrichedRequests.filter(r =>
        r.deadline && new Date(r.deadline) < new Date() && r.status !== 'COMPLETED'
      ).length,
      highPriority: enrichedRequests.filter(r =>
        (r.priority === 'HIGH' || r.priority === 'URGENT') && r.status !== 'COMPLETED'
      ).length
    };

    res.json({ pipeline, stats, all: enrichedRequests });
  } catch (error) {
    console.error('Agent pipeline error:', error);
    res.status(500).json({ error: 'Failed to fetch case pipeline' });
  }
});

/**
 * @route   GET /api/agents/cases/:id
 * @desc    Get full case details (Case File)
 * @access  Agent
 */
router.get('/cases/:id', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { id } = req.params;
    const agentId = req.user.userId;

    // Build query - only use serviceRequestId to avoid ObjectId cast errors
    const serviceRequest = await ServiceRequest.findOne({
      serviceRequestId: id,
      assignedAgent: agentId
    }).lean();

    if (!serviceRequest) {
      return res.status(404).json({ error: 'Case not found or not assigned to you' });
    }

    // ACCESS CONTROL: Allow read-only viewing of agent-initiated requests (even if pending/rejected)
    // Modification endpoints (status update, progress update, task creation) still block unapproved requests
    const isPendingApproval = serviceRequest.isAgentInitiated && serviceRequest.agentApprovalStatus !== 'APPROVED';

    // Get student with full profile
    let studentData = null;
    if (serviceRequest.studentId) {
      const student = await Student.findOne({ studentId: serviceRequest.studentId }).lean();
      if (student) {
        const studentUser = await User.findOne({ userId: student.userId }).select('-password').lean();
        if (studentUser) {
          studentData = {
            ...student,
            firstName: studentUser.firstName,
            lastName: studentUser.lastName,
            email: studentUser.email,
            phone: studentUser.phone,
            avatar: studentUser.avatar,
            country: studentUser.country || student.country
          };
        } else {
          studentData = student;
        }
      }
    }

    // Get all tasks for this case
    const tasks = await Task.find({ serviceRequestId: serviceRequest.serviceRequestId })
      .sort({ priority: -1, dueDate: 1, createdAt: -1 })
      .lean();

    // Get counselor info if assigned
    let counselor = null;
    if (serviceRequest.assignedCounselor) {
      counselor = await User.findOne({ userId: serviceRequest.assignedCounselor })
        .select('firstName lastName email avatar')
        .lean();
    }

    // Calculate task statistics
    const taskStats = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'PENDING').length,
      inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
      submitted: tasks.filter(t => t.status === 'SUBMITTED').length,
      underReview: tasks.filter(t => t.status === 'UNDER_REVIEW').length,
      revisionRequired: tasks.filter(t => t.status === 'REVISION_REQUIRED').length,
      completed: tasks.filter(t => t.status === 'COMPLETED').length,
      overdue: tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETED').length
    };

    // Ensure progress and priority have defaults for older records
    const caseData = {
      ...serviceRequest,
      progress: serviceRequest.progress ?? 0,
      priority: serviceRequest.priority || 'MEDIUM',
      student: studentData,
      counselor,
      tasks,
      taskStats,
      // Flag for frontend to show read-only view when pending approval
      isPendingApproval
    };

    res.json({ case: caseData });
  } catch (error) {
    console.error('Get case details error:', error);
    res.status(500).json({ error: 'Failed to fetch case details', details: error.message });
  }
});

/**
 * @route   PATCH /api/agents/cases/:id/status
 * @desc    Update case status with history logging
 * @access  Agent
 */
router.patch('/cases/:id/status', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const agentId = req.user.userId;

    console.log('[STATUS UPDATE] Starting - caseId:', id, 'status:', status, 'agentId:', agentId);

    const validStatuses = ['ASSIGNED', 'IN_PROGRESS', 'WAITING_STUDENT', 'ON_HOLD', 'COMPLETED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Valid values: ' + validStatuses.join(', ') });
    }

    const serviceRequest = await ServiceRequest.findOne({
      serviceRequestId: id,
      assignedAgent: agentId
    });

    if (!serviceRequest) {
      console.log('[STATUS UPDATE] Case not found for id:', id, 'agentId:', agentId);
      return res.status(404).json({ error: 'Case not found or not assigned to you' });
    }

    // ACCESS CONTROL: Check if agent-initiated request is approved
    if (serviceRequest.isAgentInitiated && serviceRequest.agentApprovalStatus !== 'APPROVED') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You cannot modify this service request until it is approved by Super Admin.',
        approvalStatus: serviceRequest.agentApprovalStatus
      });
    }

    console.log('[STATUS UPDATE] Found case, current status:', serviceRequest.status);

    const oldStatus = serviceRequest.status;

    try {
      serviceRequest.updateStatus(status, agentId, note || '');
      console.log('[STATUS UPDATE] updateStatus method completed');
    } catch (methodError) {
      console.error('[STATUS UPDATE] updateStatus method failed:', methodError.message);
      throw methodError;
    }

    try {
      await serviceRequest.save();
      console.log('[STATUS UPDATE] Save completed');
    } catch (saveError) {
      console.error('[STATUS UPDATE] Save failed:', saveError.message);
      throw saveError;
    }

    try {
      await logAudit(
        agentId,
        'case_status_updated',
        'service_request',
        serviceRequest.serviceRequestId,
        { oldStatus, newStatus: status, note },
        req
      );
      console.log('[STATUS UPDATE] Audit logged');
    } catch (auditError) {
      console.error('[STATUS UPDATE] Audit logging failed (non-fatal):', auditError.message);
      // Don't throw - audit failure shouldn't block the operation
    }

    // Notify student of status change (non-blocking)
    try {
      if (serviceRequest.studentId) {
        const student = await Student.findOne({ studentId: serviceRequest.studentId });
        if (student) {
          const notification = new Notification({
            notificationId: uuidv4(),
            recipientId: student.userId,
            type: 'SERVICE_REQUEST_STATUS_CHANGED',
            title: 'Service Request Status Updated',
            message: `Your ${serviceRequest.serviceType.replace(/_/g, ' ').toLowerCase()} request status has been updated to ${status.replace(/_/g, ' ').toLowerCase()}.`,
            channel: 'BOTH',
            metadata: { serviceRequestId: serviceRequest.serviceRequestId, status }
          });
          await notification.save();
          emitToUser(student.userId, 'new_notification', notification);
          console.log('[STATUS UPDATE] Notification sent to student');
        }
      }
    } catch (notifyError) {
      console.error('[STATUS UPDATE] Notification failed (non-fatal):', notifyError.message);
      // Don't throw - notification failure shouldn't block the operation
    }

    console.log('[STATUS UPDATE] Success');
    res.json({ message: 'Status updated successfully', serviceRequest });
  } catch (error) {
    console.error('[STATUS UPDATE] FATAL ERROR:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to update case status', details: error.message });
  }
});

/**
 * @route   PATCH /api/agents/cases/:id/progress
 * @desc    Update case progress percentage
 * @access  Agent
 */
router.patch('/cases/:id/progress', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { id } = req.params;
    const { progress, note } = req.body;
    const agentId = req.user.userId;

    if (progress === undefined || progress < 0 || progress > 100) {
      return res.status(400).json({ error: 'Progress must be between 0 and 100' });
    }

    const serviceRequest = await ServiceRequest.findOne({
      serviceRequestId: id,
      assignedAgent: agentId
    });

    if (!serviceRequest) {
      return res.status(404).json({ error: 'Case not found or not assigned to you' });
    }

    // ACCESS CONTROL: Check if agent-initiated request is approved
    if (serviceRequest.isAgentInitiated && serviceRequest.agentApprovalStatus !== 'APPROVED') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You cannot modify this service request until it is approved by Super Admin.',
        approvalStatus: serviceRequest.agentApprovalStatus
      });
    }

    serviceRequest.updateProgress(progress, agentId, note || '');
    await serviceRequest.save();

    await logAudit(
      agentId,
      'case_progress_updated',
      'service_request',
      serviceRequest.serviceRequestId,
      { progress, note },
      req
    );

    res.json({ message: 'Progress updated successfully', serviceRequest });
  } catch (error) {
    console.error('Update case progress error:', error);
    res.status(500).json({ error: 'Failed to update case progress' });
  }
});

/**
 * @route   PATCH /api/agents/cases/:id/deadline
 * @desc    Update case deadline
 * @access  Agent
 */
router.patch('/cases/:id/deadline', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { id } = req.params;
    const { deadline, note } = req.body;
    const agentId = req.user.userId;

    const serviceRequest = await ServiceRequest.findOne({
      serviceRequestId: id,
      assignedAgent: agentId
    });

    if (!serviceRequest) {
      return res.status(404).json({ error: 'Case not found or not assigned to you' });
    }

    const oldDeadline = serviceRequest.deadline;
    serviceRequest.deadline = deadline ? new Date(deadline) : null;

    // Ensure statusHistory array exists
    if (!serviceRequest.statusHistory) {
      serviceRequest.statusHistory = [];
    }

    serviceRequest.statusHistory.push({
      status: `DEADLINE_UPDATE: ${oldDeadline ? oldDeadline.toISOString() : 'None'} → ${deadline || 'Removed'}`,
      changedBy: agentId,
      changedAt: new Date(),
      note: note || ''
    });

    await serviceRequest.save();

    await logAudit(
      agentId,
      'case_deadline_updated',
      'service_request',
      serviceRequest.serviceRequestId,
      { oldDeadline, newDeadline: deadline, note },
      req
    );

    res.json({ message: 'Deadline updated successfully', serviceRequest });
  } catch (error) {
    console.error('Update case deadline error:', error);
    res.status(500).json({ error: 'Failed to update case deadline' });
  }
});

/**
 * @route   PATCH /api/agents/cases/:id/priority
 * @desc    Update case priority
 * @access  Agent
 */
router.patch('/cases/:id/priority', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { id } = req.params;
    const { priority, note } = req.body;
    const agentId = req.user.userId;

    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority. Valid values: ' + validPriorities.join(', ') });
    }

    const serviceRequest = await ServiceRequest.findOne({
      serviceRequestId: id,
      assignedAgent: agentId
    });

    if (!serviceRequest) {
      return res.status(404).json({ error: 'Case not found or not assigned to you' });
    }

    const oldPriority = serviceRequest.priority;
    serviceRequest.priority = priority;

    // Ensure statusHistory array exists
    if (!serviceRequest.statusHistory) {
      serviceRequest.statusHistory = [];
    }

    serviceRequest.statusHistory.push({
      status: `PRIORITY_UPDATE: ${oldPriority} → ${priority}`,
      changedBy: agentId,
      changedAt: new Date(),
      note: note || ''
    });

    await serviceRequest.save();

    await logAudit(
      agentId,
      'case_priority_updated',
      'service_request',
      serviceRequest.serviceRequestId,
      { oldPriority, newPriority: priority, note },
      req
    );

    res.json({ message: 'Priority updated successfully', serviceRequest });
  } catch (error) {
    console.error('Update case priority error:', error);
    res.status(500).json({ error: 'Failed to update case priority' });
  }
});

// =============================================================================
// WORK QUEUE ENDPOINTS (Tasks)
// =============================================================================

/**
 * @route   GET /api/agents/workqueue
 * @desc    Get all tasks from all cases assigned to agent (Work Queue)
 * @access  Agent
 */
router.get('/workqueue', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const agentId = req.user.userId;
    const { filter, studentId, serviceType, page = 1, limit = 50 } = req.query;

    // First get all service requests assigned to this agent
    const agentServiceRequests = await ServiceRequest.find({ assignedAgent: agentId })
      .select('serviceRequestId studentId serviceType status')
      .lean();

    const serviceRequestIds = agentServiceRequests.map(sr => sr.serviceRequestId);

    // Build task query
    const taskQuery = { serviceRequestId: { $in: serviceRequestIds } };

    // Apply filters
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (filter === 'today') {
      taskQuery.dueDate = { $gte: today, $lt: tomorrow };
      taskQuery.status = { $ne: 'COMPLETED' };
    } else if (filter === 'overdue') {
      taskQuery.dueDate = { $lt: today };
      taskQuery.status = { $ne: 'COMPLETED' };
    } else if (filter === 'completed') {
      taskQuery.status = 'COMPLETED';
    } else if (filter === 'pending') {
      taskQuery.status = { $in: ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUIRED'] };
    }

    // Filter by student if provided
    if (studentId) {
      const studentRequests = agentServiceRequests.filter(sr => sr.studentId === studentId);
      taskQuery.serviceRequestId = { $in: studentRequests.map(sr => sr.serviceRequestId) };
    }

    // Filter by service type if provided
    if (serviceType) {
      const typeRequests = agentServiceRequests.filter(sr => sr.serviceType === serviceType);
      taskQuery.serviceRequestId = { $in: typeRequests.map(sr => sr.serviceRequestId) };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const tasks = await Task.find(taskQuery)
      .sort({ priority: -1, dueDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Task.countDocuments(taskQuery);

    // Enrich tasks with student and service info
    const enrichedTasks = await Promise.all(
      tasks.map(async (task) => {
        const serviceRequest = agentServiceRequests.find(sr => sr.serviceRequestId === task.serviceRequestId);
        let student = null;

        if (serviceRequest?.studentId) {
          const studentRecord = await Student.findOne({ studentId: serviceRequest.studentId }).lean();
          if (studentRecord) {
            const studentUser = await User.findOne({ userId: studentRecord.userId })
              .select('firstName lastName email avatar')
              .lean();
            student = studentUser ? { ...studentRecord, ...studentUser } : null;
          }
        }

        return {
          ...task,
          student,
          serviceType: serviceRequest?.serviceType,
          caseStatus: serviceRequest?.status,
          serviceRequestId: serviceRequest?.serviceRequestId
        };
      })
    );

    // Calculate stats
    const allTasks = await Task.find({ serviceRequestId: { $in: serviceRequestIds } }).lean();
    const stats = {
      total: allTasks.length,
      today: allTasks.filter(t => {
        if (!t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        return dueDate >= today && dueDate < tomorrow && t.status !== 'COMPLETED';
      }).length,
      overdue: allTasks.filter(t =>
        t.dueDate && new Date(t.dueDate) < today && t.status !== 'COMPLETED'
      ).length,
      pending: allTasks.filter(t =>
        ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUIRED'].includes(t.status)
      ).length,
      completed: allTasks.filter(t => t.status === 'COMPLETED').length,
      highPriority: allTasks.filter(t =>
        (t.priority === 'HIGH' || t.priority === 'URGENT') && t.status !== 'COMPLETED'
      ).length
    };

    res.json({
      tasks: enrichedTasks,
      stats,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Agent workqueue error:', error);
    res.status(500).json({ error: 'Failed to fetch work queue' });
  }
});

/**
 * @route   POST /api/agents/cases/:id/tasks
 * @desc    Create a new task for a specific case
 * @access  Agent
 */
router.post('/cases/:id/tasks', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { id } = req.params;
    const { taskType, title, description, instructions, dueDate, priority } = req.body;
    const agentId = req.user.userId;

    // Validate required fields
    if (!taskType || !title || !description) {
      return res.status(400).json({ error: 'taskType, title, and description are required' });
    }

    // Find the service request
    const serviceRequest = await ServiceRequest.findOne({
      serviceRequestId: id,
      assignedAgent: agentId
    });

    if (!serviceRequest) {
      return res.status(404).json({ error: 'Case not found or not assigned to you' });
    }

    // ACCESS CONTROL: Check if agent-initiated request is approved
    if (serviceRequest.isAgentInitiated && serviceRequest.agentApprovalStatus !== 'APPROVED') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You cannot create tasks for this service request until it is approved by Super Admin.',
        approvalStatus: serviceRequest.agentApprovalStatus
      });
    }

    // Get student userId for task assignment
    const student = await Student.findOne({ studentId: serviceRequest.studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found for this case' });
    }

    // Create the task
    const task = new Task({
      taskId: uuidv4(),
      serviceRequestId: serviceRequest.serviceRequestId,
      taskType,
      title,
      description,
      instructions: instructions || '',
      assignedTo: student.userId,
      assignedBy: agentId,
      status: 'PENDING',
      priority: priority || 'MEDIUM',
      dueDate: dueDate ? new Date(dueDate) : null,
      statusHistory: [{
        status: 'PENDING',
        changedBy: agentId,
        changedAt: new Date(),
        note: 'Task created'
      }]
    });

    await task.save();

    // Log audit
    await logAudit(
      agentId,
      'task_created',
      'task',
      task.taskId,
      { serviceRequestId: serviceRequest.serviceRequestId, taskType, title },
      req
    );

    // Notify student
    const notification = new Notification({
      notificationId: uuidv4(),
      recipientId: student.userId,
      type: 'TASK_ASSIGNED',
      title: 'New Task Assigned',
      message: `You have a new task: ${title}`,
      channel: 'BOTH',
      priority: priority === 'URGENT' ? 'URGENT' : 'NORMAL',
      metadata: { taskId: task.taskId, serviceRequestId: serviceRequest.serviceRequestId }
    });
    await notification.save();
    emitToUser(student.userId, 'new_notification', notification);

    res.status(201).json({ message: 'Task created successfully', task });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * @route   PATCH /api/agents/tasks/:taskId/complete
 * @desc    Mark a task as completed
 * @access  Agent
 */
router.patch('/tasks/:taskId/complete', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { taskId } = req.params;
    const { note } = req.body;
    const agentId = req.user.userId;

    // Find task and verify agent has access
    const task = await Task.findOne({ taskId });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify agent is assigned to this case
    const serviceRequest = await ServiceRequest.findOne({
      serviceRequestId: task.serviceRequestId,
      assignedAgent: agentId
    });

    if (!serviceRequest) {
      return res.status(403).json({ error: 'You are not authorized to modify this task' });
    }

    task.updateStatus('COMPLETED', agentId, note || 'Marked as completed by agent');
    await task.save();

    // Check if all tasks are completed to update service request progress
    const allTasks = await Task.find({ serviceRequestId: task.serviceRequestId });
    const completedTasks = allTasks.filter(t => t.status === 'COMPLETED');
    const newProgress = Math.round((completedTasks.length / allTasks.length) * 100);

    if (newProgress > serviceRequest.progress) {
      serviceRequest.updateProgress(newProgress, agentId, 'Auto-updated based on task completion');
      await serviceRequest.save();
    }

    await logAudit(
      agentId,
      'task_completed',
      'task',
      taskId,
      { serviceRequestId: task.serviceRequestId },
      req
    );

    res.json({ message: 'Task marked as completed', task });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

// =============================================================================
// EXPLORE / SERVICE MARKETPLACE ENDPOINTS
// =============================================================================

/**
 * @route   GET /api/agents/explore/service-status
 * @desc    Get service request statuses for all agent's students (for explore page buttons)
 * @access  Agent
 */
router.get('/explore/service-status', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const agentId = req.user.userId;

    // Get all service requests initiated by this agent or assigned to this agent
    const serviceRequests = await ServiceRequest.find({
      $or: [
        { assignedAgent: agentId },
        { isAgentInitiated: true, 'metadata.agentId': agentId }
      ],
      status: { $ne: 'CANCELLED' }
    })
      .select('serviceRequestId studentId serviceType status progress agentApprovalStatus isAgentInitiated deadline createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with student names
    const enrichedRequests = await Promise.all(
      serviceRequests.map(async (sr) => {
        const student = await Student.findOne({ studentId: sr.studentId }).select('userId').lean();
        let studentName = 'Unknown';
        if (student) {
          const user = await User.findOne({ userId: student.userId }).select('firstName lastName').lean();
          if (user) studentName = `${user.firstName} ${user.lastName}`;
        }
        return { ...sr, studentName };
      })
    );

    res.json({ serviceRequests: enrichedRequests });
  } catch (error) {
    console.error('Explore service status error:', error);
    res.status(500).json({ error: 'Failed to fetch service status' });
  }
});

/**
 * @route   POST /api/agents/explore/refer-service
 * @desc    Submit a service request for a student from the explore page (with notes and documents)
 * @access  Agent
 */
router.post('/explore/refer-service', authMiddleware, roleMiddleware('agent'), async (req, res) => {
  try {
    const { studentId, serviceType, notes } = req.body;
    const agentId = req.user.userId;

    if (!studentId || !serviceType) {
      return res.status(400).json({ error: 'studentId and serviceType are required' });
    }

    // Validate service type
    const validServiceTypes = [
      'PROFILE_ASSESSMENT',
      'UNIVERSITY_SHORTLISTING',
      'APPLICATION_ASSISTANCE',
      'VISA_GUIDANCE',
      'SCHOLARSHIP_SEARCH',
      'LOAN_ASSISTANCE',
      'ACCOMMODATION_HELP',
      'PRE_DEPARTURE_ORIENTATION'
    ];

    if (!validServiceTypes.includes(serviceType)) {
      return res.status(400).json({ error: 'Invalid service type' });
    }

    // Verify agent has access to this student
    const student = await Student.findOne({ studentId, assignedAgent: agentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found or not assigned to you' });
    }

    // Check if service already applied (and not cancelled)
    const existingRequest = await ServiceRequest.findOne({
      studentId,
      serviceType,
      status: { $nin: ['CANCELLED'] }
    });

    if (existingRequest) {
      return res.status(400).json({
        error: 'This service has already been requested for this student',
        existingRequestId: existingRequest.serviceRequestId,
        existingStatus: existingRequest.status,
        agentApprovalStatus: existingRequest.agentApprovalStatus
      });
    }

    // Handle document uploads if present
    const documents = [];
    if (req.files) {
      const files = Array.isArray(req.files.documents) ? req.files.documents : req.files.documents ? [req.files.documents] : [];
      for (const file of files) {
        const result = await uploadToCloudinary(file, {
          folder: `fly8/service-requests/${studentId}`
        });
        documents.push({
          name: file.name,
          url: result.url,
          uploadedBy: agentId,
          uploadedAt: new Date()
        });
      }
    }

    // Create service request with agent-initiated workflow
    const serviceRequestNotes = [];
    if (notes && notes.trim()) {
      serviceRequestNotes.push({
        text: notes.trim(),
        addedBy: agentId,
        addedAt: new Date(),
        isInternal: false
      });
    }

    const serviceRequest = new ServiceRequest({
      serviceRequestId: uuidv4(),
      studentId,
      serviceType,
      status: 'PENDING_ADMIN_ASSIGNMENT',
      assignedAgent: agentId,
      appliedAt: new Date(),
      progress: 0,
      priority: 'MEDIUM',
      isAgentInitiated: true,
      agentApprovalStatus: 'PENDING_APPROVAL',
      metadata: {
        appliedBy: 'agent',
        agentId,
        agentName: `${req.user.firstName} ${req.user.lastName}`,
        requiresApproval: true,
        source: 'explore_marketplace'
      },
      statusHistory: [{
        status: 'PENDING_ADMIN_ASSIGNMENT',
        changedBy: agentId,
        changedAt: new Date(),
        note: 'Service referred by agent from marketplace - awaiting Super Admin approval'
      }],
      notes: serviceRequestNotes,
      documents
    });

    await serviceRequest.save();

    // Update student's selectedServices
    if (!student.selectedServices) {
      student.selectedServices = [];
    }
    if (!student.selectedServices.includes(serviceType)) {
      student.selectedServices.push(serviceType);
      await student.save();
    }

    // Get student details for notification
    const studentUser = await User.findOne({ userId: student.userId });
    const studentName = studentUser ? `${studentUser.firstName} ${studentUser.lastName}` : 'a student';

    // Notify super admins
    const superAdmins = await User.find({ role: 'super_admin', isActive: true });
    for (const admin of superAdmins) {
      const notification = new Notification({
        notificationId: uuidv4(),
        recipientId: admin.userId,
        type: 'AGENT_SERVICE_REQUEST_PENDING',
        title: 'Agent Service Request - Approval Required',
        message: `Agent ${req.user.firstName} ${req.user.lastName} referred ${studentName} for ${serviceType.replace(/_/g, ' ')} service. Approval required.`,
        channel: 'BOTH',
        priority: 'HIGH',
        metadata: {
          studentId,
          studentName,
          serviceType,
          agentId,
          agentName: `${req.user.firstName} ${req.user.lastName}`,
          serviceRequestId: serviceRequest.serviceRequestId,
          requiresApproval: true
        }
      });
      await notification.save();
      emitToUser(admin.userId, 'new_notification', notification);
    }

    // Notify the student
    if (studentUser) {
      const studentNotification = new Notification({
        notificationId: uuidv4(),
        recipientId: student.userId,
        type: 'SERVICE_REQUEST_CREATED',
        title: 'Service Referred for You',
        message: `A ${serviceType.replace(/_/g, ' ').toLowerCase()} service has been referred for you by your agent. Pending admin approval.`,
        channel: 'BOTH',
        priority: 'NORMAL',
        metadata: {
          serviceRequestId: serviceRequest.serviceRequestId,
          serviceType,
          status: 'pending_approval'
        }
      });
      await studentNotification.save();
      emitToUser(student.userId, 'new_notification', studentNotification);
    }

    await logAudit(
      agentId,
      'service_applied_for_student',
      'service_request',
      serviceRequest.serviceRequestId,
      { studentId, serviceType, source: 'explore_marketplace' },
      req
    );

    res.status(201).json({
      message: 'Service request submitted successfully. Awaiting Super Admin approval.',
      serviceRequest,
      requiresApproval: true
    });
  } catch (error) {
    console.error('Explore refer service error:', error);
    res.status(500).json({ error: 'Failed to submit service request' });
  }
});

module.exports = router;