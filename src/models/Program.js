/**
 * Program Model
 * Academic programs offered by universities
 */

const mongoose = require('mongoose');

const ProgramSchema = new mongoose.Schema(
  {
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
    },
    universityName: {
      type: String,
      required: [true, 'University name is required'],
      trim: true,
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },
    programName: {
      type: String,
      required: [true, 'Program name is required'],
      trim: true,
    },
    majors: {
      type: String,
      required: [true, 'Majors are required'],
      trim: true,
    },
    programLevel: {
      type: String,
      required: [true, 'Program level is required'],
      trim: true,
      enum: [
        'Undergraduate Program',
        'Graduate Program',
        'Postgraduate Program',
        'Diploma',
        'Certificate',
        'Doctoral Program',
      ],
    },
    duration: {
      type: String,
      required: [true, 'Duration is required'],
      trim: true,
    },
    intake: {
      type: String,
      required: [true, 'Intake is required'],
      trim: true,
    },
    // Language Requirements
    languageRequirement: {
      ielts: {
        type: String,
        trim: true,
      },
      toefl: {
        type: String,
        trim: true,
      },
      pte: {
        type: String,
        trim: true,
      },
      duolingo: {
        type: String,
        trim: true,
      },
    },
    programMode: {
      type: String,
      trim: true,
      enum: ['On-campus', 'Online', 'Hybrid', 'Distance Learning'],
    },
    scholarship: {
      type: String,
      trim: true,
    },
    applicationFee: {
      type: String,
      trim: true,
    },
    tuitionFee: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      trim: true,
    },
    // Additional fields for dashboard integration
    isActive: {
      type: Boolean,
      default: true,
    },
    universityCode: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
ProgramSchema.index({ country: 1 });
ProgramSchema.index({ universityName: 1 });
ProgramSchema.index({ programLevel: 1 });
ProgramSchema.index({ majors: 1 });
ProgramSchema.index({ isActive: 1 });
ProgramSchema.index({ programName: 'text', majors: 'text' }); // Text search index

module.exports = mongoose.model('Program', ProgramSchema);
