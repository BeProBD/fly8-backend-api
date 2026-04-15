const mongoose = require('mongoose');

/**
 * PaymentRequest — partner-initiated request for student payment on a
 * completed service. Admin reviews, approves, and later marks as paid.
 *
 * One pending/approved request per serviceRequestId (enforced by a partial
 * unique index + application-layer guard).
 */
const paymentRequestSchema = new mongoose.Schema(
  {
    paymentRequestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    serviceRequestId: {
      type: String,
      required: true,
      ref: 'ServiceRequest',
      index: true,
    },
    partnerId: {
      type: String,
      required: true,
      ref: 'User',
      index: true,
    },
    studentId: {
      type: String,
      ref: 'Student',
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    note: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'paid', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    approvedAt: Date,
    approvedBy: {
      type: String,
      ref: 'User',
    },
    paidAt: Date,
    paidBy: {
      type: String,
      ref: 'User',
    },
    paymentReference: {
      type: String,
      default: '',
    },
    rejectedAt: Date,
    rejectionReason: String,
  },
  { timestamps: true }
);

// Prevent duplicate active requests (pending or approved) per serviceRequestId
paymentRequestSchema.index(
  { serviceRequestId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['pending', 'approved'] } },
  }
);

module.exports = mongoose.model('PaymentRequest', paymentRequestSchema);
