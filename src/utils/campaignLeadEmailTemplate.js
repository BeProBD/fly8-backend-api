/**
 * Campaign Lead Email Template
 * Generates the HTML notification email for a new campaign lead.
 */

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://app.fly8.com';

/**
 * Build the lead notification HTML email.
 * @param {Object} lead  - CampaignLead document
 * @returns {string}     - HTML string
 */
const buildLeadNotificationHtml = (lead) => {
  const { contactInfo = {}, serviceType, utmCampaign, utmSource, createdAt } = lead;

  const name    = contactInfo.fullName || '—';
  const phone   = contactInfo.phone    || '—';
  const email   = contactInfo.email    || '—';
  const city    = contactInfo.city     || contactInfo.knowUs || '—';
  const service = serviceType          || '—';
  const campaign = utmCampaign         || '—';
  const source  = utmSource            || '—';
  const date    = createdAt
    ? new Date(createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })
    : new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' });

  const dashboardLink = `${DASHBOARD_URL}/admin/reports/campaign-leads`;

  const row = (label, value) => `
    <tr>
      <td style="padding:10px 16px;font-weight:600;color:#374151;background:#f9fafb;width:40%;border-bottom:1px solid #e5e7eb;">${label}</td>
      <td style="padding:10px 16px;color:#111827;border-bottom:1px solid #e5e7eb;">${value}</td>
    </tr>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Fly8 Campaign Lead</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

    <!-- Header -->
    <div style="background:#0ea5e9;padding:32px 24px;text-align:center;">
      <div style="font-size:32px;font-weight:800;color:#ffffff;letter-spacing:-1px;">Fly8</div>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:600;color:#ffffff;">New Campaign Lead</h1>
    </div>

    <!-- Body -->
    <div style="padding:32px 24px;">
      <p style="margin:0 0 24px;font-size:15px;color:#4b5563;">
        A new lead was submitted via the Fly8 campaign landing page. Details are below.
      </p>

      <!-- Lead info table -->
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <tbody>
          ${row('Name',           name)}
          ${row('Phone',          phone)}
          ${row('Email',          email)}
          ${row('City / Know Us', city)}
          ${row('Service Type',   service)}
          ${row('Campaign',       campaign)}
          ${row('Source',         source)}
          ${row('Submitted At',   date)}
        </tbody>
      </table>

      <!-- CTA button -->
      <div style="text-align:center;margin-top:32px;">
        <a href="${dashboardLink}"
           style="display:inline-block;padding:14px 32px;background:#0ea5e9;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
          View Lead in Dashboard
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:24px;text-align:center;font-size:13px;color:#9ca3af;border-top:1px solid #e5e7eb;">
      © ${new Date().getFullYear()} Fly8 — International Student Services Platform
    </div>
  </div>
</body>
</html>`.trim();
};

module.exports = { buildLeadNotificationHtml };
