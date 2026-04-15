const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const representativeSchema = new mongoose.Schema({
  representativeId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    ref: 'User',
    unique: true,
    index: true
  },

  // Representative classification
  repType: {
    type: String,
    enum: ['rep1', 'rep2', 'rep3'],
    required: true
  },
  repLabel: {
    type: String,
    enum: ['Internal Representative', 'Senior/Regional Representative', 'Partner Representative'],
    default: function () {
      const labels = {
        rep1: 'Internal Representative',
        rep2: 'Senior/Regional Representative',
        rep3: 'Partner Representative'
      };
      return labels[this.repType] || 'Internal Representative';
    }
  },

  // Professional info
  assignedRegion: {
    type: String,
    default: ''
  },
  assignedCountries: [{
    type: String
  }],
  organization: {
    type: String,
    default: ''
  },
  experienceLevel: {
    type: String,
    enum: ['junior', 'mid', 'senior', 'lead', 'director'],
    default: 'mid'
  },
  specializations: [{
    type: String
  }],
  bio: {
    type: String,
    default: ''
  },

  // System metrics (denormalized for performance, updated via hooks)
  metrics: {
    totalStudentsAdded: { type: Number, default: 0 },
    activeStudents: { type: Number, default: 0 },
    applicationsProcessed: { type: Number, default: 0 },
    successfulEnrollments: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0, min: 0, max: 100 }
  },

  // Financial metrics (denormalized, updated via commission events)
  financials: {
    totalCommissionEarned: { type: Number, default: 0 },
    pendingCommission: { type: Number, default: 0 },
    paidCommission: { type: Number, default: 0 },
    lastPayoutDate: Date,
    lastPayoutAmount: { type: Number, default: 0 }
  },

  // Activity tracking
  lastActiveAt: {
    type: Date,
    default: Date.now
  },

  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedBy: {
    type: String,
    ref: 'User'
  },

  // Notes from admin
  adminNotes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
representativeSchema.index({ repType: 1, isDeleted: 1 });
representativeSchema.index({ 'metrics.totalStudentsAdded': -1 });
representativeSchema.index({ 'financials.totalCommissionEarned': -1 });
representativeSchema.index({ assignedRegion: 1 });
representativeSchema.index({ isDeleted: 1, createdAt: -1 });

// Virtual: full name (requires populated user)
representativeSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: 'userId',
  justOne: true
});

// Instance method: recalculate metrics from source data
representativeSchema.methods.recalculateMetrics = async function () {
  const Student = mongoose.model('Student');
  const Commission = mongoose.model('Commission');

  const [totalStudents, activeStudents, commissionAgg] = await Promise.all([
    Student.countDocuments({
      $or: [
        { referredBy: this.userId },
        { assignedAgent: this.userId },
        { createdByRep: this.userId }
      ]
    }),
    Student.countDocuments({
      $or: [
        { referredBy: this.userId },
        { assignedAgent: this.userId },
        { createdByRep: this.userId }
      ],
      status: 'active'
    }),
    Commission.aggregate([
      { $match: { agentId: this.userId, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: '$status',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  this.metrics.totalStudentsAdded = totalStudents;
  this.metrics.activeStudents = activeStudents;
  this.metrics.conversionRate = totalStudents > 0
    ? Math.round((activeStudents / totalStudents) * 100)
    : 0;

  // Reset financials
  this.financials.totalCommissionEarned = 0;
  this.financials.pendingCommission = 0;
  this.financials.paidCommission = 0;

  commissionAgg.forEach(c => {
    if (c._id === 'paid') {
      this.financials.paidCommission = c.total;
      this.financials.totalCommissionEarned += c.total;
    }
    if (c._id === 'pending' || c._id === 'approved') {
      this.financials.pendingCommission += c.total;
      this.financials.totalCommissionEarned += c.total;
    }
  });

  return this;
};

module.exports = mongoose.model('Representative', representativeSchema);
