/**
 * University Application Controller
 *
 * Apply-University-specific endpoints. The underlying ServiceRequest is
 * created/managed by the existing serviceRequestController so admin
 * assignment + counselor pages continue to work unchanged.
 */

const { v4: uuidv4 } = require('uuid');
const UniversityApplication = require('../models/UniversityApplication');
const ServiceRequest = require('../models/ServiceRequest');
const Student = require('../models/Student');
const User = require('../models/User');
const notificationService = require('../services/notificationService');
const { logServiceRequestEvent, logFileUploadEvent } = require('../utils/auditLogger');
const { uploadToCloudinary, validateFile } = require('../utils/fileUpload');

/**
 * Create a new University Application + its sidecar ServiceRequest.
 *
 * This bypasses the generic "no duplicate active service request" check
 * because students must be able to apply to multiple programs.
 */
const createUniversityApplication = async (req, res) => {
  try {
    if (!req.student) {
      return res.status(400).json({ error: 'Student record not found' });
    }

    // Block students in rep-counselor mode (mirrors generic createServiceRequest)
    if (
      req.user.role === 'student' &&
      req.student.interactionMode === 'rep-counselor'
    ) {
      return res.status(403).json({
        error: 'Access denied',
        message:
          'Your account is managed by a representative. They will create applications on your behalf.',
      });
    }

    const {
      program,
      personalInfo,
      contactInfo,
      educationInfo,
      testScores,
      documents,
      representativeName,
    } = req.body;

    // Minimum required: program + institution name
    if (!program?.programName || !program?.institutionName) {
      return res.status(400).json({
        error: 'Program name and institution name are required',
      });
    }

    // 1) Create the canonical ServiceRequest (preserves existing admin flow)
    const serviceRequestId = uuidv4();
    const applicationId = uuidv4();

    const serviceRequest = new ServiceRequest({
      serviceRequestId,
      studentId: req.student.studentId,
      serviceType: 'APPLICATION_ASSISTANCE',
      status: 'PENDING_ADMIN_ASSIGNMENT',
      metadata: {
        programId: program.programId || null,
        programName: program.programName,
        universityName: program.institutionName,
        country: program.country || null,
        intake: program.intake || null,
        applicationId, // back-reference so admin UI can resolve the UA
      },
      formData: null, // structured payload lives on the UA record instead
      appliedAt: new Date(),
    });

    if (
      typeof representativeName === 'string' &&
      representativeName.trim()
    ) {
      serviceRequest.representativeName = representativeName.trim();
    }

    serviceRequest.statusHistory.push({
      status: 'PENDING_ADMIN_ASSIGNMENT',
      changedBy: req.user.userId,
      changedAt: new Date(),
      note: 'University application submitted by student',
    });

    await serviceRequest.save();

    // 2) Create the UA sidecar
    const universityApplication = new UniversityApplication({
      applicationId,
      serviceRequestId,
      studentId: req.student.studentId,
      program: {
        programId: program.programId || null,
        programName: program.programName,
        institutionName: program.institutionName,
        country: program.country || null,
        programLevel: program.programLevel || null,
        intake: program.intake || null,
        studentResiding: program.studentResiding || null,
        mode: program.mode || null,
        duration: program.duration || null,
        source: program.programId
          ? 'marketing_website'
          : 'dashboard_manual',
      },
      personalInfo: personalInfo || {},
      contactInfo: contactInfo || {},
      educationInfo: educationInfo || {},
      testScores: testScores || {},
      documents: Array.isArray(documents) ? documents : [],
      submittedAt: new Date(),
    });

    // Documents status from initial upload
    if (universityApplication.documents.length > 0) {
      universityApplication.documentStatus = 'PARTIAL';
    }

    await universityApplication.save();

    // 3) Audit + selectedServices (mirror generic flow)
    await logServiceRequestEvent(req, 'service_request_created', serviceRequest);

    if (!req.student.selectedServices.includes('APPLICATION_ASSISTANCE')) {
      req.student.selectedServices.push('APPLICATION_ASSISTANCE');
      await req.student.save();
    }

    // 4) Notify super admins (best-effort — same pattern as generic flow)
    try {
      await notificationService.notifyServiceRequestCreated(
        serviceRequest,
        req.student,
        req.user,
      );
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    res.status(201).json({
      message: 'University application submitted successfully',
      application: {
        applicationId: universityApplication.applicationId,
        serviceRequestId: universityApplication.serviceRequestId,
        program: universityApplication.program,
        applicationStatus: universityApplication.applicationStatus,
        documentStatus: universityApplication.documentStatus,
        submittedAt: universityApplication.submittedAt,
      },
    });
  } catch (error) {
    console.error('Create university application error:', error);
    res.status(500).json({ error: 'Failed to create university application' });
  }
};

/**
 * Get all University Applications (role-filtered).
 *
 * - Students: only their own (excluded if rep-counselor mode)
 * - Counselors: only ones assigned to them
 * - Agents: only ones assigned to them
 * - Super Admin: all
 */
const getUniversityApplications = async (req, res) => {
  try {
    const { role, userId } = req.user;
    const filter = {};

    if (role === 'student') {
      if (!req.student) {
        return res.status(400).json({ error: 'Student record not found' });
      }
      if (req.student.interactionMode === 'rep-counselor') {
        // Students under rep-counselor mode cannot see applications directly
        return res.json({ applications: [], total: 0 });
      }
      filter.studentId = req.student.studentId;
    } else if (role === 'counselor') {
      filter.assignedCounselor = userId;
    } else if (role === 'agent') {
      filter.assignedAgent = userId;
    }
    // super_admin: no filter

    const applications = await UniversityApplication.find(filter)
      .sort({ submittedAt: -1 })
      .lean();

    // Enrich with serviceRequest status + counselor name (for the list table)
    const srIds = applications.map(a => a.serviceRequestId);
    const counselorIds = [
      ...new Set(applications.map(a => a.assignedCounselor).filter(Boolean)),
    ];
    const studentIds = [...new Set(applications.map(a => a.studentId))];

    const [serviceRequests, counselors, students] = await Promise.all([
      ServiceRequest.find({ serviceRequestId: { $in: srIds } })
        .select(
          'serviceRequestId status assignedCounselor assignedAgent appliedAt createdAt',
        )
        .lean(),
      counselorIds.length > 0
        ? User.find({ userId: { $in: counselorIds } })
            .select('userId firstName lastName email')
            .lean()
        : [],
      Student.find({ studentId: { $in: studentIds } })
        .select('studentId user')
        .populate('user', 'firstName lastName email')
        .lean(),
    ]);

    const srMap = Object.fromEntries(
      serviceRequests.map(sr => [sr.serviceRequestId, sr]),
    );
    const counselorMap = Object.fromEntries(
      counselors.map(c => [c.userId, c]),
    );
    const studentMap = Object.fromEntries(students.map(s => [s.studentId, s]));

    const enriched = applications.map(a => {
      const sr = srMap[a.serviceRequestId];
      // Sync from SR if denormalised counselor is missing/stale
      const assignedCounselor =
        a.assignedCounselor || sr?.assignedCounselor || null;
      const counselor = assignedCounselor
        ? counselorMap[assignedCounselor]
        : null;
      const student = studentMap[a.studentId];

      return {
        ...a,
        serviceRequestStatus: sr?.status || 'PENDING_ADMIN_ASSIGNMENT',
        assignedCounselor,
        counselorName: counselor
          ? `${counselor.firstName || ''} ${counselor.lastName || ''}`.trim()
          : null,
        studentEmail: student?.user?.email || null,
        studentName: student?.user
          ? `${student.user.firstName || ''} ${student.user.lastName || ''}`.trim()
          : null,
      };
    });

    res.json({
      applications: enriched,
      total: enriched.length,
    });
  } catch (error) {
    console.error('Get university applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
};

/**
 * Get a single University Application by ID with full details.
 */
const getUniversityApplicationById = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await UniversityApplication.findOne({
      applicationId,
    }).lean();

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Access control
    const { role, userId } = req.user;
    const isOwner =
      role === 'student' &&
      req.student &&
      req.student.studentId === application.studentId;
    const isAssignedCounselor =
      role === 'counselor' && application.assignedCounselor === userId;
    const isAssignedAgent =
      role === 'agent' && application.assignedAgent === userId;
    const isAdmin = role === 'super_admin';

    if (!isOwner && !isAssignedCounselor && !isAssignedAgent && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [serviceRequest, student] = await Promise.all([
      ServiceRequest.findOne({
        serviceRequestId: application.serviceRequestId,
      }).lean(),
      Student.findOne({ studentId: application.studentId })
        .populate('user', 'firstName lastName email')
        .lean(),
    ]);

    res.json({
      application: {
        ...application,
        serviceRequest: serviceRequest || null,
        student: student || null,
      },
    });
  } catch (error) {
    console.error('Get university application error:', error);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
};

/**
 * Upload a document to a University Application.
 *
 * Body: documentName (optional), stageKey (optional)
 * File: req.files.file
 */
const uploadApplicationDocument = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { documentName, stageKey } = req.body || {};

    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const application = await UniversityApplication.findOne({ applicationId });
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Access: only the owning student, the assigned counselor/agent, or admin
    const { role, userId } = req.user;
    const isOwner =
      role === 'student' &&
      req.student &&
      req.student.studentId === application.studentId;
    const isAssignedCounselor =
      role === 'counselor' && application.assignedCounselor === userId;
    const isAssignedAgent =
      role === 'agent' && application.assignedAgent === userId;
    const isAdmin = role === 'super_admin';

    if (!isOwner && !isAssignedCounselor && !isAssignedAgent && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const file = req.files.file;
    const validation = validateFile(file);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const upload = await uploadToCloudinary(file, {
      folder: `fly8/university-applications/${applicationId}`,
    });

    if (!upload.success) {
      return res.status(500).json({ error: upload.error || 'Upload failed' });
    }

    const docEntry = {
      name: documentName || file.name,
      url: upload.url,
      publicId: upload.publicId,
      size: file.size,
      source: 'application_upload',
      stageKey: stageKey || application.currentStage || 'APPLICATION_CREATED',
      uploadedBy: req.user.userId,
      uploadedAt: new Date(),
    };

    application.documents.push(docEntry);

    // Refresh documentStatus aggregate based on count
    if (application.documents.length === 0) {
      application.documentStatus = 'PENDING';
    } else if (application.documents.length >= 6) {
      // 6 = full required-docs checklist for Apply University
      application.documentStatus = 'COMPLETE';
    } else {
      application.documentStatus = 'PARTIAL';
    }

    await application.save();

    try {
      await logFileUploadEvent(req, 'university_application', applicationId, {
        name: docEntry.name,
        url: docEntry.url,
        size: docEntry.size,
        stageKey: docEntry.stageKey,
      });
    } catch (e) {
      console.error('Audit log error:', e);
    }

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: docEntry,
      documentStatus: application.documentStatus,
    });
  } catch (error) {
    console.error('Upload application document error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

/**
 * Update a stage (counselor/agent/admin only).
 *
 * Body:
 *   status?  - 'LOCKED' | 'UNLOCKED' | 'IN_PROGRESS' | 'COMPLETED'
 *   notes?   - string (optional, overwrites existing notes)
 *
 * Side-effects:
 *   - Sets unlockedAt/unlockedBy when transitioning out of LOCKED
 *   - Sets completedAt when transitioning to COMPLETED
 *   - When a stage is completed, advances currentStage to the next non-completed stage
 */
const updateStage = async (req, res) => {
  try {
    const { applicationId, stageKey } = req.params;
    const { status, notes } = req.body || {};

    const application = await UniversityApplication.findOne({ applicationId });
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Access: counselor/agent assigned, or admin
    const { role, userId } = req.user;
    const isAssignedCounselor =
      role === 'counselor' && application.assignedCounselor === userId;
    const isAssignedAgent =
      role === 'agent' && application.assignedAgent === userId;
    const isAdmin = role === 'super_admin';

    if (!isAssignedCounselor && !isAssignedAgent && !isAdmin) {
      return res.status(403).json({ error: 'Only the assigned counselor/agent can update stages' });
    }

    const stage = application.stages.find(s => s.key === stageKey);
    if (!stage) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    const ALLOWED = ['LOCKED', 'UNLOCKED', 'IN_PROGRESS', 'COMPLETED'];
    if (status && !ALLOWED.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${ALLOWED.join(', ')}` });
    }

    if (status && status !== stage.status) {
      const wasLocked = stage.status === 'LOCKED';
      stage.status = status;

      // Track unlock metadata only on the first transition out of LOCKED
      if (wasLocked && status !== 'LOCKED') {
        stage.unlockedAt = new Date();
        stage.unlockedBy = userId;
      }

      if (status === 'COMPLETED') {
        stage.completedAt = new Date();
        // Advance currentStage to the next non-completed stage (if any)
        const completedIdx = application.stages.findIndex(s => s.key === stageKey);
        const nextStage = application.stages
          .slice(completedIdx + 1)
          .find(s => s.status !== 'COMPLETED');
        if (nextStage) {
          application.currentStage = nextStage.key;
        }
      } else if (status === 'IN_PROGRESS') {
        // Mark as the currently-active stage
        application.currentStage = stageKey;
      }
    }

    if (typeof notes === 'string') {
      stage.notes = notes;
    }

    await application.save();

    res.json({
      message: 'Stage updated',
      stage,
      currentStage: application.currentStage,
    });
  } catch (error) {
    console.error('Update stage error:', error);
    res.status(500).json({ error: 'Failed to update stage' });
  }
};

/**
 * Update overall application status (counselor/agent/admin only).
 *
 * Body:
 *   applicationStatus - one of UA enum
 *   documentStatus?   - one of UA enum (optional)
 */
const updateApplicationStatus = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { applicationStatus, documentStatus } = req.body || {};

    const application = await UniversityApplication.findOne({ applicationId });
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const { role, userId } = req.user;
    const isAssignedCounselor =
      role === 'counselor' && application.assignedCounselor === userId;
    const isAssignedAgent =
      role === 'agent' && application.assignedAgent === userId;
    const isAdmin = role === 'super_admin';

    if (!isAssignedCounselor && !isAssignedAgent && !isAdmin) {
      return res.status(403).json({ error: 'Only the assigned counselor/agent can update status' });
    }

    const APP_STATUSES = [
      'SUBMITTED',
      'UNDER_REVIEW',
      'IN_PROGRESS',
      'ADMITTED',
      'REJECTED',
      'WITHDRAWN',
    ];
    const DOC_STATUSES = ['PENDING', 'PARTIAL', 'COMPLETE'];

    if (applicationStatus) {
      if (!APP_STATUSES.includes(applicationStatus)) {
        return res.status(400).json({ error: `Invalid applicationStatus. Must be one of: ${APP_STATUSES.join(', ')}` });
      }
      application.applicationStatus = applicationStatus;
    }

    if (documentStatus) {
      if (!DOC_STATUSES.includes(documentStatus)) {
        return res.status(400).json({ error: `Invalid documentStatus. Must be one of: ${DOC_STATUSES.join(', ')}` });
      }
      application.documentStatus = documentStatus;
    }

    await application.save();

    res.json({
      message: 'Application status updated',
      applicationStatus: application.applicationStatus,
      documentStatus: application.documentStatus,
    });
  } catch (error) {
    console.error('Update application status error:', error);
    res.status(500).json({ error: 'Failed to update application status' });
  }
};

module.exports = {
  createUniversityApplication,
  getUniversityApplications,
  getUniversityApplicationById,
  uploadApplicationDocument,
  updateStage,
  updateApplicationStatus,
};
