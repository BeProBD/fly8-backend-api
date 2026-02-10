const mongoose = require('mongoose');

/**
 * Notification Model
 * Supports dual-channel notifications (Email + Dashboard)
 * Persistent storage with read tracking
 */
const notificationSchema = new mongoose.Schema({
  notificationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  recipientId: {
    type: String,
    required: true,
    ref: 'User',
    index: true
  },
  type: {
    type: String,
    enum: [
      'SERVICE_REQUEST_CREATED',   // New service request submitted
      'SERVICE_REQUEST_ASSIGNED',  // Counselor/Agent assigned
      'SERVICE_REQUEST_STATUS_CHANGED', // Service request status updated
      'SERVICE_REQUEST_APPROVED',  // Service request approved (for agent-initiated)
      'SERVICE_REQUEST_REJECTED',  // Service request rejected (for agent-initiated)
      'TASK_ASSIGNED',            // New task assigned to student
      'TASK_SUBMITTED',           // Student submitted task
      'TASK_REVIEWED',            // Task reviewed by counselor
      'TASK_REVISION_REQUIRED',   // Task needs revision
      'TASK_COMPLETED',           // Task marked complete
      'SERVICE_COMPLETED',        // Entire service completed
      'STATUS_UPDATE',            // General status update
      'PAYMENT_RECEIVED',         // Payment notification
      'COMMISSION_CREDITED',      // Commission notification
      // Agent-initiated service request notifications
      'AGENT_SERVICE_REQUEST_PENDING', // Agent submitted request awaiting approval
      'AGENT_REQUEST_APPROVED',   // Agent's request was approved by Super Admin
      'AGENT_REQUEST_REJECTED',   // Agent's request was rejected by Super Admin
      'GENERAL',                  // General notification
      'SYSTEM',                   // System announcement
      // Application (admissions) notifications
      'APPLICATION_CREATED',           // New university application created
      'APPLICATION_AGENT_ASSIGNED',    // Agent assigned to application
      'APPLICATION_STATUS_CHANGED',    // Application status updated
      'APPLICATION_DOCUMENT_UPLOADED'  // Document uploaded to application
    ],
    required: true,
    index: true
  },

  // Notification channels
  channel: {
    type: String,
    enum: ['EMAIL', 'DASHBOARD', 'BOTH'],
    default: 'BOTH',
    required: true
  },

  // Content
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },

  // Rich content (optional)
  actionUrl: String, // URL to navigate when clicked
  actionText: String, // Button text for action

  // Dashboard notification tracking
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: Date,

  // Email notification tracking
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: Date,
  emailError: String,

  // Priority
  priority: {
    type: String,
    enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
    default: 'NORMAL'
  },

  // Related entities (for filtering and linking)
  relatedEntities: {
    serviceRequestId: String,
    taskId: String,
    paymentId: String,
    commissionId: String
  },

  // Metadata for extensibility
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: Date, // Optional expiration for temporary notifications

  // Admin notification fields
  sentBy: {
    type: String,
    ref: 'User',
    index: true  // Admin who sent it (null for system notifications)
  },
  targetType: {
    type: String,
    enum: ['ALL', 'ROLE', 'USER'],
    default: 'USER'  // ALL=broadcast, ROLE=role-based, USER=single user
  },
  targetRole: {
    type: String,
    enum: ['student', 'agent', 'counselor', 'super_admin', null],
    default: null  // Only set when targetType is 'ROLE'
  },
  isArchived: {
    type: Boolean,
    default: false,
    index: true
  },
  archivedAt: Date,
  archivedBy: {
    type: String,
    ref: 'User'
  }

}, { timestamps: true });

// Indexes for performance
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ 'relatedEntities.serviceRequestId': 1 });
notificationSchema.index({ 'relatedEntities.taskId': 1 });
// Admin notification indexes
notificationSchema.index({ sentBy: 1, createdAt: -1 });
notificationSchema.index({ isArchived: 1, createdAt: -1 });
notificationSchema.index({ targetType: 1, targetRole: 1 });

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
  }
};

// Method to archive notification
notificationSchema.methods.archive = function(archivedByUserId) {
  if (!this.isArchived) {
    this.isArchived = true;
    this.archivedAt = new Date();
    this.archivedBy = archivedByUserId;
  }
};

// Method to unarchive notification
notificationSchema.methods.unarchive = function() {
  this.isArchived = false;
  this.archivedAt = null;
  this.archivedBy = null;
};

module.exports = mongoose.model('Notification', notificationSchema);
