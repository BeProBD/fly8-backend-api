/**
 * Application Model
 * University application management with strict status machine
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Status transition map - enforced strictly
const ALLOWED_TRANSITIONS = {
  'Assigned': ['Docs Pending'],
  'Docs Pending': ['Docs Verified'],
  'Docs Verified': ['Submitted'],
  'Submitted': ['Under Review'],
  'Under Review': ['Offer Received', 'Rejected'],
  'Offer Received': ['Accepted'],
  'Accepted': ['Visa Processing'],
  'Visa Processing': ['Completed'],
  'Completed': [],
  'Rejected': []
};

const APPLICATION_STATUSES = Object.keys(ALLOWED_TRANSITIONS);

const ApplicationSchema = new mongoose.Schema(
  {
    applicationId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
      index: true
    },
    studentId: {
      type: String,
      required: [true, 'Student ID is required'],
      ref: 'Student',
      index: true
    },
    agentId: {
      type: String,
      required: [true, 'Agent ID is required'],
      ref: 'User',
      index: true
    },
    assignedBy: {
      type: String,
      enum: ['admin', 'agent'],
      required: [true, 'Assigned by is required']
    },
    universityName: {
      type: String,
      required: [true, 'University name is required'],
      trim: true
    },
    universityCode: {
      type: String,
      trim: true
    },
    programName: {
      type: String,
      required: [true, 'Program name is required'],
      trim: true
    },
    programLevel: {
      type: String,
      trim: true
    },
    intake: {
      type: String,
      required: [true, 'Intake is required'],
      trim: true
    },
    status: {
      type: String,
      enum: APPLICATION_STATUSES,
      default: 'Assigned',
      index: true
    },
    subStatus: {
      type: String,
      trim: true
    },
    documents: [
      {
        docId: { type: String, default: () => uuidv4() },
        name: { type: String, required: true },
        url: { type: String, required: true },
        type: { type: String },
        uploadedBy: { type: String, required: true },
        uploadedByRole: { type: String, enum: ['student', 'agent', 'super_admin'] },
        uploadedAt: { type: Date, default: Date.now }
      }
    ],
    checklist: [
      {
        item: { type: String, required: true },
        completed: { type: Boolean, default: false },
        completedAt: { type: Date },
        completedBy: { type: String }
      }
    ],
    remarks: [
      {
        text: { type: String, required: true },
        by: { type: String, required: true },
        byRole: { type: String, enum: ['agent', 'super_admin'] },
        date: { type: Date, default: Date.now }
      }
    ],
    timeline: [
      {
        action: { type: String, required: true },
        by: { type: String, required: true },
        byRole: { type: String, enum: ['student', 'agent', 'super_admin'] },
        date: { type: Date, default: Date.now }
      }
    ],
    isDeleted: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

/**
 * Validate status transition
 * @param {String} from - Current status
 * @param {String} to - Target status
 * @returns {Boolean}
 */
ApplicationSchema.statics.isValidTransition = function (from, to) {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed && allowed.includes(to);
};

/**
 * Get allowed next statuses for current status
 * @param {String} currentStatus
 * @returns {String[]}
 */
ApplicationSchema.statics.getNextStatuses = function (currentStatus) {
  return ALLOWED_TRANSITIONS[currentStatus] || [];
};

// Compound indexes
ApplicationSchema.index({ studentId: 1, status: 1 });
ApplicationSchema.index({ agentId: 1, status: 1 });
ApplicationSchema.index({ isDeleted: 1, status: 1 });
ApplicationSchema.index({ createdAt: -1 });

// Export constants alongside model
const Application = mongoose.model('Application', ApplicationSchema);

module.exports = Application;
module.exports.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;
module.exports.APPLICATION_STATUSES = APPLICATION_STATUSES;
