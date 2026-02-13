const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const payoutSchema = new mongoose.Schema({
  payoutId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },
  agentId: {
    type: String,
    required: true,
    ref: 'User',
    index: true
  },

  // Payout details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },

  // Commission IDs included in this payout
  commissionIds: [{
    type: String,
    ref: 'Commission'
  }],

  status: {
    type: String,
    enum: ['requested', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'requested'
  },

  // Payment method
  payoutMethod: {
    type: String,
    enum: ['bank_transfer', 'paypal', 'stripe', 'other'],
    default: 'bank_transfer'
  },

  // Bank details snapshot (frozen at time of request)
  bankDetailsSnapshot: {
    bankName: String,
    accountNumber: String,
    routingNumber: String,
    accountHolderName: String
  },

  // Timestamps
  requestedAt: { type: Date, default: Date.now },
  processedAt: Date,
  processedBy: { type: String, ref: 'User' },

  // External reference (bank transfer ID, PayPal transaction ID, etc.)
  externalReference: String,

  // Invoice number for this payout
  invoiceNumber: {
    type: String,
    unique: true,
    sparse: true
  },

  // Notes
  agentNote: String,
  adminNote: String,
  failureReason: String,

  // Status history
  statusHistory: [{
    status: String,
    changedBy: { type: String, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    note: String
  }]
}, { timestamps: true });

// Pre-save hook
payoutSchema.pre('save', function(next) {
  if (this.isNew && (!this.statusHistory || this.statusHistory.length === 0)) {
    this.statusHistory = [{
      status: 'requested',
      changedBy: this.agentId,
      changedAt: new Date(),
      note: 'Payout requested by agent'
    }];
  }
  next();
});

// Indexes
payoutSchema.index({ agentId: 1, status: 1 });
payoutSchema.index({ agentId: 1, createdAt: -1 });
payoutSchema.index({ status: 1, requestedAt: -1 });

module.exports = mongoose.model('Payout', payoutSchema);
