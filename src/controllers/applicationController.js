/**
 * Application Controller
 * Handles university application CRUD, status machine, document uploads
 */

const { v4: uuidv4 } = require('uuid');
const Application = require('../models/Application');
const Student = require('../models/Student');
const User = require('../models/User');
const notificationService = require('../services/notificationService');
const { createAuditLog } = require('../utils/auditLogger');
const { validateFile, uploadToCloudinary } = require('../utils/fileUpload');

// ============================================
// AGENT ENDPOINTS
// ============================================

/**
 * Agent creates application for their own student
 * POST /api/v1/admissions/agent/create
 */
const createByAgent = async (req, res) => {
  try {
    const { studentId, universityName, universityCode, programName, programLevel, intake, checklist } = req.body;
    const agentUserId = req.user.userId;

    if (!studentId || !universityName || !programName || !intake) {
      return res.status(400).json({ error: 'studentId, universityName, programName, and intake are required' });
    }

    // Verify student exists
    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Verify student belongs to this agent
    const isOwner =
      student.assignedAgent === agentUserId ||
      student.referredBy === agentUserId;

    if (!isOwner) {
      return res.status(403).json({ error: 'You can only create applications for your own students' });
    }

    const application = new Application({
      applicationId: uuidv4(),
      studentId,
      agentId: agentUserId,
      assignedBy: 'agent',
      universityName,
      universityCode: universityCode || null,
      programName,
      programLevel: programLevel || null,
      intake,
      status: 'Assigned',
      checklist: checklist || [],
      timeline: [
        {
          action: 'Application created by agent',
          by: agentUserId,
          byRole: 'agent',
          date: new Date()
        }
      ]
    });

    await application.save();

    // Notify student
    const studentUser = await User.findOne({ userId: student.userId });
    if (studentUser) {
      try {
        await notificationService.createNotification({
          recipientId: studentUser.userId,
          type: 'APPLICATION_CREATED',
          title: 'New University Application',
          message: `A new application has been created for ${universityName} - ${programName}`,
          channel: 'BOTH',
          priority: 'NORMAL',
          actionUrl: `/dashboard/admissions`,
          actionText: 'View Application',
          relatedEntities: { applicationId: application.applicationId }
        });
      } catch (notifErr) {
        console.error('Notification error (non-blocking):', notifErr.message);
      }
    }

    // Notify admins
    try {
      const admins = await User.find({ role: 'super_admin', isActive: true });
      await Promise.all(
        admins.map(admin =>
          notificationService.createNotification({
            recipientId: admin.userId,
            type: 'APPLICATION_CREATED',
            title: 'New Application Created',
            message: `Agent ${req.user.firstName} ${req.user.lastName} created an application for ${universityName}`,
            channel: 'DASHBOARD',
            priority: 'NORMAL',
            actionUrl: `/admin/admissions`,
            actionText: 'View Applications',
            relatedEntities: { applicationId: application.applicationId }
          })
        )
      );
    } catch (notifErr) {
      console.error('Admin notification error (non-blocking):', notifErr.message);
    }

    // Audit log
    try {
      await createAuditLog({
        actorUserId: agentUserId,
        actorRole: 'agent',
        action: 'application_created',
        entityType: 'application',
        entityId: application.applicationId,
        newState: { status: 'Assigned', universityName, programName },
        req
      });
    } catch (auditErr) {
      console.error('Audit log error (non-blocking):', auditErr.message);
    }

    return res.status(201).json({
      applicationId: application.applicationId,
      studentId: application.studentId,
      universityName: application.universityName,
      programName: application.programName,
      status: application.status,
      createdAt: application.createdAt
    });
  } catch (error) {
    console.error('createByAgent error:', error);
    return res.status(500).json({ error: 'Failed to create application' });
  }
};

/**
 * Get agent's applications (paginated)
 * GET /api/v1/admissions/agent
 */
const getAgentApplications = async (req, res) => {
  try {
    const agentUserId = req.user.userId;
    const { status, intake, university, search, page = 1, limit = 20 } = req.query;

    const filter = { agentId: agentUserId, isDeleted: false };

    if (status) filter.status = status;
    if (intake) filter.intake = { $regex: intake, $options: 'i' };
    if (university) filter.universityName = { $regex: university, $options: 'i' };

    // If search provided, we need to look up student names
    let studentFilter = null;
    if (search) {
      const matchingStudents = await Student.find({
        $or: [
          { 'userId': { $exists: true } }
        ]
      }).select('studentId userId').lean();

      // Get user records that match search
      const matchingUsers = await User.find({
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } }
        ],
        role: 'student'
      }).select('userId').lean();

      const matchingUserIds = matchingUsers.map(u => u.userId);
      const matchingStudentIds = matchingStudents
        .filter(s => matchingUserIds.includes(s.userId))
        .map(s => s.studentId);

      if (matchingStudentIds.length > 0) {
        filter.studentId = { $in: matchingStudentIds };
      } else if (search) {
        // No matching students, return empty
        return res.json({
          data: [],
          pagination: { total: 0, page: Number(page), limit: Number(limit), totalPages: 0 }
        });
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [applications, total] = await Promise.all([
      Application.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Application.countDocuments(filter)
    ]);

    // Enrich with student + user details
    const enriched = await Promise.all(
      applications.map(async (app) => {
        const student = await Student.findOne({ studentId: app.studentId }).select('studentId userId').lean();
        let studentUser = null;
        if (student) {
          studentUser = await User.findOne({ userId: student.userId }).select('firstName lastName email avatar').lean();
        }
        return {
          ...app,
          student: studentUser
            ? { studentId: app.studentId, firstName: studentUser.firstName, lastName: studentUser.lastName, email: studentUser.email, avatar: studentUser.avatar }
            : { studentId: app.studentId }
        };
      })
    );

    return res.json({
      data: enriched,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('getAgentApplications error:', error);
    return res.status(500).json({ error: 'Failed to fetch applications' });
  }
};

/**
 * Get single application by ID (agent)
 * GET /api/v1/admissions/agent/:id
 */
const getAgentApplicationById = async (req, res) => {
  try {
    const { id } = req.params;
    const agentUserId = req.user.userId;

    const application = await Application.findOne({
      applicationId: id,
      isDeleted: false
    }).lean();

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Ownership check
    if (application.agentId !== agentUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Enrich
    const student = await Student.findOne({ studentId: application.studentId }).select('studentId userId').lean();
    let studentUser = null;
    if (student) {
      studentUser = await User.findOne({ userId: student.userId }).select('firstName lastName email avatar phone country').lean();
    }

    const nextStatuses = Application.getNextStatuses(application.status);

    return res.json({
      ...application,
      student: studentUser
        ? { studentId: application.studentId, ...studentUser }
        : { studentId: application.studentId },
      nextStatuses
    });
  } catch (error) {
    console.error('getAgentApplicationById error:', error);
    return res.status(500).json({ error: 'Failed to fetch application' });
  }
};

/**
 * Update application status (agent)
 * PATCH /api/v1/admissions/agent/:id/status
 */
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status: newStatus, subStatus } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role === 'super_admin' ? 'super_admin' : 'agent';

    if (!newStatus) {
      return res.status(400).json({ error: 'New status is required' });
    }

    const application = await Application.findOne({ applicationId: id, isDeleted: false });
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Ownership check for agents
    if (userRole === 'agent' && application.agentId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate transition
    if (!Application.isValidTransition(application.status, newStatus)) {
      return res.status(400).json({
        error: `Invalid status transition from '${application.status}' to '${newStatus}'`,
        allowedTransitions: Application.getNextStatuses(application.status)
      });
    }

    const previousStatus = application.status;
    application.status = newStatus;
    if (subStatus !== undefined) application.subStatus = subStatus;

    // Push to timeline
    application.timeline.push({
      action: `Status changed from '${previousStatus}' to '${newStatus}'`,
      by: userId,
      byRole: userRole,
      date: new Date()
    });

    await application.save();

    // Notify student about status change
    try {
      const student = await Student.findOne({ studentId: application.studentId }).select('userId').lean();
      if (student) {
        await notificationService.createNotification({
          recipientId: student.userId,
          type: 'APPLICATION_STATUS_CHANGED',
          title: 'Application Status Updated',
          message: `Your application to ${application.universityName} is now: ${newStatus}`,
          channel: 'BOTH',
          priority: newStatus === 'Offer Received' ? 'HIGH' : 'NORMAL',
          actionUrl: `/dashboard/admissions`,
          actionText: 'View Application',
          relatedEntities: { applicationId: application.applicationId }
        });
      }
    } catch (notifErr) {
      console.error('Status notification error (non-blocking):', notifErr.message);
    }

    // Audit log
    try {
      await createAuditLog({
        actorUserId: userId,
        actorRole: userRole,
        action: 'application_status_changed',
        entityType: 'application',
        entityId: application.applicationId,
        previousState: { status: previousStatus },
        newState: { status: newStatus },
        req
      });
    } catch (auditErr) {
      console.error('Audit log error (non-blocking):', auditErr.message);
    }

    return res.json({
      applicationId: application.applicationId,
      previousStatus,
      status: application.status,
      nextStatuses: Application.getNextStatuses(application.status)
    });
  } catch (error) {
    console.error('updateStatus error:', error);
    return res.status(500).json({ error: 'Failed to update status' });
  }
};

/**
 * Upload document to application
 * POST /api/v1/admissions/agent/:id/upload-doc  (agent)
 * POST /api/v1/admissions/student/:id/upload-doc (student)
 * POST /api/v1/admissions/admin/:id/upload-doc   (admin)
 */
const uploadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role === 'super_admin' ? 'super_admin' : req.user.role;

    if (!req.files || !req.files.document) {
      return res.status(400).json({ error: 'No file uploaded. Use field name "document".' });
    }

    const application = await Application.findOne({ applicationId: id, isDeleted: false });
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Access check
    if (userRole === 'agent' && application.agentId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (userRole === 'student') {
      const student = await Student.findOne({ studentId: application.studentId, userId });
      if (!student) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const file = req.files.document;

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(file, {
      folder: `fly8/applications/${application.applicationId}`
    });

    if (!result.success) {
      return res.status(500).json({ error: 'File upload failed' });
    }

    const docEntry = {
      docId: uuidv4(),
      name: req.body.docName || file.name,
      url: result.url,
      type: req.body.docType || validation.category,
      uploadedBy: userId,
      uploadedByRole: userRole,
      uploadedAt: new Date()
    };

    application.documents.push(docEntry);

    // Push to timeline
    application.timeline.push({
      action: `Document "${docEntry.name}" uploaded`,
      by: userId,
      byRole: userRole,
      date: new Date()
    });

    await application.save();

    // Notify relevant parties about document upload
    try {
      // If student uploaded, notify agent
      if (userRole === 'student') {
        await notificationService.createNotification({
          recipientId: application.agentId,
          type: 'APPLICATION_DOCUMENT_UPLOADED',
          title: 'Document Uploaded',
          message: `Student uploaded "${docEntry.name}" for ${application.universityName} application`,
          channel: 'DASHBOARD',
          priority: 'NORMAL',
          relatedEntities: { applicationId: application.applicationId }
        });
      }
      // If agent uploaded, notify student
      if (userRole === 'agent') {
        const student = await Student.findOne({ studentId: application.studentId }).select('userId').lean();
        if (student) {
          await notificationService.createNotification({
            recipientId: student.userId,
            type: 'APPLICATION_DOCUMENT_UPLOADED',
            title: 'Document Added',
            message: `A document "${docEntry.name}" has been added to your ${application.universityName} application`,
            channel: 'DASHBOARD',
            priority: 'NORMAL',
            actionUrl: `/dashboard/admissions`,
            relatedEntities: { applicationId: application.applicationId }
          });
        }
      }
    } catch (notifErr) {
      console.error('Document notification error (non-blocking):', notifErr.message);
    }

    // Audit log
    try {
      await createAuditLog({
        actorUserId: userId,
        actorRole: userRole,
        action: 'application_document_uploaded',
        entityType: 'application',
        entityId: application.applicationId,
        details: { documentName: docEntry.name, docId: docEntry.docId },
        req
      });
    } catch (auditErr) {
      console.error('Audit log error (non-blocking):', auditErr.message);
    }

    return res.status(201).json({ document: docEntry });
  } catch (error) {
    console.error('uploadDocument error:', error);
    return res.status(500).json({ error: 'Failed to upload document' });
  }
};

/**
 * Add remark (agent/admin)
 * POST /api/v1/admissions/agent/:id/remark
 */
const addRemark = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role === 'super_admin' ? 'super_admin' : 'agent';

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Remark text is required' });
    }

    const application = await Application.findOne({ applicationId: id, isDeleted: false });
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (userRole === 'agent' && application.agentId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const remark = {
      text: text.trim(),
      by: userId,
      byRole: userRole,
      date: new Date()
    };

    application.remarks.push(remark);
    application.timeline.push({
      action: 'Remark added',
      by: userId,
      byRole: userRole,
      date: new Date()
    });

    await application.save();

    return res.status(201).json({ remark });
  } catch (error) {
    console.error('addRemark error:', error);
    return res.status(500).json({ error: 'Failed to add remark' });
  }
};

/**
 * Update checklist item (agent/admin)
 * PATCH /api/v1/admissions/agent/:id/checklist
 */
const updateChecklist = async (req, res) => {
  try {
    const { id } = req.params;
    const { index, completed, item } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role === 'super_admin' ? 'super_admin' : 'agent';

    const application = await Application.findOne({ applicationId: id, isDeleted: false });
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (userRole === 'agent' && application.agentId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Add new checklist item
    if (item && index === undefined) {
      application.checklist.push({
        item,
        completed: false
      });
      application.timeline.push({
        action: `Checklist item added: "${item}"`,
        by: userId,
        byRole: userRole,
        date: new Date()
      });
    }
    // Toggle existing item
    else if (index !== undefined && index >= 0 && index < application.checklist.length) {
      const checklistItem = application.checklist[index];
      checklistItem.completed = completed !== undefined ? completed : !checklistItem.completed;
      if (checklistItem.completed) {
        checklistItem.completedAt = new Date();
        checklistItem.completedBy = userId;
      } else {
        checklistItem.completedAt = null;
        checklistItem.completedBy = null;
      }
      application.timeline.push({
        action: `Checklist item "${checklistItem.item}" marked as ${checklistItem.completed ? 'completed' : 'incomplete'}`,
        by: userId,
        byRole: userRole,
        date: new Date()
      });
    } else {
      return res.status(400).json({ error: 'Provide either a new item or a valid index' });
    }

    await application.save();

    return res.json({ checklist: application.checklist });
  } catch (error) {
    console.error('updateChecklist error:', error);
    return res.status(500).json({ error: 'Failed to update checklist' });
  }
};

// ============================================
// STUDENT ENDPOINTS
// ============================================

/**
 * Get student's own applications
 * GET /api/v1/admissions/student
 */
const getStudentApplications = async (req, res) => {
  try {
    const studentRecord = req.student;
    if (!studentRecord) {
      return res.status(400).json({ error: 'Student record not found' });
    }

    const { page = 1, limit = 20, status } = req.query;
    const filter = { studentId: studentRecord.studentId, isDeleted: false };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [applications, total] = await Promise.all([
      Application.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Application.countDocuments(filter)
    ]);

    // Enrich with agent name
    const enriched = await Promise.all(
      applications.map(async (app) => {
        const agent = await User.findOne({ userId: app.agentId }).select('firstName lastName').lean();
        return {
          ...app,
          agentName: agent ? `${agent.firstName} ${agent.lastName}` : 'Unknown'
        };
      })
    );

    return res.json({
      data: enriched,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('getStudentApplications error:', error);
    return res.status(500).json({ error: 'Failed to fetch applications' });
  }
};

/**
 * Get single application (student)
 * GET /api/v1/admissions/student/:id
 */
const getStudentApplicationById = async (req, res) => {
  try {
    const { id } = req.params;
    const studentRecord = req.student;

    if (!studentRecord) {
      return res.status(400).json({ error: 'Student record not found' });
    }

    const application = await Application.findOne({
      applicationId: id,
      studentId: studentRecord.studentId,
      isDeleted: false
    }).lean();

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const agent = await User.findOne({ userId: application.agentId }).select('firstName lastName').lean();

    return res.json({
      ...application,
      agentName: agent ? `${agent.firstName} ${agent.lastName}` : 'Unknown'
    });
  } catch (error) {
    console.error('getStudentApplicationById error:', error);
    return res.status(500).json({ error: 'Failed to fetch application' });
  }
};

/**
 * Student accepts offer
 * POST /api/v1/admissions/student/:id/accept-offer
 */
const acceptOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const studentRecord = req.student;

    if (!studentRecord) {
      return res.status(400).json({ error: 'Student record not found' });
    }

    const application = await Application.findOne({
      applicationId: id,
      studentId: studentRecord.studentId,
      isDeleted: false
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.status !== 'Offer Received') {
      return res.status(400).json({
        error: 'Can only accept an offer when status is "Offer Received"',
        currentStatus: application.status
      });
    }

    const previousStatus = application.status;
    application.status = 'Accepted';
    application.timeline.push({
      action: 'Offer accepted by student',
      by: req.user.userId,
      byRole: 'student',
      date: new Date()
    });

    await application.save();

    // Notify agent
    try {
      await notificationService.createNotification({
        recipientId: application.agentId,
        type: 'APPLICATION_STATUS_CHANGED',
        title: 'Offer Accepted',
        message: `Student accepted the offer from ${application.universityName} - ${application.programName}`,
        channel: 'BOTH',
        priority: 'HIGH',
        relatedEntities: { applicationId: application.applicationId }
      });
    } catch (notifErr) {
      console.error('Offer accept notification error (non-blocking):', notifErr.message);
    }

    // Audit log
    try {
      await createAuditLog({
        actorUserId: req.user.userId,
        actorRole: 'student',
        action: 'application_offer_accepted',
        entityType: 'application',
        entityId: application.applicationId,
        previousState: { status: previousStatus },
        newState: { status: 'Accepted' },
        req
      });
    } catch (auditErr) {
      console.error('Audit log error (non-blocking):', auditErr.message);
    }

    return res.json({
      applicationId: application.applicationId,
      previousStatus,
      status: application.status
    });
  } catch (error) {
    console.error('acceptOffer error:', error);
    return res.status(500).json({ error: 'Failed to accept offer' });
  }
};

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * Admin assigns application
 * POST /api/v1/admissions/admin/assign
 */
const assignByAdmin = async (req, res) => {
  try {
    const { studentId, agentId, universityName, universityCode, programName, programLevel, intake, checklist } = req.body;

    if (!studentId || !agentId || !universityName || !programName || !intake) {
      return res.status(400).json({ error: 'studentId, agentId, universityName, programName, and intake are required' });
    }

    // Verify student exists
    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Verify agent exists and is active
    const agent = await User.findOne({ userId: agentId, role: 'agent', isActive: true });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found or inactive' });
    }

    const application = new Application({
      applicationId: uuidv4(),
      studentId,
      agentId,
      assignedBy: 'admin',
      universityName,
      universityCode: universityCode || null,
      programName,
      programLevel: programLevel || null,
      intake,
      status: 'Assigned',
      checklist: checklist || [],
      timeline: [
        {
          action: `Application assigned by admin ${req.user.firstName} ${req.user.lastName}`,
          by: req.user.userId,
          byRole: 'super_admin',
          date: new Date()
        }
      ]
    });

    await application.save();

    // Notify agent
    try {
      await notificationService.createNotification({
        recipientId: agentId,
        type: 'APPLICATION_AGENT_ASSIGNED',
        title: 'New Application Assigned',
        message: `You have been assigned a new application for ${universityName} - ${programName}`,
        channel: 'BOTH',
        priority: 'HIGH',
        actionUrl: `/agent/admissions`,
        actionText: 'View Application',
        relatedEntities: { applicationId: application.applicationId }
      });
    } catch (notifErr) {
      console.error('Agent assignment notification error (non-blocking):', notifErr.message);
    }

    // Notify student
    try {
      const studentUser = await User.findOne({ userId: student.userId });
      if (studentUser) {
        await notificationService.createNotification({
          recipientId: studentUser.userId,
          type: 'APPLICATION_CREATED',
          title: 'New University Application',
          message: `An application has been created for ${universityName} - ${programName}`,
          channel: 'BOTH',
          priority: 'NORMAL',
          actionUrl: `/dashboard/admissions`,
          actionText: 'View Application',
          relatedEntities: { applicationId: application.applicationId }
        });
      }
    } catch (notifErr) {
      console.error('Student notification error (non-blocking):', notifErr.message);
    }

    // Audit log
    try {
      await createAuditLog({
        actorUserId: req.user.userId,
        actorRole: 'super_admin',
        action: 'application_created',
        entityType: 'application',
        entityId: application.applicationId,
        newState: { status: 'Assigned', universityName, programName, agentId },
        req
      });
    } catch (auditErr) {
      console.error('Audit log error (non-blocking):', auditErr.message);
    }

    return res.status(201).json({
      applicationId: application.applicationId,
      studentId: application.studentId,
      agentId: application.agentId,
      universityName: application.universityName,
      programName: application.programName,
      status: application.status,
      createdAt: application.createdAt
    });
  } catch (error) {
    console.error('assignByAdmin error:', error);
    return res.status(500).json({ error: 'Failed to assign application' });
  }
};

/**
 * Get all applications (admin)
 * GET /api/v1/admissions/admin
 */
const getAdminApplications = async (req, res) => {
  try {
    const { status, intake, university, agent, search, page = 1, limit = 20 } = req.query;

    const filter = { isDeleted: false };

    if (status) filter.status = status;
    if (intake) filter.intake = { $regex: intake, $options: 'i' };
    if (university) filter.universityName = { $regex: university, $options: 'i' };
    if (agent) filter.agentId = agent;

    // Search by student name
    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } }
        ],
        role: 'student'
      }).select('userId').lean();

      const matchingUserIds = matchingUsers.map(u => u.userId);
      const matchingStudents = await Student.find({
        userId: { $in: matchingUserIds }
      }).select('studentId').lean();

      const matchingStudentIds = matchingStudents.map(s => s.studentId);

      if (matchingStudentIds.length > 0) {
        filter.studentId = { $in: matchingStudentIds };
      } else {
        return res.json({
          data: [],
          pagination: { total: 0, page: Number(page), limit: Number(limit), totalPages: 0 }
        });
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [applications, total] = await Promise.all([
      Application.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Application.countDocuments(filter)
    ]);

    // Enrich with student + agent details
    const enriched = await Promise.all(
      applications.map(async (app) => {
        const [student, agentUser] = await Promise.all([
          Student.findOne({ studentId: app.studentId }).select('studentId userId').lean(),
          User.findOne({ userId: app.agentId }).select('firstName lastName email').lean()
        ]);
        let studentUser = null;
        if (student) {
          studentUser = await User.findOne({ userId: student.userId }).select('firstName lastName email avatar').lean();
        }
        return {
          ...app,
          student: studentUser
            ? { studentId: app.studentId, firstName: studentUser.firstName, lastName: studentUser.lastName, email: studentUser.email, avatar: studentUser.avatar }
            : { studentId: app.studentId },
          agent: agentUser
            ? { userId: app.agentId, firstName: agentUser.firstName, lastName: agentUser.lastName, email: agentUser.email }
            : { userId: app.agentId }
        };
      })
    );

    return res.json({
      data: enriched,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('getAdminApplications error:', error);
    return res.status(500).json({ error: 'Failed to fetch applications' });
  }
};

/**
 * Get single application (admin)
 * GET /api/v1/admissions/admin/:id
 */
const getAdminApplicationById = async (req, res) => {
  try {
    const { id } = req.params;

    const application = await Application.findOne({
      applicationId: id,
      isDeleted: false
    }).lean();

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Enrich
    const [student, agentUser] = await Promise.all([
      Student.findOne({ studentId: application.studentId }).select('studentId userId').lean(),
      User.findOne({ userId: application.agentId }).select('firstName lastName email').lean()
    ]);
    let studentUser = null;
    if (student) {
      studentUser = await User.findOne({ userId: student.userId }).select('firstName lastName email avatar phone country').lean();
    }

    const nextStatuses = Application.getNextStatuses(application.status);

    return res.json({
      ...application,
      student: studentUser
        ? { studentId: application.studentId, ...studentUser }
        : { studentId: application.studentId },
      agent: agentUser
        ? { userId: application.agentId, ...agentUser }
        : { userId: application.agentId },
      nextStatuses
    });
  } catch (error) {
    console.error('getAdminApplicationById error:', error);
    return res.status(500).json({ error: 'Failed to fetch application' });
  }
};

module.exports = {
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
};
