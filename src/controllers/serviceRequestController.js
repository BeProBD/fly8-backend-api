/**
 * Service Request Controller
 * Generic lifecycle management for all services
 */

const { v4: uuidv4 } = require('uuid');
const ServiceRequest = require('../models/ServiceRequest');
const Student = require('../models/Student');
const User = require('../models/User');
const { getRoleBasedFilter } = require('../middlewares/auth');
const notificationService = require('../services/notificationService');
const { logServiceRequestEvent, logAssignmentEvent } = require('../utils/auditLogger');
const { emitToStudent, broadcastServiceRequestUpdate } = require('../socket/socketManager');

/**
 * Create a new service request (Student only)
 */
const createServiceRequest = async (req, res) => {
  try {
    const { serviceType, metadata } = req.body;

    // Verify student exists
    if (!req.student) {
      return res.status(400).json({ error: 'Student record not found' });
    }

    // Check if service request already exists for this service type
    const existingRequest = await ServiceRequest.findOne({
      studentId: req.student.studentId,
      serviceType,
      status: { $in: ['PENDING_ADMIN_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS'] }
    });

    if (existingRequest) {
      return res.status(400).json({
        error: 'You already have an active request for this service',
        existingRequest: {
          serviceRequestId: existingRequest.serviceRequestId,
          status: existingRequest.status,
          appliedAt: existingRequest.appliedAt
        }
      });
    }

    // Create service request
    const serviceRequestId = uuidv4();
    const serviceRequest = new ServiceRequest({
      serviceRequestId,
      studentId: req.student.studentId,
      serviceType,
      status: 'PENDING_ADMIN_ASSIGNMENT',
      metadata: metadata || {},
      appliedAt: new Date()
    });

    // Add initial status to history
    serviceRequest.statusHistory.push({
      status: 'PENDING_ADMIN_ASSIGNMENT',
      changedBy: req.user.userId,
      changedAt: new Date(),
      note: 'Service request created by student'
    });

    await serviceRequest.save();

    // Audit log: Service request created
    await logServiceRequestEvent(req, 'service_request_created', serviceRequest);

    // Update student's selectedServices
    if (!req.student.selectedServices.includes(serviceType)) {
      req.student.selectedServices.push(serviceType);
      await req.student.save();
    }

    // Send notifications to super admins
    try {
      await notificationService.notifyServiceRequestCreated(
        serviceRequest,
        req.student,
        req.user
      );
    } catch (notifError) {
      console.error('Notification error:', notifError);
      // Don't fail the request if notification fails
    }

    res.status(201).json({
      message: 'Service request created successfully',
      serviceRequest: {
        serviceRequestId: serviceRequest.serviceRequestId,
        serviceType: serviceRequest.serviceType,
        status: serviceRequest.status,
        appliedAt: serviceRequest.appliedAt
      }
    });

  } catch (error) {
    console.error('Create service request error:', error);
    res.status(500).json({ error: 'Failed to create service request' });
  }
};

/**
 * Get all service requests (role-based filtering)
 */
const getServiceRequests = async (req, res) => {
  try {
    const { status, serviceType, page = 1, limit = 20 } = req.query;

    // Build base filter based on role
    let filter = {};

    switch (req.user.role) {
      case 'super_admin':
        // Admin sees everything
        filter = {};
        break;

      case 'student':
        // Students see only their own
        if (!req.student) {
          return res.status(400).json({ error: 'Student record not found' });
        }
        filter = { studentId: req.student.studentId };
        break;

      case 'counselor':
      case 'agent':
        // Counselors/Agents see only assigned requests
        filter = {
          $or: [
            { assignedCounselor: req.user.userId },
            { assignedAgent: req.user.userId }
          ]
        };
        break;

      default:
        return res.status(403).json({ error: 'Access denied' });
    }

    // Apply additional filters
    if (status) {
      filter.status = status;
    }
    if (serviceType) {
      filter.serviceType = serviceType;
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const serviceRequests = await ServiceRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await ServiceRequest.countDocuments(filter);

    // Populate student information for each request
    const enrichedRequests = await Promise.all(
      serviceRequests.map(async (request) => {
        const student = await Student.findOne({ studentId: request.studentId })
          .select('studentId userId age currentEducationLevel preferredCountries')
          .lean();

        const user = await User.findOne({ userId: student?.userId })
          .select('userId email firstName lastName avatar')
          .lean();

        // Get assigned counselor/agent info
        let assignedCounselor = null;
        let assignedAgent = null;

        if (request.assignedCounselor) {
          assignedCounselor = await User.findOne({ userId: request.assignedCounselor })
            .select('userId firstName lastName email')
            .lean();
        }

        if (request.assignedAgent) {
          assignedAgent = await User.findOne({ userId: request.assignedAgent })
            .select('userId firstName lastName email')
            .lean();
        }

        return {
          ...request,
          student: {
            ...student,
            user
          },
          counselor: assignedCounselor, // For frontend compatibility
          agent: assignedAgent,         // For frontend compatibility
          assignedCounselorInfo: assignedCounselor,
          assignedAgentInfo: assignedAgent
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
};

/**
 * Get single service request by ID
 */
const getServiceRequestById = async (req, res) => {
  try {
    const { serviceRequestId } = req.params;

    const serviceRequest = await ServiceRequest.findOne({ serviceRequestId });

    if (!serviceRequest) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    // Check access permissions
    const canAccess =
      req.user.role === 'super_admin' ||
      (req.user.role === 'student' && serviceRequest.studentId === req.student?.studentId) ||
      ((req.user.role === 'counselor' || req.user.role === 'agent') &&
        (serviceRequest.assignedCounselor === req.user.userId ||
          serviceRequest.assignedAgent === req.user.userId));

    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied to this service request' });
    }

    // Populate student and user info
    const student = await Student.findOne({ studentId: serviceRequest.studentId }).lean();
    const user = await User.findOne({ userId: student?.userId }).select('-password').lean();

    // Get assigned staff info
    let assignedCounselor = null;
    let assignedAgent = null;

    if (serviceRequest.assignedCounselor) {
      assignedCounselor = await User.findOne({ userId: serviceRequest.assignedCounselor })
        .select('userId firstName lastName email avatar')
        .lean();
    }

    if (serviceRequest.assignedAgent) {
      assignedAgent = await User.findOne({ userId: serviceRequest.assignedAgent })
        .select('userId firstName lastName email avatar')
        .lean();
    }

    res.json({
      serviceRequest: {
        ...serviceRequest.toObject(),
        student: {
          ...student,
          user
        },
        assignedCounselorInfo: assignedCounselor,
        assignedAgentInfo: assignedAgent
      }
    });

  } catch (error) {
    console.error('Get service request error:', error);
    res.status(500).json({ error: 'Failed to fetch service request' });
  }
};

/**
 * Assign counselor or agent to service request (Super Admin only)
 */
const assignServiceRequest = async (req, res) => {
  try {
    const { serviceRequestId } = req.params;
    const { assignedCounselor, assignedAgent, note } = req.body;

    if (!assignedCounselor && !assignedAgent) {
      return res.status(400).json({ error: 'Must provide either assignedCounselor or assignedAgent' });
    }

    const serviceRequest = await ServiceRequest.findOne({ serviceRequestId });

    if (!serviceRequest) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    if (serviceRequest.status !== 'PENDING_ADMIN_ASSIGNMENT' && serviceRequest.status !== 'ASSIGNED') {
      return res.status(400).json({
        error: 'Cannot reassign service request in current status',
        currentStatus: serviceRequest.status
      });
    }

    // Verify assigned user exists and has correct role
    if (assignedCounselor) {
      const counselor = await User.findOne({ userId: assignedCounselor });
      if (!counselor || counselor.role !== 'counselor') {
        return res.status(400).json({ error: 'Invalid counselor ID' });
      }
      serviceRequest.assignedCounselor = assignedCounselor;
    }

    if (assignedAgent) {
      const agent = await User.findOne({ userId: assignedAgent });
      if (!agent || agent.role !== 'agent') {
        return res.status(400).json({ error: 'Invalid agent ID' });
      }
      serviceRequest.assignedAgent = assignedAgent;
    }

    // Capture previous status for audit
    const previousStatus = serviceRequest.status;

    // Update status and tracking fields
    serviceRequest.updateStatus('ASSIGNED', req.user.userId, note || 'Assigned by super admin');
    serviceRequest.assignedBy = req.user.userId;
    serviceRequest.assignedAt = new Date();

    await serviceRequest.save();

    // Audit log: Service request assigned
    await logServiceRequestEvent(req, 'service_request_assigned', serviceRequest, previousStatus);
    if (assignedCounselor) {
      await logAssignmentEvent(req, 'service_request', serviceRequestId, 'counselor', assignedCounselor);
    }
    if (assignedAgent) {
      await logAssignmentEvent(req, 'service_request', serviceRequestId, 'agent', assignedAgent);
    }

    // Send notifications for assignment
    try {
      const assignedUserId = assignedCounselor || assignedAgent;
      const assignedUser = await User.findOne({ userId: assignedUserId });
      const student = await Student.findOne({ studentId: serviceRequest.studentId });
      const studentUser = await User.findOne({ userId: student.userId });

      if (assignedUser && student && studentUser) {
        await notificationService.notifyServiceRequestAssigned(
          serviceRequest,
          assignedUser,
          student,
          studentUser
        );
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
      // Don't fail the request if notification fails
    }

    // Emit real-time update to student
    try {
      const enrichedRequest = await getEnrichedServiceRequest(serviceRequest);
      emitToStudent(serviceRequest.studentId, 'service_request_updated', enrichedRequest);
      broadcastServiceRequestUpdate(enrichedRequest);
    } catch (socketError) {
      console.error('Socket emission error:', socketError);
    }

    res.json({
      message: 'Service request assigned successfully',
      serviceRequest: {
        serviceRequestId: serviceRequest.serviceRequestId,
        status: serviceRequest.status,
        assignedCounselor: serviceRequest.assignedCounselor,
        assignedAgent: serviceRequest.assignedAgent,
        assignedAt: serviceRequest.assignedAt
      }
    });

  } catch (error) {
    console.error('Assign service request error:', error);
    res.status(500).json({ error: 'Failed to assign service request' });
  }
};

/**
 * Update service request status
 */
const updateServiceRequestStatus = async (req, res) => {
  try {
    const { serviceRequestId } = req.params;
    const { status, note } = req.body;

    const serviceRequest = await ServiceRequest.findOne({ serviceRequestId });

    if (!serviceRequest) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    // Validate status transition
    const validTransitions = {
      'PENDING_ADMIN_ASSIGNMENT': ['ASSIGNED', 'CANCELLED'],
      'ASSIGNED': ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
      'IN_PROGRESS': ['COMPLETED', 'ON_HOLD', 'CANCELLED'],
      'ON_HOLD': ['IN_PROGRESS', 'CANCELLED'],
      'COMPLETED': [], // Terminal state
      'CANCELLED': [] // Terminal state
    };

    if (!validTransitions[serviceRequest.status].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status transition',
        currentStatus: serviceRequest.status,
        requestedStatus: status,
        allowedTransitions: validTransitions[serviceRequest.status]
      });
    }

    // Check permissions for status updates
    const canUpdate =
      req.user.role === 'super_admin' ||
      ((req.user.role === 'counselor' || req.user.role === 'agent') &&
        (serviceRequest.assignedCounselor === req.user.userId ||
          serviceRequest.assignedAgent === req.user.userId));

    if (!canUpdate) {
      return res.status(403).json({ error: 'You do not have permission to update this service request' });
    }

    // Capture previous status for audit
    const previousStatus = serviceRequest.status;

    // Update status
    serviceRequest.updateStatus(status, req.user.userId, note || '');
    await serviceRequest.save();

    // Audit log: Status change
    const auditAction = status === 'COMPLETED' ? 'service_request_completed' :
                        status === 'CANCELLED' ? 'service_request_cancelled' :
                        'service_request_status_changed';
    await logServiceRequestEvent(req, auditAction, serviceRequest, previousStatus);

    // Send notification if service is completed
    if (status === 'COMPLETED') {
      try {
        const student = await Student.findOne({ studentId: serviceRequest.studentId });
        const studentUser = await User.findOne({ userId: student.userId });

        if (student && studentUser) {
          await notificationService.notifyServiceCompleted(
            serviceRequest,
            studentUser,
            req.user
          );
        }
      } catch (notifError) {
        console.error('Notification error:', notifError);
        // Don't fail the request if notification fails
      }
    }

    // Emit real-time update to student
    try {
      const enrichedRequest = await getEnrichedServiceRequest(serviceRequest);
      emitToStudent(serviceRequest.studentId, 'service_request_updated', enrichedRequest);
      broadcastServiceRequestUpdate(enrichedRequest);
    } catch (socketError) {
      console.error('Socket emission error:', socketError);
    }

    res.json({
      message: 'Service request status updated successfully',
      serviceRequest: {
        serviceRequestId: serviceRequest.serviceRequestId,
        status: serviceRequest.status,
        updatedAt: serviceRequest.updatedAt
      }
    });

  } catch (error) {
    console.error('Update service request status error:', error);
    res.status(500).json({ error: 'Failed to update service request status' });
  }
};

/**
 * Add note to service request
 */
const addServiceRequestNote = async (req, res) => {
  try {
    const { serviceRequestId } = req.params;
    const { text, isInternal } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Note text is required' });
    }

    const serviceRequest = await ServiceRequest.findOne({ serviceRequestId });

    if (!serviceRequest) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    // Check permissions
    const canAddNote =
      req.user.role === 'super_admin' ||
      ((req.user.role === 'counselor' || req.user.role === 'agent') &&
        (serviceRequest.assignedCounselor === req.user.userId ||
          serviceRequest.assignedAgent === req.user.userId)) ||
      (req.user.role === 'student' && serviceRequest.studentId === req.student?.studentId);

    if (!canAddNote) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Students cannot add internal notes
    const noteIsInternal = req.user.role === 'student' ? false : (isInternal || false);

    serviceRequest.notes.push({
      text,
      addedBy: req.user.userId,
      addedAt: new Date(),
      isInternal: noteIsInternal
    });

    await serviceRequest.save();

    // Audit log: Note added
    await logServiceRequestEvent(req, 'service_request_note_added', serviceRequest);

    res.json({
      message: 'Note added successfully',
      note: serviceRequest.notes[serviceRequest.notes.length - 1]
    });

  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
};

/**
 * Get service request statistics (Super Admin only)
 */
const getServiceRequestStats = async (req, res) => {
  try {
    const stats = {
      total: await ServiceRequest.countDocuments(),
      byStatus: {},
      byServiceType: {}
    };

    // Count by status
    const statusCounts = await ServiceRequest.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    statusCounts.forEach(item => {
      stats.byStatus[item._id] = item.count;
    });

    // Count by service type
    const serviceTypeCounts = await ServiceRequest.aggregate([
      { $group: { _id: '$serviceType', count: { $sum: 1 } } }
    ]);

    serviceTypeCounts.forEach(item => {
      stats.byServiceType[item._id] = item.count;
    });

    res.json({ stats });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

/**
 * Helper: Get enriched service request with populated relations
 */
const getEnrichedServiceRequest = async (serviceRequest) => {
  const requestObj = serviceRequest.toObject ? serviceRequest.toObject() : serviceRequest;

  // Get student and user info
  const student = await Student.findOne({ studentId: requestObj.studentId }).lean();
  const user = student ? await User.findOne({ userId: student.userId }).select('userId firstName lastName email avatar').lean() : null;

  // Get assigned staff info
  let counselor = null;
  let agent = null;

  if (requestObj.assignedCounselor) {
    counselor = await User.findOne({ userId: requestObj.assignedCounselor })
      .select('userId firstName lastName email avatar')
      .lean();
  }

  if (requestObj.assignedAgent) {
    agent = await User.findOne({ userId: requestObj.assignedAgent })
      .select('userId firstName lastName email avatar')
      .lean();
  }

  return {
    ...requestObj,
    student: student ? { ...student, user } : null,
    counselor, // Add counselor field for frontend compatibility
    agent,     // Add agent field for frontend compatibility
    assignedCounselorInfo: counselor,
    assignedAgentInfo: agent
  };
};

module.exports = {
  createServiceRequest,
  getServiceRequests,
  getServiceRequestById,
  assignServiceRequest,
  updateServiceRequestStatus,
  addServiceRequestNote,
  getServiceRequestStats
};
