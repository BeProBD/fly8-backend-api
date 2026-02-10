const mongoose = require('mongoose');

const serviceApplicationSchema = new mongoose.Schema({
  applicationId: {
    type: String,
    required: true,
    unique: true
  },
  studentId: {
    type: String,
    required: true,
    ref: 'Student'
  },
  serviceId: {
    type: String,
    required: true,
    ref: 'Service'
  },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed', 'on_hold'],
    default: 'not_started'
  },
  assignedCounselor: {
    type: String,
    ref: 'User'
  },
  assignedAgent: {
    type: String,
    ref: 'User'
  },
  notes: [{
    text: String,
    addedBy: String,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  documents: [{
    name: String,
    url: String,
    uploadedBy: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  appliedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('ServiceApplication', serviceApplicationSchema);