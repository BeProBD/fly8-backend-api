/**
 * Commission Service
 * Handles automatic commission creation, wallet calculations, and invoice generation.
 * Used by application and service request completion triggers.
 */

const { v4: uuidv4 } = require('uuid');
const Commission = require('../models/Commission');
const User = require('../models/User');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const Student = require('../models/Student');
const { emitToUser } = require('../socket/socketManager');
const { logAudit } = require('../utils/auditLogger');

// Service type display names
const SERVICE_TYPE_NAMES = {
  PROFILE_ASSESSMENT: 'Profile Assessment',
  UNIVERSITY_SHORTLISTING: 'University Shortlisting',
  APPLICATION_ASSISTANCE: 'Application Assistance',
  VISA_GUIDANCE: 'Visa Guidance',
  SCHOLARSHIP_SEARCH: 'Scholarship Search',
  LOAN_ASSISTANCE: 'Loan Assistance',
  ACCOMMODATION_HELP: 'Accommodation Help',
  PRE_DEPARTURE_ORIENTATION: 'Pre-Departure Orientation'
};

/**
 * Create commission when a university Application reaches 'Completed' status.
 * @param {Object} application - The completed Application document
 * @param {String} triggeredBy - userId of who triggered the status change
 */
async function createApplicationCommission(application, triggeredBy) {
  // Idempotency: check if commission already exists for this application
  const existing = await Commission.findOne({
    applicationId: application.applicationId,
    isDeleted: false
  });
  if (existing) {
    console.log(`Commission already exists for application ${application.applicationId}`);
    return existing;
  }

  const agentId = application.agentId;
  if (!agentId) return null;

  // Get agent's commission rate
  const agent = await User.findOne({ userId: agentId }).lean();
  if (!agent || !agent.isActive) return null;

  // Get platform settings for tiers and defaults
  const settings = await Settings.getSettings();
  const commissionSettings = settings?.commission || {};

  // Determine commission rate (agent-specific or tier-based or default)
  let commissionRate = agent.commissionPercentage || commissionSettings.defaultAgentCommission || 10;

  // Check if tier-based rate applies
  if (commissionSettings.commissionTiers && commissionSettings.commissionTiers.length > 0) {
    const completedCount = await Commission.countDocuments({
      agentId,
      commissionType: 'APPLICATION',
      status: { $in: ['pending', 'approved', 'paid'] },
      isDeleted: false
    });
    const applicableTier = commissionSettings.commissionTiers
      .filter(t => completedCount >= (t.minStudents || 0))
      .sort((a, b) => (b.minStudents || 0) - (a.minStudents || 0))[0];
    if (applicableTier && applicableTier.commissionRate > commissionRate) {
      commissionRate = applicableTier.commissionRate;
    }
  }

  // Determine base amount (university tuition or default)
  // Try to get from the university's tuition data, fall back to a configurable default
  let baseAmount = 10000; // Default base amount if tuition not found
  try {
    const University = require('../models/University');
    if (application.universityCode) {
      const university = await University.findOne({ universitycode: application.universityCode }).lean();
      if (university && university.tuitionData && university.tuitionData.length > 0) {
        const tuitionEntry = university.tuitionData[0];
        const parsed = parseFloat(String(tuitionEntry.amount || '0').replace(/[^0-9.]/g, ''));
        if (parsed > 0) baseAmount = parsed;
      }
    }
  } catch (e) {
    // University model might not have tuition data, use default
  }

  const amount = Math.round((baseAmount * commissionRate / 100) * 100) / 100;
  const currency = commissionSettings.commissionCurrency || 'USD';
  const autoApprove = commissionSettings.autoApproveCommissions || false;

  // Find the student record
  const student = await Student.findOne({ studentId: application.studentId }).lean();

  const commission = new Commission({
    commissionId: uuidv4(),
    agentId,
    studentId: application.studentId,
    commissionType: 'APPLICATION',
    applicationId: application.applicationId,
    universityName: application.universityName,
    universityCode: application.universityCode,
    programName: application.programName,
    baseAmount,
    percentage: commissionRate,
    amount,
    currency,
    status: autoApprove ? 'approved' : 'pending',
    description: `Commission for ${application.universityName} - ${application.programName}`,
    statusHistory: [{
      status: autoApprove ? 'approved' : 'pending',
      changedBy: 'system',
      changedAt: new Date(),
      note: autoApprove
        ? 'Commission auto-approved per platform settings'
        : 'Commission created upon application completion'
    }]
  });

  if (autoApprove) {
    commission.approvedBy = 'system';
    commission.approvedAt = new Date();
  }

  await commission.save();

  // Update agent earnings on User model
  await updateAgentEarnings(agentId);

  // Notify agent
  try {
    const notification = new Notification({
      notificationId: uuidv4(),
      recipientId: agentId,
      type: 'COMMISSION_EARNED',
      title: 'New Commission Earned',
      message: `You earned ${currency} ${amount.toFixed(2)} commission for ${application.universityName} application.`,
      channel: 'BOTH',
      priority: 'NORMAL',
      relatedEntities: { commissionId: commission.commissionId }
    });
    await notification.save();
    emitToUser(agentId, 'new_notification', notification);
    emitToUser(agentId, 'commission_created', commission);
  } catch (e) {
    console.error('Commission notification error:', e.message);
  }

  // Notify super admins about new commission needing review
  if (!autoApprove) {
    try {
      const admins = await User.find({ role: 'super_admin', isActive: true }).lean();
      for (const admin of admins) {
        const adminNotif = new Notification({
          notificationId: uuidv4(),
          recipientId: admin.userId,
          type: 'COMMISSION_PENDING_REVIEW',
          title: 'Commission Pending Review',
          message: `New commission of ${currency} ${amount.toFixed(2)} for agent ${agent.firstName} ${agent.lastName} needs approval.`,
          channel: 'DASHBOARD',
          priority: 'NORMAL',
          relatedEntities: { commissionId: commission.commissionId }
        });
        await adminNotif.save();
        emitToUser(admin.userId, 'new_notification', adminNotif);
      }
    } catch (e) {
      console.error('Admin notification error:', e.message);
    }
  }

  // Audit log
  logAudit(triggeredBy || 'system', 'commission_created', 'commission', commission.commissionId, {
    agentId, amount, commissionType: 'APPLICATION', applicationId: application.applicationId
  });

  return commission;
}

/**
 * Create commission when a ServiceRequest reaches 'COMPLETED' status.
 * @param {Object} serviceRequest - The completed ServiceRequest document
 * @param {String} triggeredBy - userId of who triggered the status change
 */
async function createVASCommission(serviceRequest, triggeredBy) {
  const agentId = serviceRequest.assignedAgent;
  if (!agentId) return null;

  // Idempotency: check if commission already exists for this service request
  const existing = await Commission.findOne({
    serviceRequestId: serviceRequest.serviceRequestId,
    isDeleted: false
  });
  if (existing) {
    console.log(`Commission already exists for service request ${serviceRequest.serviceRequestId}`);
    return existing;
  }

  // Get agent's commission rate
  const agent = await User.findOne({ userId: agentId }).lean();
  if (!agent || !agent.isActive) return null;

  // Get platform settings
  const settings = await Settings.getSettings();
  const commissionSettings = settings?.commission || {};
  const paymentSettings = settings?.payment || {};

  let commissionRate = agent.commissionPercentage || commissionSettings.defaultAgentCommission || 10;

  // Get base amount from service fees in Settings
  const serviceTypeKey = serviceTypeToFeeKey(serviceRequest.serviceType);
  let baseAmount = 500; // Default VAS fee
  if (paymentSettings.serviceFees && paymentSettings.serviceFees[serviceTypeKey]) {
    const fee = paymentSettings.serviceFees[serviceTypeKey];
    if (fee > 0) baseAmount = fee;
  }

  const amount = Math.round((baseAmount * commissionRate / 100) * 100) / 100;
  const currency = commissionSettings.commissionCurrency || 'USD';
  const autoApprove = commissionSettings.autoApproveCommissions || false;

  const commission = new Commission({
    commissionId: uuidv4(),
    agentId,
    studentId: serviceRequest.studentId,
    commissionType: 'VAS',
    serviceRequestId: serviceRequest.serviceRequestId,
    serviceType: serviceRequest.serviceType,
    baseAmount,
    percentage: commissionRate,
    amount,
    currency,
    status: autoApprove ? 'approved' : 'pending',
    description: `Commission for ${SERVICE_TYPE_NAMES[serviceRequest.serviceType] || serviceRequest.serviceType}`,
    statusHistory: [{
      status: autoApprove ? 'approved' : 'pending',
      changedBy: 'system',
      changedAt: new Date(),
      note: autoApprove
        ? 'Commission auto-approved per platform settings'
        : 'Commission created upon service completion'
    }]
  });

  if (autoApprove) {
    commission.approvedBy = 'system';
    commission.approvedAt = new Date();
  }

  await commission.save();

  // Update agent earnings
  await updateAgentEarnings(agentId);

  // Notify agent
  try {
    const notification = new Notification({
      notificationId: uuidv4(),
      recipientId: agentId,
      type: 'COMMISSION_EARNED',
      title: 'New Commission Earned',
      message: `You earned ${currency} ${amount.toFixed(2)} commission for ${SERVICE_TYPE_NAMES[serviceRequest.serviceType] || 'service completion'}.`,
      channel: 'BOTH',
      priority: 'NORMAL',
      relatedEntities: { commissionId: commission.commissionId }
    });
    await notification.save();
    emitToUser(agentId, 'new_notification', notification);
    emitToUser(agentId, 'commission_created', commission);
  } catch (e) {
    console.error('Commission notification error:', e.message);
  }

  // Notify admins if manual approval needed
  if (!autoApprove) {
    try {
      const admins = await User.find({ role: 'super_admin', isActive: true }).lean();
      for (const admin of admins) {
        const adminNotif = new Notification({
          notificationId: uuidv4(),
          recipientId: admin.userId,
          type: 'COMMISSION_PENDING_REVIEW',
          title: 'Commission Pending Review',
          message: `New VAS commission of ${currency} ${amount.toFixed(2)} for agent ${agent.firstName} ${agent.lastName} needs approval.`,
          channel: 'DASHBOARD',
          priority: 'NORMAL',
          relatedEntities: { commissionId: commission.commissionId }
        });
        await adminNotif.save();
        emitToUser(admin.userId, 'new_notification', adminNotif);
      }
    } catch (e) {
      console.error('Admin notification error:', e.message);
    }
  }

  logAudit(triggeredBy || 'system', 'commission_created', 'commission', commission.commissionId, {
    agentId, amount, commissionType: 'VAS', serviceRequestId: serviceRequest.serviceRequestId
  });

  return commission;
}

/**
 * Get agent wallet data (computed from commissions).
 */
async function getAgentWallet(agentId) {
  const [pending, approved, paid, lastPayout] = await Promise.all([
    Commission.aggregate([
      { $match: { agentId, status: 'pending', isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    Commission.aggregate([
      { $match: { agentId, status: 'approved', isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    Commission.aggregate([
      { $match: { agentId, status: 'paid', isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    Commission.findOne({ agentId, status: 'paid', isDeleted: false })
      .sort({ paidAt: -1 })
      .select('paidAt amount')
      .lean()
  ]);

  const settings = await Settings.getSettings();
  const payoutThreshold = settings?.commission?.payoutThreshold || 100;

  const availableBalance = approved[0]?.total || 0;
  const pendingBalance = pending[0]?.total || 0;
  const lifetimeEarnings = paid[0]?.total || 0;
  const totalCommissions = (pending[0]?.count || 0) + (approved[0]?.count || 0) + (paid[0]?.count || 0);

  return {
    availableBalance,
    pendingBalance,
    lifetimeEarnings,
    totalCommissions,
    payoutThreshold,
    isPayoutEligible: availableBalance >= payoutThreshold,
    lastPayoutDate: lastPayout?.paidAt || null,
    lastPayoutAmount: lastPayout?.amount || null
  };
}

/**
 * Generate sequential invoice number.
 */
async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const lastInvoice = await Commission.findOne({
    invoiceNumber: { $regex: `^FLY8-INV-${year}-` }
  }).sort({ invoiceNumber: -1 }).lean();

  let seq = 1;
  if (lastInvoice && lastInvoice.invoiceNumber) {
    const parts = lastInvoice.invoiceNumber.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `FLY8-INV-${year}-${String(seq).padStart(5, '0')}`;
}

/**
 * Update agent's totalEarnings and pendingEarnings on User model.
 */
async function updateAgentEarnings(agentId) {
  try {
    const [paidAgg, pendingAgg] = await Promise.all([
      Commission.aggregate([
        { $match: { agentId, status: 'paid', isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Commission.aggregate([
        { $match: { agentId, status: { $in: ['pending', 'approved'] }, isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    await User.updateOne(
      { userId: agentId },
      {
        totalEarnings: paidAgg[0]?.total || 0,
        pendingEarnings: pendingAgg[0]?.total || 0
      }
    );
  } catch (e) {
    console.error('Update agent earnings error:', e.message);
  }
}

/**
 * Convert serviceType enum to Settings serviceFees key.
 */
function serviceTypeToFeeKey(serviceType) {
  const map = {
    PROFILE_ASSESSMENT: 'profileAssessment',
    UNIVERSITY_SHORTLISTING: 'universityShortlisting',
    APPLICATION_ASSISTANCE: 'applicationAssistance',
    VISA_GUIDANCE: 'visaGuidance',
    SCHOLARSHIP_SEARCH: 'scholarshipSearch',
    LOAN_ASSISTANCE: 'loanAssistance',
    ACCOMMODATION_HELP: 'accommodationHelp',
    PRE_DEPARTURE_ORIENTATION: 'preDepartureOrientation'
  };
  return map[serviceType] || 'applicationAssistance';
}

module.exports = {
  createApplicationCommission,
  createVASCommission,
  getAgentWallet,
  generateInvoiceNumber,
  updateAgentEarnings,
  SERVICE_TYPE_NAMES
};
