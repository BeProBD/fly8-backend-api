const mongoose = require('mongoose');

/**
 * Task Model
 * Generic task system for all services
 * Tasks are created by Counselors/Agents and assigned to Students
 */
const taskSchema = new mongoose.Schema({
  taskId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  serviceRequestId: {
    type: String,
    required: true,
    ref: 'ServiceRequest',
    index: true
  },

  // Task details
  taskType: {
    type: String,
    required: true,
    // Flexible types - can be extended per service
    enum: [
      'DOCUMENT_UPLOAD',
      'QUESTIONNAIRE',
      'VIDEO_CALL',
      'REVIEW_SESSION',
      'INFORMATION_SUBMISSION',
      'FORM_COMPLETION',
      'PAYMENT',
      'APPROVAL_REQUIRED',
      'OTHER'
    ]
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  instructions: String, // Detailed instructions for the student

  // Assignment
  assignedTo: {
    type: String,
    required: true,
    ref: 'User', // Student userId
    index: true
  },
  assignedBy: {
    type: String,
    required: true,
    ref: 'User', // Counselor/Agent userId
    index: true
  },

  // Status tracking
  status: {
    type: String,
    enum: [
      'PENDING',      // Created, not yet worked on
      'IN_PROGRESS',  // Student is working on it
      'SUBMITTED',    // Student submitted response
      'UNDER_REVIEW', // Counselor/Agent reviewing
      'REVISION_REQUIRED', // Needs changes
      'COMPLETED'     // Approved and completed
    ],
    default: 'PENDING',
    required: true,
    index: true
  },

  // Priority
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM'
  },

  // Due date
  dueDate: Date,

  // Student submission
  submission: {
    text: String,
    submittedAt: Date,
    files: [{
      name: String,
      url: String,
      size: Number,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },

  // Counselor/Agent feedback
  feedback: {
    text: String,
    providedBy: {
      type: String,
      ref: 'User'
    },
    providedAt: Date,
    rating: {
      type: Number,
      min: 1,
      max: 5
    }
  },

  // Revision history
  revisionHistory: [{
    submittedAt: Date,
    text: String,
    files: [{
      name: String,
      url: String
    }],
    feedback: String,
    reviewedAt: Date,
    reviewedBy: {
      type: String,
      ref: 'User'
    }
  }],

  // Status history for audit
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

  // Metadata for extensibility
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date

}, { timestamps: true });

// Indexes for performance
taskSchema.index({ serviceRequestId: 1, status: 1 });
taskSchema.index({ assignedTo: 1, status: 1, dueDate: 1 });
taskSchema.index({ assignedBy: 1, createdAt: -1 });
taskSchema.index({ status: 1, dueDate: 1 });

// Method to update status with history
taskSchema.methods.updateStatus = function(newStatus, changedBy, note = '') {
  this.statusHistory.push({
    status: this.status,
    changedBy,
    changedAt: new Date(),
    note
  });
  this.status = newStatus;

  if (newStatus === 'COMPLETED') {
    this.completedAt = new Date();
  }
};

// Method to submit task
taskSchema.methods.submit = function(text, files = []) {
  // Save current submission to history if exists
  if (this.submission && this.submission.submittedAt) {
    this.revisionHistory.push({
      submittedAt: this.submission.submittedAt,
      text: this.submission.text,
      files: this.submission.files,
      feedback: this.feedback ? this.feedback.text : null,
      reviewedAt: this.feedback ? this.feedback.providedAt : null,
      reviewedBy: this.feedback ? this.feedback.providedBy : null
    });
  }

  // Update submission
  this.submission = {
    text,
    files,
    submittedAt: new Date()
  };

  // Update status
  this.updateStatus('SUBMITTED', this.assignedTo, 'Task submitted by student');
};

// Method to provide feedback
taskSchema.methods.provideFeedback = function(feedbackText, providedBy, rating = null) {
  this.feedback = {
    text: feedbackText,
    providedBy,
    providedAt: new Date(),
    rating
  };
};

module.exports = mongoose.model('Task', taskSchema);
