/**
 * Platform Settings Model
 * Stores all configurable platform settings in a single document pattern
 * Uses a singleton approach - only one settings document exists
 */

const mongoose = require('mongoose');

// Sub-schema for platform profile
const platformProfileSchema = new mongoose.Schema({
  name: { type: String, default: 'Fly8' },
  tagline: { type: String, default: 'Your Gateway to Global Education' },
  logoUrl: { type: String, default: '' },
  faviconUrl: { type: String, default: '' },
  contactEmail: { type: String, default: 'contact@fly8.global' },
  supportEmail: { type: String, default: 'support@fly8.global' },
  supportPhone: { type: String, default: '' },
  address: { type: String, default: '' },
  website: { type: String, default: 'https://fly8.global' },
  socialLinks: {
    facebook: { type: String, default: '' },
    twitter: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    instagram: { type: String, default: '' },
    youtube: { type: String, default: '' }
  }
}, { _id: false });

// Sub-schema for commission settings
const commissionSettingsSchema = new mongoose.Schema({
  defaultAgentCommission: { type: Number, default: 10, min: 0, max: 100 },
  defaultCounselorCommission: { type: Number, default: 5, min: 0, max: 100 },
  minCommission: { type: Number, default: 0 },
  maxCommission: { type: Number, default: 50 },
  commissionCurrency: { type: String, default: 'USD' },
  payoutThreshold: { type: Number, default: 100 },
  payoutFrequency: { type: String, enum: ['weekly', 'biweekly', 'monthly', 'on_request'], default: 'monthly' },
  autoApproveCommissions: { type: Boolean, default: false },
  commissionTiers: [{
    minStudents: { type: Number },
    maxStudents: { type: Number },
    commissionRate: { type: Number }
  }]
}, { _id: false });

// Sub-schema for application rules
const applicationRulesSchema = new mongoose.Schema({
  maxApplicationsPerStudent: { type: Number, default: 10 },
  applicationDeadlineDays: { type: Number, default: 30 },
  allowLateApplications: { type: Boolean, default: false },
  requireDocumentVerification: { type: Boolean, default: true },
  autoAssignCounselor: { type: Boolean, default: false },
  autoAssignAgent: { type: Boolean, default: false },
  statusFlow: {
    type: [String],
    default: ['PENDING_ADMIN_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED']
  },
  requiredDocuments: {
    type: [String],
    default: ['transcripts', 'passport', 'sop']
  },
  optionalDocuments: {
    type: [String],
    default: ['recommendation', 'resume', 'testScores']
  }
}, { _id: false });

// Sub-schema for user & role settings
const userRoleSettingsSchema = new mongoose.Schema({
  allowSelfRegistration: { type: Boolean, default: true },
  requireEmailVerification: { type: Boolean, default: true },
  requireAdminApproval: {
    student: { type: Boolean, default: false },
    agent: { type: Boolean, default: true },
    counselor: { type: Boolean, default: true }
  },
  defaultRolePermissions: {
    student: {
      canApplyServices: { type: Boolean, default: true },
      canUploadDocuments: { type: Boolean, default: true },
      canMessageCounselor: { type: Boolean, default: true }
    },
    agent: {
      canReferStudents: { type: Boolean, default: true },
      canViewCommissions: { type: Boolean, default: true },
      canWithdrawEarnings: { type: Boolean, default: true }
    },
    counselor: {
      canManageStudents: { type: Boolean, default: true },
      canAssignTasks: { type: Boolean, default: true },
      canViewReports: { type: Boolean, default: false }
    }
  },
  maxStudentsPerCounselor: { type: Number, default: 50 },
  maxStudentsPerAgent: { type: Number, default: 100 }
}, { _id: false });

// Sub-schema for email & notification settings
const emailNotificationSettingsSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  provider: { type: String, enum: ['resend', 'sendgrid', 'smtp', 'ses'], default: 'resend' },
  fromName: { type: String, default: 'Fly8' },
  fromEmail: { type: String, default: 'noreply@fly8.global' },
  replyToEmail: { type: String, default: 'support@fly8.global' },

  // Notification toggles
  notifications: {
    newStudentRegistration: { type: Boolean, default: true },
    newApplicationSubmitted: { type: Boolean, default: true },
    applicationStatusChange: { type: Boolean, default: true },
    taskAssigned: { type: Boolean, default: true },
    taskCompleted: { type: Boolean, default: true },
    commissionEarned: { type: Boolean, default: true },
    commissionPaid: { type: Boolean, default: true },
    documentUploaded: { type: Boolean, default: true },
    messageReceived: { type: Boolean, default: true },
    systemAlerts: { type: Boolean, default: true }
  },

  // Admin notification recipients
  adminNotificationEmails: [{ type: String }],

  // Email templates (IDs or names)
  templates: {
    welcome: { type: String, default: 'welcome_template' },
    passwordReset: { type: String, default: 'password_reset_template' },
    applicationConfirmation: { type: String, default: 'application_confirmation_template' },
    statusUpdate: { type: String, default: 'status_update_template' }
  }
}, { _id: false });

// Sub-schema for security settings
const securitySettingsSchema = new mongoose.Schema({
  passwordPolicy: {
    minLength: { type: Number, default: 8 },
    requireUppercase: { type: Boolean, default: true },
    requireLowercase: { type: Boolean, default: true },
    requireNumbers: { type: Boolean, default: true },
    requireSpecialChars: { type: Boolean, default: false },
    preventReuseCount: { type: Number, default: 3 }
  },
  sessionSettings: {
    sessionTimeout: { type: Number, default: 30 }, // minutes
    maxConcurrentSessions: { type: Number, default: 3 },
    rememberMeDuration: { type: Number, default: 7 } // days
  },
  twoFactorAuth: {
    enabled: { type: Boolean, default: false },
    requiredForRoles: { type: [String], default: ['super_admin'] },
    methods: { type: [String], default: ['email', 'authenticator'] }
  },
  loginAttempts: {
    maxAttempts: { type: Number, default: 5 },
    lockoutDuration: { type: Number, default: 15 } // minutes
  },
  ipWhitelist: {
    enabled: { type: Boolean, default: false },
    allowedIPs: [{ type: String }]
  },
  auditLogging: {
    enabled: { type: Boolean, default: true },
    retentionDays: { type: Number, default: 90 },
    loggedActions: {
      type: [String],
      default: ['login', 'logout', 'settings_change', 'user_create', 'user_update', 'user_delete']
    }
  }
}, { _id: false });

// Sub-schema for feature toggles
const featureTogglesSchema = new mongoose.Schema({
  modules: {
    studentPortal: { type: Boolean, default: true },
    agentPortal: { type: Boolean, default: true },
    counselorPortal: { type: Boolean, default: true },
    commissionTracking: { type: Boolean, default: true },
    documentManagement: { type: Boolean, default: true },
    messagingSystem: { type: Boolean, default: true },
    notificationCenter: { type: Boolean, default: true },
    reportsAnalytics: { type: Boolean, default: true },
    universityDirectory: { type: Boolean, default: true },
    courseSearch: { type: Boolean, default: true },
    visaGuidance: { type: Boolean, default: true },
    scholarshipSearch: { type: Boolean, default: true },
    loanAssistance: { type: Boolean, default: true },
    accommodationHelp: { type: Boolean, default: true }
  },
  features: {
    darkMode: { type: Boolean, default: false },
    multiLanguage: { type: Boolean, default: false },
    chatSupport: { type: Boolean, default: false },
    videoConsultation: { type: Boolean, default: false },
    onlinePayments: { type: Boolean, default: false },
    mobileApp: { type: Boolean, default: false },
    apiAccess: { type: Boolean, default: false },
    bulkImport: { type: Boolean, default: true },
    exportData: { type: Boolean, default: true }
  },
  maintenance: {
    enabled: { type: Boolean, default: false },
    message: { type: String, default: 'System is under maintenance. Please try again later.' },
    allowedRoles: { type: [String], default: ['super_admin'] }
  }
}, { _id: false });

// Sub-schema for payment/revenue configuration
const paymentSettingsSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  currency: { type: String, default: 'USD' },
  supportedCurrencies: { type: [String], default: ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD'] },
  paymentGateway: { type: String, enum: ['stripe', 'razorpay', 'paypal', 'none'], default: 'none' },

  // Service fees
  serviceFees: {
    profileAssessment: { type: Number, default: 0 },
    universityShortlisting: { type: Number, default: 0 },
    applicationAssistance: { type: Number, default: 0 },
    visaGuidance: { type: Number, default: 0 },
    scholarshipSearch: { type: Number, default: 0 },
    loanAssistance: { type: Number, default: 0 },
    accommodationHelp: { type: Number, default: 0 },
    preDepartureOrientation: { type: Number, default: 0 }
  },

  // Tax settings
  taxSettings: {
    enabled: { type: Boolean, default: false },
    taxRate: { type: Number, default: 0 },
    taxName: { type: String, default: 'Tax' },
    taxNumber: { type: String, default: '' }
  },

  // Refund policy
  refundPolicy: {
    allowRefunds: { type: Boolean, default: true },
    refundWindowDays: { type: Number, default: 14 },
    refundPercentage: { type: Number, default: 100 }
  }
}, { _id: false });

// Sub-schema for country settings
const countrySettingsSchema = new mongoose.Schema({
  enabledCountries: { type: [String], default: [] },
  popularDestinations: { type: [String], default: ['USA', 'UK', 'Canada', 'Australia', 'Germany'] },
  restrictedCountries: { type: [String], default: [] },
  defaultCountry: { type: String, default: 'India' }
}, { _id: false });

// Main Settings Schema
const settingsSchema = new mongoose.Schema({
  // Singleton identifier
  settingsId: {
    type: String,
    default: 'platform_settings',
    unique: true,
    required: true
  },

  // Settings sections
  platform: { type: platformProfileSchema, default: () => ({}) },
  commission: { type: commissionSettingsSchema, default: () => ({}) },
  applicationRules: { type: applicationRulesSchema, default: () => ({}) },
  userRoles: { type: userRoleSettingsSchema, default: () => ({}) },
  emailNotifications: { type: emailNotificationSettingsSchema, default: () => ({}) },
  security: { type: securitySettingsSchema, default: () => ({}) },
  features: { type: featureTogglesSchema, default: () => ({}) },
  payment: { type: paymentSettingsSchema, default: () => ({}) },
  countries: { type: countrySettingsSchema, default: () => ({}) },

  // Metadata
  lastUpdatedBy: { type: String, ref: 'User' },
  lastUpdatedAt: { type: Date, default: Date.now },
  version: { type: Number, default: 1 }

}, {
  timestamps: true,
  collection: 'platform_settings'
});

// Static method to get settings (creates default if not exists)
settingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne({ settingsId: 'platform_settings' });

  if (!settings) {
    settings = await this.create({ settingsId: 'platform_settings' });
  }

  return settings;
};

// Static method to update settings
settingsSchema.statics.updateSettings = async function(updates, userId) {
  const settings = await this.findOneAndUpdate(
    { settingsId: 'platform_settings' },
    {
      ...updates,
      lastUpdatedBy: userId,
      lastUpdatedAt: new Date(),
      $inc: { version: 1 }
    },
    { new: true, upsert: true, runValidators: true }
  );

  return settings;
};

// Static method to update a specific section
settingsSchema.statics.updateSection = async function(section, updates, userId) {
  const updateObj = {};
  updateObj[section] = updates;

  const settings = await this.findOneAndUpdate(
    { settingsId: 'platform_settings' },
    {
      $set: updateObj,
      lastUpdatedBy: userId,
      lastUpdatedAt: new Date(),
      $inc: { version: 1 }
    },
    { new: true, upsert: true, runValidators: true }
  );

  return settings;
};

// Note: settingsId already has unique index from schema definition

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
