/**
 * GSTU Registration Model
 * Global Education Gateway Summit Registration
 */

const mongoose = require('mongoose');

const gstuRegistrationSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    gender: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: String,
      trim: true,
    },
    contactNumber: {
      type: String,
      required: [true, 'Contact number is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
    },
    universityName: {
      type: String,
      required: [true, 'University name is required'],
      trim: true,
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
    },
    currentYear: {
      type: String,
      trim: true,
    },
    studentId: {
      type: String,
      trim: true,
    },
    studyDestinations: {
      type: [String],
      required: [true, 'Study destinations are required'],
    },
    programLevel: {
      type: String,
      required: [true, 'Program level is required'],
      trim: true,
    },
    areasOfInterest: {
      type: [String],
      required: [true, 'Areas of interest are required'],
    },
    otherDestination: {
      type: String,
      trim: true,
    },
    otherArea: {
      type: String,
      trim: true,
    },
    hasPassport: {
      type: String,
      required: [true, 'Passport status is required'],
    },
    hasLanguageTest: {
      type: String,
      required: [true, 'Language test status is required'],
    },
    languageTestName: {
      type: String,
      trim: true,
    },
    languageTestScore: {
      type: String,
      trim: true,
    },
    appliedAbroad: {
      type: String,
      required: [true, 'Applied abroad status is required'],
    },
    expectations: {
      type: String,
      trim: true,
    },
    consent: {
      type: Boolean,
      required: [true, 'Consent is required'],
    },
    registrationNumber: {
      type: String,
      unique: true,
      required: true,
    },
    registrationDate: {
      type: Date,
      default: Date.now,
    },
    ticketCollected: {
      type: Boolean,
      default: false,
    },
    ticketCollectionDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (registrationNumber already has unique index from schema)
gstuRegistrationSchema.index({ email: 1 });
gstuRegistrationSchema.index({ contactNumber: 1 });
gstuRegistrationSchema.index({ ticketCollected: 1 });
gstuRegistrationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('GstuRegistration', gstuRegistrationSchema);
