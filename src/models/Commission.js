const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
  commissionId: {
    type: String,
    required: true,
    unique: true
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
    required: true,
    ref: 'Service'
  },
  amount: {
    type: Number,
    required: true
  },
  percentage: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'paid'],
    default: 'pending'
  },
  paidAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Commission', commissionSchema);