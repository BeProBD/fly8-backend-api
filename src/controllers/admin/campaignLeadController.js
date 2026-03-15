/**
 * Admin Campaign Lead Controller
 * Handles viewing, filtering, updating, and exporting Facebook campaign leads.
 * All endpoints require super_admin role (enforced in routes).
 */

const CampaignLead = require('../../models/CampaignLead');
const ExcelJS = require('exceljs');

const SERVICE_LABELS = {
  higher_education: 'Higher Education',
  university_application: 'University Application',
  visa_support: 'Visa Support',
  flight_ticket: 'Flight Ticket',
  accommodation: 'Accommodation',
  travel_support: 'Travel Support',
  job_support: 'Job Support',
  partner: 'Partner',
};

/** Build a reusable Mongoose filter from query params */
function buildFilter(query) {
  const filter = {};

  if (query.status) filter.status = query.status;
  if (query.serviceType) filter.serviceType = query.serviceType;

  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  if (query.search && query.search.trim()) {
    const regex = new RegExp(query.search.trim(), 'i');
    filter.$or = [
      { 'contactInfo.fullName': regex },
      { 'contactInfo.phone': regex },
      { 'contactInfo.email': regex },
    ];
  }

  return filter;
}

/**
 * GET /api/v1/admin/campaign-leads/stats
 * Returns total lead count per service type (global, no filters).
 */
exports.getServiceTypeStats = async (req, res) => {
  try {
    const rows = await CampaignLead.aggregate([
      { $group: { _id: '$serviceType', count: { $sum: 1 } } },
    ]);

    const byServiceType = {};
    rows.forEach(({ _id, count }) => {
      if (_id) byServiceType[_id] = count;
    });

    const total = rows.reduce((sum, r) => sum + r.count, 0);

    return res.status(200).json({ success: true, data: { byServiceType, total } });
  } catch (error) {
    console.error('Campaign leads stats error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * GET /api/v1/admin/campaign-leads
 * Paginated list with filtering and search.
 */
exports.getCampaignLeads = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = buildFilter(req.query);

    const [leads, total, categoryRows] = await Promise.all([
      CampaignLead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      CampaignLead.countDocuments(filter),
      // Global counts per service type — always unfiltered so category cards
      // always reflect the true totals regardless of active filters.
      CampaignLead.aggregate([{ $group: { _id: '$serviceType', count: { $sum: 1 } } }]),
    ]);

    const categoryStats = {};
    categoryRows.forEach(({ _id, count }) => { if (_id) categoryStats[_id] = count; });

    return res.status(200).json({
      success: true,
      data: leads,
      categoryStats,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Admin get campaign leads error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * GET /api/v1/admin/campaign-leads/:id
 * Single lead with full detail.
 */
exports.getCampaignLeadById = async (req, res) => {
  try {
    const lead = await CampaignLead.findById(req.params.id).lean();
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    return res.status(200).json({ success: true, data: lead });
  } catch (error) {
    console.error('Admin get lead by id error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * PATCH /api/v1/admin/campaign-leads/:id
 * Update status and/or admin notes.
 */
exports.updateCampaignLead = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const update = {};
    if (status) update.status = status;
    if (adminNotes !== undefined) update.adminNotes = adminNotes;

    const lead = await CampaignLead.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).lean();
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    return res.status(200).json({ success: true, data: lead });
  } catch (error) {
    console.error('Admin update lead error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * GET /api/v1/admin/campaign-leads/export
 * Download filtered leads as an Excel (.xlsx) file.
 */
exports.exportCampaignLeads = async (req, res) => {
  try {
    const filter = buildFilter(req.query);
    const leads = await CampaignLead.find(filter).sort({ createdAt: -1 }).lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fly8 Admin';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Campaign Leads');

    sheet.columns = [
      { header: 'Name',             key: 'name',             width: 24 },
      { header: 'Phone',            key: 'phone',            width: 18 },
      { header: 'Email',            key: 'email',            width: 30 },
      { header: 'Contact Mode',     key: 'contactMode',      width: 24 },
      { header: 'Contact Time',     key: 'contactTime',      width: 16 },
      { header: 'Contact When',     key: 'contactWhen',      width: 22 },
      { header: 'Heard About Us',   key: 'knowUs',           width: 20 },
      { header: 'Service Type',     key: 'serviceType',      width: 26 },
      { header: 'UTM Campaign',     key: 'utmCampaign',      width: 22 },
      { header: 'UTM Source',       key: 'utmSource',        width: 18 },
      { header: 'UTM Medium',       key: 'utmMedium',        width: 16 },
      { header: 'UTM Content',      key: 'utmContent',       width: 16 },
      { header: 'Source',           key: 'source',           width: 20 },
      { header: 'Status',           key: 'status',           width: 14 },
      { header: 'Notes',            key: 'notes',            width: 32 },
      { header: 'Admin Notes',      key: 'adminNotes',       width: 32 },
      // serviceData — higher_education fields
      { header: 'Study Level',      key: 'he_level',         width: 18 },
      { header: 'Preferred Region', key: 'he_region',        width: 22 },
      { header: 'Subject',          key: 'he_subject',       width: 22 },
      { header: 'Last Degree',      key: 'he_last_degree',   width: 18 },
      { header: 'CGPA',             key: 'he_cgpa',          width: 12 },
      { header: 'Study Gap',        key: 'he_study_gap',     width: 16 },
      { header: 'Intake',           key: 'he_intake',        width: 20 },
      { header: 'Budget',           key: 'he_budget',        width: 20 },
      { header: 'English Test',     key: 'he_english_test',  width: 22 },
      { header: 'Submitted At',     key: 'createdAt',        width: 24 },
    ];

    // Style the header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.height = 28;

    leads.forEach(lead => {
      const ci = lead.contactInfo || {};
      const sd = lead.serviceData || {};
      const row = sheet.addRow({
        name:            ci.fullName     || '',
        phone:           ci.phone        || '',
        email:           ci.email        || '',
        contactMode:     ci.contactMode  || '',
        contactTime:     ci.contactTime  || '',
        contactWhen:     ci.contactWhen  || '',
        knowUs:          ci.knowUs       || '',
        serviceType:     SERVICE_LABELS[lead.serviceType] || lead.serviceType || '',
        utmCampaign:     lead.utmCampaign || '',
        utmSource:       lead.utmSource   || '',
        utmMedium:       lead.utmMedium   || '',
        utmContent:      lead.utmContent  || '',
        source:          lead.source      || '',
        status:          lead.status      || '',
        notes:           ci.notes         || '',
        adminNotes:      lead.adminNotes  || '',
        he_level:        sd.he_level         || '',
        he_region:       sd.he_region        || '',
        he_subject:      sd.he_subject       || '',
        he_last_degree:  sd.he_last_degree   || '',
        he_cgpa:         sd.he_cgpa          || '',
        he_study_gap:    sd.he_study_gap     || '',
        he_intake:       sd.he_intake        || '',
        he_budget:       sd.he_budget        || '',
        he_english_test: sd.he_english_test  || '',
        createdAt:       lead.createdAt ? new Date(lead.createdAt).toLocaleString('en-GB') : '',
      });

      // Alternate row shading
      if (row.number % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFF' } };
      }
    });

    // Auto-filter on header row
    sheet.autoFilter = { from: 'A1', to: `Z1` };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-leads-${Date.now()}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Campaign leads export error:', error);
    return res.status(500).json({ success: false, message: 'Export failed', error: error.message });
  }
};
