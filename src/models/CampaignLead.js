/**
 * CampaignLead Model
 * Stores leads collected from Facebook campaign landing pages
 */

const mongoose = require('mongoose');

const campaignLeadSchema = new mongoose.Schema(
  {
    serviceType: {
      type: String,
      required: true,
      enum: [
        'higher_education',
        'university_application',
        'visa_support',
        'flight_ticket',
        'accommodation',
        'travel_support',
        'job_support',
        'partner',
      ],
    },

    // Flexible field to store service-specific form data
    serviceData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    contactInfo: {
      fullName: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      contactMode: { type: String, default: 'any' },
      contactTime: { type: String, default: 'সকাল' },
      contactWhen: { type: String, default: 'আজকেই' },
      knowUs: { type: String, default: 'Facebook' },
      notes: { type: String, default: '' },
    },

    // UTM tracking
    utmSource: { type: String, default: null },
    utmCampaign: { type: String, default: null },
    utmMedium: { type: String, default: null },
    utmContent: { type: String, default: null },

    source: {
      type: String,
      default: 'facebook_campaign',
      enum: ['facebook_campaign', 'website', 'referral', 'other'],
    },

    status: {
      type: String,
      default: 'new',
      enum: ['new', 'contacted', 'in_progress', 'converted', 'closed'],
    },

    // Admin notes (for future use)
    adminNotes: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
campaignLeadSchema.index({ createdAt: -1 });
campaignLeadSchema.index({ status: 1 });
campaignLeadSchema.index({ serviceType: 1 });
campaignLeadSchema.index({ 'contactInfo.phone': 1 });

module.exports = mongoose.model('CampaignLead', campaignLeadSchema);
