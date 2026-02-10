const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  interestedCountries: [String],
  selectedServices: [String],
  onboardingCompleted: {
    type: Boolean,
    default: false
  },
  assignedCounselor: {
    type: String,
    ref: 'User'
  },
  assignedAgent: {
    type: String,
    ref: 'User'
  },
  referredBy: {
    type: String,
    ref: 'User'
  },
  referralNotes: {
    type: String,
    default: ''
  },
  commissionPercentage: {
    type: Number,
    default: 0
  },
  country: {
    type: String,
    default: ''
  },
  intake: String,
  preferredDestination: String,
  status: {
    type: String,
    enum: ['active', 'inactive', 'completed'],
    default: 'active'
  },

  // Academic Profile Information (migrated from old Profile collection)
  age: {
    type: Number,
    min: 0
  },
  currentEducationLevel: {
    type: String,
    enum: ['bachelor', 'master', 'phd', 'diploma', 'other']
  },
  fieldOfStudy: String,
  gpa: String,
  graduationYear: {
    type: Number,
    min: 1900,
    max: new Date().getFullYear() + 10
  },
  institution: String,

  // Test Scores
  ielts: String,
  toefl: String,
  gre: String,

  // Preferences
  preferredCountries: {
    type: [String],
    default: []
  },
  preferredDegreeLevel: {
    type: String,
    enum: ['bachelor', 'master', 'phd', 'other']
  },
  budget: String,

  // Career Information
  careerGoals: String,
  industry: {
    type: String,
    enum: ['tech', 'finance', 'healthcare', 'education', 'consulting', 'other']
  },
  workLocation: {
    type: String,
    enum: ['home-country', 'study-country', 'global', 'other']
  },

  // Document References (URLs stored in Cloudinary)
  documents: {
    transcripts: String,
    testScores: String,
    sop: String,
    recommendation: String,
    resume: String,
    passport: String
  },

  // Legacy Migration Fields
  oldStudentId: String, // Original MongoDB ObjectId from old system
  oldProfileId: String, // Original additionalDetails ObjectId
  migratedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);