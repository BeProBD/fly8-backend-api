const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['student', 'super_admin', 'counselor', 'agent'],
    default: 'student'
  },
  phone: String,
  country: String,
  avatar: String,
  isActive: {
    type: Boolean,
    default: true
  },
  // Agent-specific fields
  commissionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 10
  },
  bankDetails: {
    bankName: String,
    accountNumber: String,
    routingNumber: String,
    accountHolderName: String
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  pendingEarnings: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: Date
}, { timestamps: true });

// Hash password before saving
// Skip hashing if _skipPasswordHash flag is set (for migration purposes)
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  // Allow migration to preserve existing bcrypt hashes
  if (this._skipPasswordHash) {
    delete this._skipPasswordHash; // Remove flag after use
    return next();
  }

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);