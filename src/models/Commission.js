const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const commissionSchema = new mongoose.Schema({
  commissionId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },
  agentId: {
    type: String,
    required: true,
    ref: 'User'
  },
  studentId: {
    type: String,
    required: true,
    ref: 'Student'
  },
  serviceId: {
    type: String,
    ref: 'Service'
  },

  // Commission source classification
  commissionType: {
    type: String,
    enum: ['APPLICATION', 'VAS'],
    required: true
  },

  // For APPLICATION type commissions
  applicationId: {
    type: String,
    ref: 'Application'
  },
  universityName: String,
  universityCode: String,
  programName: String,

  // For VAS type commissions
  serviceRequestId: {
    type: String,
    ref: 'ServiceRequest'
  },
  serviceType: {
    type: String,
    enum: [
      'PROFILE_ASSESSMENT', 'UNIVERSITY_SHORTLISTING', 'APPLICATION_ASSISTANCE',
      'VISA_GUIDANCE', 'SCHOLARSHIP_SEARCH', 'LOAN_ASSISTANCE',
      'ACCOMMODATION_HELP', 'PRE_DEPARTURE_ORIENTATION'
    ]
  },

  // Financial details
  baseAmount: {
    type: Number,
    required: true,
    min: 0
  },
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },

  // Tier info (if commission tiers were applied)
  tierApplied: {
    minStudents: Number,
    maxStudents: Number,
    commissionRate: Number
  },

  // Invoice & Reference
  invoiceNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  referenceId: {
    type: String,
    unique: true
  },

  // Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'paid', 'rejected', 'cancelled'],
    default: 'pending'
  },

  // Status audit trail
  statusHistory: [{
    status: String,
    changedBy: { type: String, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    note: String
  }],

  // Approval tracking
  approvedBy: { type: String, ref: 'User' },
  approvedAt: Date,
  rejectedBy: { type: String, ref: 'User' },
  rejectedAt: Date,
  rejectionReason: String,

  // Payout tracking
  paidAt: Date,
  payoutRequestedAt: Date,
  payoutMethod: {
    type: String,
    enum: ['bank_transfer', 'paypal', 'stripe', 'other']
  },
  payoutReference: String,
  processedBy: { type: String, ref: 'User' },

  // Notes
  description: String,
  adminNotes: String,

  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

// Pre-save hook to generate referenceId
commissionSchema.pre('save', function(next) {
  if (this.isNew) {
    if (!this.referenceId) {
      const prefix = this.commissionType === 'APPLICATION' ? 'COM-APP' : 'COM-VAS';
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      this.referenceId = `${prefix}-${timestamp}-${random}`;
    }
    if (!this.statusHistory || this.statusHistory.length === 0) {
      this.statusHistory = [{
        status: 'pending',
        changedBy: 'system',
        changedAt: new Date(),
        note: 'Commission created automatically'
      }];
    }
  }
  next();
});

// Indexes
commissionSchema.index({ agentId: 1, status: 1 });
commissionSchema.index({ agentId: 1, createdAt: -1 });
commissionSchema.index({ studentId: 1, agentId: 1 });
commissionSchema.index({ commissionType: 1, status: 1 });
commissionSchema.index({ applicationId: 1 }, { sparse: true });
commissionSchema.index({ serviceRequestId: 1 }, { sparse: true });
commissionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Commission', commissionSchema);
