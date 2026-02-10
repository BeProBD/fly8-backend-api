const mongoose = require('mongoose');

/**
 * AuditLog Model
 * Comprehensive audit trail for all critical system operations
 * Supports ServiceRequest and Task lifecycle tracking
 */
const auditLogSchema = new mongoose.Schema({
  logId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Actor information
  actorUserId: {
    type: String,
    required: true,
    ref: 'User',
    index: true
  },
  actorRole: {
    type: String,
    required: true,
    enum: ['student', 'counselor', 'agent', 'super_admin', 'system']
  },
  // Action performed
  action: {
    type: String,
    required: true,
    enum: [
      // User lifecycle
      'user_created',
      'user_login',
      'user_updated',
      'user_deactivated',
      // Student lifecycle
      'student_onboarded',
      'student_profile_updated',
      // Service Request lifecycle
      'service_request_created',
      'service_request_assigned',
      'service_request_status_changed',
      'service_request_note_added',
      'service_request_completed',
      'service_request_cancelled',
      // Task lifecycle
      'task_created',
      'task_status_changed',
      'task_submitted',
      'task_reviewed',
      'task_revision_requested',
      'task_completed',
      'task_deleted',
      // Case management (Agent pipeline)
      'case_status_updated',
      'case_progress_updated',
      'case_deadline_updated',
      'case_priority_updated',
      // Assignment actions
      'counselor_assigned',
      'agent_assigned',
      // Legacy/other
      'service_applied',
      'application_status_updated',
      'payment_initiated',
      'payment_completed',
      'commission_approved',
      'commission_paid',
      'document_uploaded',
      'note_added',
      'file_uploaded',
      // Application (admissions) lifecycle
      'application_created',
      'application_status_changed',
      'application_document_uploaded',
      'application_offer_accepted'
    ],
    index: true
  },
  // Resource being acted upon
  entityType: {
    type: String,
    required: true,
    enum: ['user', 'student', 'service_request', 'task', 'notification', 'payment', 'commission', 'document', 'application'],
    index: true
  },
  entityId: {
    type: String,
    required: true,
    index: true
  },
  // State tracking for transitions
  previousState: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  newState: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  // Additional context
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Request metadata
  ipAddress: String,
  userAgent: String,
  // Timestamp
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  // Backward compatibility aliases
  userId: {
    type: String,
    ref: 'User'
  },
  resourceType: String,
  resourceId: String
}, { timestamps: true });

auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);