/**
 * Campaign Lead Controller
 * Handles lead submissions from Facebook campaign landing pages
 */

const CampaignLead = require('../../models/CampaignLead');
const { sendEmail } = require('../../utils/emailService');
const { buildLeadNotificationHtml } = require('../../utils/campaignLeadEmailTemplate');

// Primary recipient always receives lead notifications
const LEAD_NOTIFY_EMAIL = process.env.MAIL_LEAD_NOTIFY || 'contact.beprobd@gmail.com';

/**
 * Fire-and-forget: send email notification after a lead is saved.
 * Errors are logged but never bubble up to the HTTP response.
 */
const sendLeadNotificationEmail = (lead) => {
  try {
    // Build recipient list: always include primary; add lead email if present
    const recipients = [LEAD_NOTIFY_EMAIL];
    if (lead.contactInfo?.email) {
      recipients.push(lead.contactInfo.email);
    }

    const html = buildLeadNotificationHtml(lead);

    // Non-blocking: do not await — response returns immediately
    sendEmail({
      to: recipients,
      subject: 'New Fly8 Campaign Lead',
      html,
    }).catch((err) =>
      console.error('❌ [campaignLead] Background email error:', err.message)
    );
  } catch (err) {
    // Template/setup errors should never crash the request
    console.error('❌ [campaignLead] Email notification setup failed:', err.message);
  }
};

/**
 * Submit a campaign lead
 * POST /api/v1/public/campaign-leads
 */
exports.submitCampaignLead = async (req, res) => {
  try {
    const {
      serviceType,
      serviceData,
      contactInfo,
      utmSource,
      utmCampaign,
      utmMedium,
      utmContent,
    } = req.body;

    // Validate required fields
    if (!serviceType) {
      return res.status(400).json({
        success: false,
        message: 'serviceType is required',
      });
    }

    const validServiceTypes = [
      'higher_education',
      'university_application',
      'visa_support',
      'flight_ticket',
      'accommodation',
      'travel_support',
      'job_support',
      'partner',
    ];

    if (!validServiceTypes.includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid serviceType',
      });
    }

    if (!contactInfo) {
      return res.status(400).json({
        success: false,
        message: 'contactInfo is required',
      });
    }

    const { fullName, phone, email } = contactInfo;

    if (!fullName || !phone || !email) {
      return res.status(400).json({
        success: false,
        message: 'fullName, phone, and email are required',
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    const lead = await CampaignLead.create({
      serviceType,
      serviceData: serviceData || {},
      contactInfo,
      utmSource: utmSource || null,
      utmCampaign: utmCampaign || null,
      utmMedium: utmMedium || null,
      utmContent: utmContent || null,
      source: 'facebook_campaign',
      status: 'new',
    });

    // Send notification email (non-blocking — does not delay response)
    sendLeadNotificationEmail(lead);

    return res.status(201).json({
      success: true,
      message: 'Lead submitted successfully',
      data: { id: lead._id },
    });
  } catch (error) {
    console.error('Campaign lead submission error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit. Please try again.',
      error: error.message,
    });
  }
};

/**
 * Get all campaign leads (for admin use)
 * GET /api/v1/public/campaign-leads — protected separately via admin route
 */
exports.getCampaignLeads = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.serviceType) filter.serviceType = req.query.serviceType;

    const [leads, total] = await Promise.all([
      CampaignLead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      CampaignLead.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: leads,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get campaign leads error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
