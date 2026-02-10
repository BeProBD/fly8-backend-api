const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: {
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
  applicationId: {
    type: String,
    ref: 'ServiceApplication'
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['stripe', 'bank_transfer', 'cash', 'other'],
    default: 'stripe'
  },
  stripePaymentIntentId: String,
  stripeChargeId: String,
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  paidAt: Date,
  refundedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);