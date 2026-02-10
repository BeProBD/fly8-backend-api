const mongoose = require('mongoose');

/**
 * ServiceRequest Model
 * Represents a student's request for a service (e.g., Profile Assessment)
 * Supports full lifecycle from application to completion
 */
const serviceRequestSchema = new mongoose.Schema({
  serviceRequestId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  studentId: {
    type: String,
    required: true,
    ref: 'Student',
    index: true
  },
  serviceType: {
    type: String,
    required: true,
    enum: [
      'PROFILE_ASSESSMENT',
      'UNIVERSITY_SHORTLISTING',
      'APPLICATION_ASSISTANCE',
      'VISA_GUIDANCE',
      'SCHOLARSHIP_SEARCH',
      'LOAN_ASSISTANCE',
      'ACCOMMODATION_HELP',
      'PRE_DEPARTURE_ORIENTATION'
    ],
    index: true
  },
  status: {
    type: String,
    enum: [
      'PENDING_ADMIN_ASSIGNMENT', // Student applied, waiting for admin to assign
      'ASSIGNED',                 // Counselor/Agent assigned by admin
      'IN_PROGRESS',              // Tasks being worked on
      'WAITING_STUDENT',          // Waiting for student response/action
      'COMPLETED',                // All tasks completed
      'ON_HOLD',                  // Temporarily paused
      'CANCELLED'                 // Cancelled by student or admin
    ],
    default: 'PENDING_ADMIN_ASSIGNMENT',
    required: true,
    index: true
  },

  // Progress tracking (0-100%)
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },

  // Case deadline
  deadline: {
    type: Date,
    index: true
  },

  // Case priority
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM',
    index: true
  },

  // Assignment tracking
  assignedCounselor: {
    type: String,
    ref: 'User'
  },
  assignedAgent: {
    type: String,
    ref: 'User'
  },
  assignedBy: {
    type: String,
    ref: 'User' // Super Admin who made the assignment
  },
  assignedAt: Date,

  // Status history for audit trail
  statusHistory: [{
    status: String,
    changedBy: {
      type: String,
      ref: 'User'
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    note: String
  }],

  // Notes and communication
  notes: [{
    text: {
      type: String,
      required: true
    },
    addedBy: {
      type: String,
      ref: 'User',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    isInternal: {
      type: Boolean,
      default: false // Internal notes visible only to staff
    }
  }],

  // Document attachments
  documents: [{
    name: String,
    url: String,
    uploadedBy: {
      type: String,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Service-specific metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Timestamps
  appliedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  cancelledAt: Date,

  // =============================================================================
  // AGENT-INITIATED SERVICE REQUEST FIELDS
  // =============================================================================

  // Flag to identify if this request was initiated by an agent
  isAgentInitiated: {
    type: Boolean,
    default: false,
    index: true
  },

  // Agent approval workflow (only for agent-initiated requests)
  agentApprovalStatus: {
    type: String,
    enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', null],
    default: null,
    index: true
  },

  // Super Admin who approved/rejected
  approvedBy: {
    type: String,
    ref: 'User'
  },
  approvedAt: Date,
  rejectedAt: Date,

  // Reason for approval/rejection
  approvalNotes: {
    type: String,
    maxlength: 1000
  }

}, { timestamps: true });

// Indexes for performance
serviceRequestSchema.index({ studentId: 1, serviceType: 1 });
serviceRequestSchema.index({ status: 1, createdAt: -1 });
serviceRequestSchema.index({ assignedCounselor: 1, status: 1 });
serviceRequestSchema.index({ assignedAgent: 1, status: 1 });
serviceRequestSchema.index({ assignedAgent: 1, status: 1, priority: -1, deadline: 1 });
serviceRequestSchema.index({ deadline: 1, status: 1 });
serviceRequestSchema.index({ priority: -1, createdAt: -1 });
serviceRequestSchema.index({ isAgentInitiated: 1, agentApprovalStatus: 1 });

// Method to update status with history tracking
serviceRequestSchema.methods.updateStatus = function(newStatus, changedBy, note = '') {
  // Ensure statusHistory array exists
  if (!this.statusHistory) {
    this.statusHistory = [];
  }

  this.statusHistory.push({
    status: this.status,
    changedBy,
    changedAt: new Date(),
    note
  });
  this.status = newStatus;

  // Ensure progress has a default value
  const currentProgress = this.progress ?? 0;

  // Auto-update progress based on status
  const STATUS_PROGRESS_MAP = {
    'PENDING_ADMIN_ASSIGNMENT': 5,
    'ASSIGNED': 15,
    'IN_PROGRESS': 50,
    'WAITING_STUDENT': 60,
    'ON_HOLD': currentProgress,
    'COMPLETED': 100,
    'CANCELLED': currentProgress
  };

  if (STATUS_PROGRESS_MAP[newStatus] !== undefined && newStatus !== 'ON_HOLD' && newStatus !== 'CANCELLED') {
    this.progress = Math.max(currentProgress, STATUS_PROGRESS_MAP[newStatus]);
  }

  // Set completion/cancellation timestamps
  if (newStatus === 'COMPLETED') {
    this.completedAt = new Date();
    this.progress = 100;
  } else if (newStatus === 'CANCELLED') {
    this.cancelledAt = new Date();
  }
};

// Method to update progress manually
serviceRequestSchema.methods.updateProgress = function(newProgress, changedBy, note = '') {
  // Ensure statusHistory array exists
  if (!this.statusHistory) {
    this.statusHistory = [];
  }

  const oldProgress = this.progress ?? 0;
  this.progress = Math.min(100, Math.max(0, newProgress));

  this.statusHistory.push({
    status: `PROGRESS_UPDATE: ${oldProgress}% → ${this.progress}%`,
    changedBy,
    changedAt: new Date(),
    note
  });

  // Auto-complete if progress reaches 100
  if (this.progress === 100 && this.status !== 'COMPLETED') {
    this.updateStatus('COMPLETED', changedBy, 'Auto-completed: progress reached 100%');
  }
};

module.exports = mongoose.model('ServiceRequest', serviceRequestSchema);
