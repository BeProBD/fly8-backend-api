/**
 * Audit Logger Utility
 * Comprehensive logging for all system operations with state tracking
 */

const AuditLog = require('../models/AuditLog');
const { v4: uuidv4 } = require('uuid');

/**
 * Create audit log entry with full state tracking
 * @param {Object} options - Audit options
 * @param {String} options.actorUserId - User ID of the actor performing the action
 * @param {String} options.actorRole - Role of the actor (student, counselor, agent, super_admin, system)
 * @param {String} options.action - Action being performed
 * @param {String} options.entityType - Type of entity being acted upon
 * @param {String} options.entityId - ID of the entity
 * @param {*} options.previousState - Previous state (for transitions)
 * @param {*} options.newState - New state (for transitions)
 * @param {Object} options.details - Additional details
 * @param {Object} options.req - Express request object (optional)
 */
const createAuditLog = async (options) => {
  try {
    const {
      actorUserId,
      actorRole,
      action,
      entityType,
      entityId,
      previousState = null,
      newState = null,
      details = {},
      req = null
    } = options;

    const log = new AuditLog({
      logId: uuidv4(),
      actorUserId,
      actorRole,
      action,
      entityType,
      entityId,
      previousState,
      newState,
      details,
      ipAddress: req?.ip || req?.connection?.remoteAddress || null,
      userAgent: req?.get?.('user-agent') || null,
      timestamp: new Date(),
      // Backward compatibility
      userId: actorUserId,
      resourceType: entityType,
      resourceId: entityId
    });

    await log.save();
    return log;
  } catch (error) {
    console.error('Audit log creation error:', error);
    // Don't throw - audit logging should not break main operations
  }
};

/**
 * Legacy logAudit function for backward compatibility
 * @deprecated Use createAuditLog instead
 */
const logAudit = async (userId, action, resourceType, resourceId, details, req) => {
  try {
    const log = new AuditLog({
      logId: uuidv4(),
      actorUserId: userId,
      actorRole: 'system', // Legacy doesn't track role
      action,
      entityType: resourceType,
      entityId: resourceId,
      details,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get?.('user-agent'),
      // Backward compatibility fields
      userId,
      resourceType,
      resourceId
    });
    await log.save();
    return log;
  } catch (error) {
    console.error('Audit log error:', error);
  }
};

/**
 * Log Service Request lifecycle events
 */
const logServiceRequestEvent = async (req, action, serviceRequest, previousStatus = null) => {
  return createAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    action,
    entityType: 'service_request',
    entityId: serviceRequest.serviceRequestId,
    previousState: previousStatus ? { status: previousStatus } : null,
    newState: { status: serviceRequest.status },
    details: {
      serviceType: serviceRequest.serviceType,
      studentId: serviceRequest.studentId,
      assignedCounselor: serviceRequest.assignedCounselor,
      assignedAgent: serviceRequest.assignedAgent
    },
    req
  });
};

/**
 * Log Task lifecycle events
 */
const logTaskEvent = async (req, action, task, previousStatus = null) => {
  return createAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    action,
    entityType: 'task',
    entityId: task.taskId,
    previousState: previousStatus ? { status: previousStatus } : null,
    newState: { status: task.status },
    details: {
      taskType: task.taskType,
      title: task.title,
      serviceRequestId: task.serviceRequestId,
      assignedTo: task.assignedTo,
      assignedBy: task.assignedBy
    },
    req
  });
};

/**
 * Log Assignment events (Counselor/Agent assignment)
 */
const logAssignmentEvent = async (req, entityType, entityId, assignmentType, assigneeUserId) => {
  const action = assignmentType === 'counselor' ? 'counselor_assigned' : 'agent_assigned';
  return createAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    action,
    entityType,
    entityId,
    previousState: null,
    newState: { [`assigned${assignmentType.charAt(0).toUpperCase() + assignmentType.slice(1)}`]: assigneeUserId },
    details: {
      assignedBy: req.user.userId,
      assignedAt: new Date()
    },
    req
  });
};

/**
 * Log File Upload events
 */
const logFileUploadEvent = async (req, entityType, entityId, fileInfo) => {
  return createAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    action: 'file_uploaded',
    entityType,
    entityId,
    previousState: null,
    newState: null,
    details: {
      fileName: fileInfo.name,
      fileUrl: fileInfo.url,
      fileSize: fileInfo.size,
      fileType: fileInfo.type
    },
    req
  });
};

/**
 * Query audit logs with filters
 */
const queryAuditLogs = async (filters = {}, options = {}) => {
  const {
    actorUserId,
    entityType,
    entityId,
    action,
    startDate,
    endDate
  } = filters;

  const {
    page = 1,
    limit = 50,
    sortBy = 'timestamp',
    sortOrder = -1
  } = options;

  const query = {};

  if (actorUserId) query.actorUserId = actorUserId;
  if (entityType) query.entityType = entityType;
  if (entityId) query.entityId = entityId;
  if (action) query.action = action;
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;
  const logs = await AuditLog.find(query)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await AuditLog.countDocuments(query);

  return {
    logs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

module.exports = {
  createAuditLog,
  logAudit,
  logServiceRequestEvent,
  logTaskEvent,
  logAssignmentEvent,
  logFileUploadEvent,
  queryAuditLogs
};
