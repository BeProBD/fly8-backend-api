/**
 * University Model (Unified)
 * Comprehensive university information merging marketing and dashboard schemas
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UniversitySchema = new Schema(
  {
    // Primary identifiers (supporting both old and new formats)
    universitycode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    // Legacy field from dashboard (kept for backward compatibility)
    universityId: {
      type: String,
      trim: true,
    },
    universityName: {
      type: String,
      required: true,
      trim: true,
    },
    // Legacy field from dashboard
    name: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    // Legacy field from dashboard
    city: {
      type: String,
      trim: true,
    },
    imageUrl: {
      type: String,
    },
    // Legacy field from dashboard
    logo: {
      type: String,
    },
    website: {
      type: String,
    },
    ranking: {
      type: Number,
    },
    campusName: {
      type: String,
    },
    tagline: {
      type: String,
    },
    stats: [{ type: String }],
    description: {
      type: String,
    },
    overviewData: [
      {
        label: { type: String },
        value: { type: String },
      },
    ],
    generalInfo: {
      type: String,
    },
    applicationFee: {
      type: Number,
      default: 0,
    },
    financialRequirement: {
      type: Number,
    },
    tuitionDeposit: {
      type: Number,
      default: 0,
    },
    processingFee: {
      type: Number,
      default: 0,
    },
    generalRequirements: [{ type: String }],

    // Undergraduate requirements
    undergraduate: {
      englishTests: [
        {
          name: { type: String },
          score: { type: String },
        },
      ],
      otherTests: [{ type: String }],
      additionalRequirements: [{ type: String }],
    },

    // Graduate requirements
    graduate: {
      englishTests: [
        {
          name: { type: String },
          score: { type: String },
        },
      ],
      additionalRequirements: [{ type: String }],
    },

    // Conditional admission
    conditionalAdmission: {
      available: {
        type: Boolean,
        default: false,
      },
      description: { type: String },
      benefits: [{ type: String }],
    },

    // Tuition data
    tuitionData: [
      {
        category: { type: String },
        amount: { type: String },
        period: { type: String },
      },
    ],

    // Additional fees
    additionalFees: [
      {
        name: { type: String },
        amount: { type: String },
      },
    ],

    // Living costs
    livingCosts: [
      {
        category: { type: String },
        range: { type: String },
      },
    ],

    // Scholarships
    scholarships: [
      {
        name: { type: String },
        amount: { type: String },
        type: { type: String },
        eligibility: { type: String },
        renewable: { type: Boolean },
        popular: { type: Boolean },
      },
    ],

    // Visa steps
    visaSteps: [
      {
        step: { type: Number },
        title: { type: String },
        description: { type: String },
      },
    ],

    // Work opportunities
    workOpportunities: [
      {
        type: { type: String },
        description: { type: String },
        timing: { type: String },
      },
    ],

    // Campus images
    campusImages: [
      {
        src: { type: String },
        alt: { type: String },
      },
    ],

    // Campus features
    campusFeatures: [
      {
        title: { type: String },
        description: { type: String },
      },
    ],

    // Legacy programs array from dashboard
    programs: [
      {
        name: String,
        degree: String,
        duration: String,
        tuitionFee: Number,
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Pre-save middleware to sync legacy fields
UniversitySchema.pre('save', function (next) {
  // Sync universityId with universitycode
  if (this.universitycode && !this.universityId) {
    this.universityId = this.universitycode;
  }
  // Sync name with universityName
  if (this.universityName && !this.name) {
    this.name = this.universityName;
  }
  // Sync city with location
  if (this.location && !this.city) {
    this.city = this.location;
  }
  // Sync logo with imageUrl
  if (this.imageUrl && !this.logo) {
    this.logo = this.imageUrl;
  }
  next();
});

// Indexes (universitycode already has unique index from schema)
UniversitySchema.index({ universityId: 1 });
UniversitySchema.index({ country: 1 });
UniversitySchema.index({ isActive: 1 });
UniversitySchema.index({ universityName: 'text', location: 'text' });

module.exports = mongoose.model('University', UniversitySchema);
