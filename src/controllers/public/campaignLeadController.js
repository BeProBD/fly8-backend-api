/**
 * Campaign Lead Controller
 * Handles lead submissions from Facebook campaign landing pages
 */

const CampaignLead = require('../../models/CampaignLead');

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
