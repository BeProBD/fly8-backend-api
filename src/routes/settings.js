/**
 * Settings API Routes
 * Platform settings management endpoints for Super Admin
 * All endpoints require super_admin role
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const Settings = require('../models/Settings');
const { createAuditLog } = require('../utils/auditLogger');

// ============================================
// GET / - Get all platform settings
// ============================================
router.get('/', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const settings = await Settings.getSettings();

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

// ============================================
// GET /:section - Get specific settings section
// ============================================
router.get('/:section', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { section } = req.params;
    const validSections = ['platform', 'commission', 'applicationRules', 'userRoles', 'emailNotifications', 'security', 'features', 'payment', 'countries'];

    if (!validSections.includes(section)) {
      return res.status(400).json({
        success: false,
        error: `Invalid section. Valid sections: ${validSections.join(', ')}`
      });
    }

    const settings = await Settings.getSettings();

    res.json({
      success: true,
      data: settings[section],
      section
    });
  } catch (error) {
    console.error('Get settings section error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch settings section' });
  }
});

// ============================================
// PUT / - Update all settings
// ============================================
router.put('/', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const updates = req.body;
    const userId = req.user.userId;

    // Get current settings for audit log
    const currentSettings = await Settings.getSettings();
    const previousState = currentSettings.toObject();

    // Update settings
    const updatedSettings = await Settings.updateSettings(updates, userId);

    // Create audit log
    try {
      await createAuditLog({
        actorUserId: userId,
        actorRole: req.user.role,
        action: 'settings_updated',
        entityType: 'settings',
        entityId: 'platform_settings',
        previousState: {
          platform: previousState.platform,
          commission: previousState.commission,
          applicationRules: previousState.applicationRules,
          userRoles: previousState.userRoles,
          emailNotifications: previousState.emailNotifications,
          security: previousState.security,
          features: previousState.features,
          payment: previousState.payment,
          countries: previousState.countries
        },
        newState: {
          platform: updatedSettings.platform,
          commission: updatedSettings.commission,
          applicationRules: updatedSettings.applicationRules,
          userRoles: updatedSettings.userRoles,
          emailNotifications: updatedSettings.emailNotifications,
          security: updatedSettings.security,
          features: updatedSettings.features,
          payment: updatedSettings.payment,
          countries: updatedSettings.countries
        },
        details: { updateType: 'full_update' },
        req
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: updatedSettings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// ============================================
// PUT /:section - Update specific settings section
// ============================================
router.put('/:section', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { section } = req.params;
    const updates = req.body;
    const userId = req.user.userId;

    const validSections = ['platform', 'commission', 'applicationRules', 'userRoles', 'emailNotifications', 'security', 'features', 'payment', 'countries'];

    if (!validSections.includes(section)) {
      return res.status(400).json({
        success: false,
        error: `Invalid section. Valid sections: ${validSections.join(', ')}`
      });
    }

    // Get current settings for audit log
    const currentSettings = await Settings.getSettings();
    const previousSectionState = currentSettings[section];

    // Update the specific section
    const updatedSettings = await Settings.updateSection(section, updates, userId);

    // Create audit log
    try {
      await createAuditLog({
        actorUserId: userId,
        actorRole: req.user.role,
        action: 'settings_section_updated',
        entityType: 'settings',
        entityId: 'platform_settings',
        previousState: { [section]: previousSectionState },
        newState: { [section]: updatedSettings[section] },
        details: { section, updateType: 'section_update' },
        req
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    res.json({
      success: true,
      message: `${section} settings updated successfully`,
      data: updatedSettings[section],
      section
    });
  } catch (error) {
    console.error('Update settings section error:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings section' });
  }
});

// ============================================
// POST /reset - Reset settings to defaults
// ============================================
router.post('/reset', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { section } = req.body;
    const userId = req.user.userId;

    // Get current settings for audit log
    const currentSettings = await Settings.getSettings();

    if (section) {
      // Reset specific section to defaults
      const validSections = ['platform', 'commission', 'applicationRules', 'userRoles', 'emailNotifications', 'security', 'features', 'payment', 'countries'];

      if (!validSections.includes(section)) {
        return res.status(400).json({
          success: false,
          error: `Invalid section. Valid sections: ${validSections.join(', ')}`
        });
      }

      const previousSectionState = currentSettings[section];

      // Create a new settings instance to get default values
      const defaultSettings = new Settings();
      const defaultSectionValue = defaultSettings[section];

      const updatedSettings = await Settings.updateSection(section, defaultSectionValue, userId);

      // Audit log
      try {
        await createAuditLog({
          actorUserId: userId,
          actorRole: req.user.role,
          action: 'settings_section_reset',
          entityType: 'settings',
          entityId: 'platform_settings',
          previousState: { [section]: previousSectionState },
          newState: { [section]: defaultSectionValue },
          details: { section, updateType: 'reset_to_default' },
          req
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }

      res.json({
        success: true,
        message: `${section} settings reset to defaults`,
        data: updatedSettings[section],
        section
      });
    } else {
      // Reset all settings - Delete and recreate
      const previousState = currentSettings.toObject();

      await Settings.deleteOne({ settingsId: 'platform_settings' });
      const newSettings = await Settings.getSettings();

      // Audit log
      try {
        await createAuditLog({
          actorUserId: userId,
          actorRole: req.user.role,
          action: 'settings_full_reset',
          entityType: 'settings',
          entityId: 'platform_settings',
          previousState,
          newState: newSettings.toObject(),
          details: { updateType: 'full_reset_to_default' },
          req
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }

      res.json({
        success: true,
        message: 'All settings reset to defaults',
        data: newSettings
      });
    }
  } catch (error) {
    console.error('Reset settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset settings' });
  }
});

// ============================================
// GET /history - Get settings change history
// ============================================
router.get('/audit/history', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const AuditLog = require('../models/AuditLog');

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const history = await AuditLog.find({
      entityType: 'settings',
      action: { $in: ['settings_updated', 'settings_section_updated', 'settings_section_reset', 'settings_full_reset'] }
    })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await AuditLog.countDocuments({
      entityType: 'settings',
      action: { $in: ['settings_updated', 'settings_section_updated', 'settings_section_reset', 'settings_full_reset'] }
    });

    // Enrich with user info
    const User = require('../models/User');
    const enrichedHistory = await Promise.all(
      history.map(async (log) => {
        const user = await User.findOne({ userId: log.actorUserId })
          .select('firstName lastName email')
          .lean();
        return {
          ...log,
          actor: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
          actorEmail: user?.email
        };
      })
    );

    res.json({
      success: true,
      data: enrichedHistory,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get settings history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch settings history' });
  }
});

// ============================================
// POST /test-email - Test email configuration
// ============================================
router.post('/test-email', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    // Get current email settings
    const settings = await Settings.getSettings();
    const emailSettings = settings.emailNotifications;

    if (!emailSettings.enabled) {
      return res.status(400).json({
        success: false,
        error: 'Email notifications are disabled'
      });
    }

    // Try to send test email using notification service
    try {
      const { createNotification } = require('../services/notificationService');

      await createNotification({
        recipientId: req.user.userId,
        type: 'SYSTEM',
        title: 'Test Email from Fly8',
        message: 'This is a test email to verify your email configuration is working correctly.',
        channel: 'EMAIL',
        priority: 'NORMAL'
      });

      res.json({
        success: true,
        message: `Test email sent to ${email}`
      });
    } catch (emailError) {
      console.error('Test email error:', emailError);
      res.status(500).json({
        success: false,
        error: 'Failed to send test email. Please check your email configuration.'
      });
    }
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ success: false, error: 'Failed to send test email' });
  }
});

// ============================================
// GET /countries/list - Get available countries
// ============================================
router.get('/countries/list', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    // Common countries list
    const countries = [
      { code: 'US', name: 'United States' },
      { code: 'UK', name: 'United Kingdom' },
      { code: 'CA', name: 'Canada' },
      { code: 'AU', name: 'Australia' },
      { code: 'DE', name: 'Germany' },
      { code: 'FR', name: 'France' },
      { code: 'NL', name: 'Netherlands' },
      { code: 'IE', name: 'Ireland' },
      { code: 'NZ', name: 'New Zealand' },
      { code: 'SG', name: 'Singapore' },
      { code: 'IN', name: 'India' },
      { code: 'CN', name: 'China' },
      { code: 'JP', name: 'Japan' },
      { code: 'KR', name: 'South Korea' },
      { code: 'AE', name: 'United Arab Emirates' },
      { code: 'SA', name: 'Saudi Arabia' },
      { code: 'MY', name: 'Malaysia' },
      { code: 'TH', name: 'Thailand' },
      { code: 'PH', name: 'Philippines' },
      { code: 'ID', name: 'Indonesia' },
      { code: 'VN', name: 'Vietnam' },
      { code: 'BD', name: 'Bangladesh' },
      { code: 'PK', name: 'Pakistan' },
      { code: 'LK', name: 'Sri Lanka' },
      { code: 'NP', name: 'Nepal' },
      { code: 'NG', name: 'Nigeria' },
      { code: 'GH', name: 'Ghana' },
      { code: 'KE', name: 'Kenya' },
      { code: 'ZA', name: 'South Africa' },
      { code: 'EG', name: 'Egypt' },
      { code: 'BR', name: 'Brazil' },
      { code: 'MX', name: 'Mexico' },
      { code: 'CO', name: 'Colombia' },
      { code: 'AR', name: 'Argentina' },
      { code: 'CL', name: 'Chile' },
      { code: 'ES', name: 'Spain' },
      { code: 'IT', name: 'Italy' },
      { code: 'PT', name: 'Portugal' },
      { code: 'SE', name: 'Sweden' },
      { code: 'NO', name: 'Norway' },
      { code: 'DK', name: 'Denmark' },
      { code: 'FI', name: 'Finland' },
      { code: 'PL', name: 'Poland' },
      { code: 'CZ', name: 'Czech Republic' },
      { code: 'AT', name: 'Austria' },
      { code: 'CH', name: 'Switzerland' },
      { code: 'BE', name: 'Belgium' },
      { code: 'RU', name: 'Russia' },
      { code: 'TR', name: 'Turkey' }
    ];

    res.json({
      success: true,
      data: countries.sort((a, b) => a.name.localeCompare(b.name))
    });
  } catch (error) {
    console.error('Get countries list error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch countries list' });
  }
});

// ============================================
// POST /upload-logo - Upload platform logo
// ============================================
router.post('/upload-logo', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    if (!req.files || !req.files.logo) {
      return res.status(400).json({
        success: false,
        error: 'No logo file provided'
      });
    }

    const logo = req.files.logo;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(logo.mimetype)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Allowed types: PNG, JPEG, SVG, WebP'
      });
    }

    // Validate file size (max 2MB)
    if (logo.size > 2 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: 'File size too large. Maximum size: 2MB'
      });
    }

    // Upload to Cloudinary
    const cloudinary = require('cloudinary').v2;
    const result = await cloudinary.uploader.upload(logo.tempFilePath, {
      folder: 'fly8/platform',
      public_id: `logo_${Date.now()}`,
      transformation: [
        { width: 500, height: 500, crop: 'limit' },
        { quality: 'auto' }
      ]
    });

    // Update settings with new logo URL
    const settings = await Settings.getSettings();
    const previousLogoUrl = settings.platform.logoUrl;

    settings.platform.logoUrl = result.secure_url;
    settings.lastUpdatedBy = req.user.userId;
    settings.lastUpdatedAt = new Date();
    await settings.save();

    // Audit log
    try {
      await createAuditLog({
        actorUserId: req.user.userId,
        actorRole: req.user.role,
        action: 'settings_logo_updated',
        entityType: 'settings',
        entityId: 'platform_settings',
        previousState: { logoUrl: previousLogoUrl },
        newState: { logoUrl: result.secure_url },
        details: { updateType: 'logo_upload' },
        req
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    res.json({
      success: true,
      message: 'Logo uploaded successfully',
      data: {
        logoUrl: result.secure_url
      }
    });
  } catch (error) {
    console.error('Upload logo error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload logo' });
  }
});

module.exports = router;
