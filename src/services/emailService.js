/**
 * Email Service
 * Handles email delivery via Resend API
 */

const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'Fly8 <notifications@fly8.global>';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';

let resendClient = null;

// Initialize Resend if API key is available
if (RESEND_API_KEY) {
  resendClient = new Resend(RESEND_API_KEY);
  console.log('✅ Resend email service initialized');
} else {
  console.warn('⚠️  RESEND_API_KEY not found - email notifications will be logged only');
}

/**
 * Send notification email
 */
const sendNotificationEmail = async (options) => {
  const {
    to,
    recipientName,
    type,
    title,
    message,
    actionUrl,
    actionText,
    priority
  } = options;

  const html = generateEmailTemplate({
    recipientName,
    type,
    title,
    message,
    actionUrl: actionUrl ? `${DASHBOARD_URL}${actionUrl}` : null,
    actionText,
    priority
  });

  const subject = getEmailSubject(type, title);

  return await sendEmail({
    to,
    subject,
    html
  });
};

/**
 * Send generic email
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    if (!resendClient) {
      // Fallback: Log email if Resend is not configured
      console.log('\n📧 EMAIL (Not sent - Resend not configured):');
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`HTML: ${html.substring(0, 200)}...`);
      console.log('---\n');
      return { success: false, error: 'Resend not configured' };
    }

    const result = await resendClient.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
      text: text || null
    });

    console.log(`✅ Email sent to ${to}: ${subject}`);
    return { success: true, result };

  } catch (error) {
    console.error('Send email error:', error);
    throw error;
  }
};

/**
 * Get email subject based on notification type
 */
const getEmailSubject = (type, title) => {
  const subjectMap = {
    'SERVICE_REQUEST_CREATED': '🆕 New Service Request',
    'SERVICE_REQUEST_ASSIGNED': '✅ Request Assigned',
    'TASK_ASSIGNED': '📋 New Task Assigned',
    'TASK_SUBMITTED': '✍️ Task Submitted',
    'TASK_REVIEWED': '✅ Task Reviewed',
    'TASK_REVISION_REQUIRED': '🔄 Revision Requested',
    'TASK_COMPLETED': '✅ Task Completed',
    'SERVICE_COMPLETED': '🎉 Service Completed',
    'GENERAL': title
  };

  return subjectMap[type] || title;
};

/**
 * Generate HTML email template
 */
const generateEmailTemplate = (options) => {
  const {
    recipientName,
    type,
    title,
    message,
    actionUrl,
    actionText,
    priority
  } = options;

  const priorityColor = {
    'URGENT': '#dc2626',
    'HIGH': '#ea580c',
    'NORMAL': '#059669',
    'LOW': '#6b7280'
  };

  const color = priorityColor[priority] || priorityColor['NORMAL'];

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f3f4f6;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background-color: ${color};
      color: #ffffff;
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 16px;
      color: #374151;
      margin-bottom: 20px;
    }
    .message {
      font-size: 15px;
      line-height: 1.6;
      color: #4b5563;
      margin-bottom: 30px;
      padding: 20px;
      background-color: #f9fafb;
      border-left: 4px solid ${color};
      border-radius: 4px;
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      background-color: ${color};
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 15px;
      text-align: center;
      margin: 20px 0;
    }
    .button:hover {
      opacity: 0.9;
    }
    .footer {
      padding: 30px;
      text-align: center;
      font-size: 13px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
    }
    .footer a {
      color: ${color};
      text-decoration: none;
    }
    .logo {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 10px;
      color: #ffffff;
    }
    @media only screen and (max-width: 600px) {
      .content {
        padding: 30px 20px;
      }
      .button {
        display: block;
        margin: 20px auto;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Fly8</div>
      <h1>${title}</h1>
    </div>

    <div class="content">
      <div class="greeting">
        Hi ${recipientName},
      </div>

      <div class="message">
        ${message}
      </div>

      ${actionUrl && actionText ? `
        <center>
          <a href="${actionUrl}" class="button">${actionText}</a>
        </center>
      ` : ''}

      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        You can also access your dashboard anytime at
        <a href="${DASHBOARD_URL}" style="color: ${color};">${DASHBOARD_URL}</a>
      </p>
    </div>

    <div class="footer">
      <p>
        This email was sent by Fly8 - International Student Services Platform<br>
        <a href="${DASHBOARD_URL}">Dashboard</a> |
        <a href="https://fly8.global">Website</a> |
        <a href="mailto:support@fly8.global">Support</a>
      </p>
      <p style="margin-top: 15px; font-size: 12px;">
        © ${new Date().getFullYear()} Fly8. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
};

/**
 * Send welcome email to new user
 */
const sendWelcomeEmail = async (user, role) => {
  const roleText = {
    'student': 'Student',
    'counselor': 'Counselor',
    'agent': 'Agent',
    'super_admin': 'Super Administrator'
  };

  const html = generateEmailTemplate({
    recipientName: user.firstName,
    type: 'GENERAL',
    title: 'Welcome to Fly8!',
    message: `Welcome to Fly8! Your account has been successfully created as a ${roleText[role]}. You can now log in to your dashboard and start exploring our services.`,
    actionUrl: '/auth/login',
    actionText: 'Go to Dashboard',
    priority: 'NORMAL'
  });

  return await sendEmail({
    to: user.email,
    subject: '🎉 Welcome to Fly8!',
    html
  });
};

module.exports = {
  sendEmail,
  sendNotificationEmail,
  sendWelcomeEmail
};
