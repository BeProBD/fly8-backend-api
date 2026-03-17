/**
 * Email Utility (Nodemailer / SMTP)
 * ─────────────────────────────────
 * Reusable transactional email sender using Gmail SMTP.
 * Separate from the existing Resend-based notification service.
 *
 * ENV required:
 *   MAIL_HOST  – SMTP host        (e.g. smtp.gmail.com)
 *   MAIL_USER  – Sender address   (e.g. contact@fly8.global)
 *   MAIL_PASS  – App password
 */

const nodemailer = require('nodemailer');

// ── Transport ──────────────────────────────────────────────────────────────

const createTransport = () =>
  nodemailer.createTransport({
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

// ── Core send function ─────────────────────────────────────────────────────

/**
 * Send an HTML email.
 *
 * @param {Object} options
 * @param {string|string[]} options.to       - Recipient(s)
 * @param {string}          options.subject  - Email subject
 * @param {string}          options.html     - HTML body
 * @returns {Promise<{success: boolean, info?: object, error?: string}>}
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
    const transporter = createTransport();

    const recipients = Array.isArray(to) ? to.join(', ') : to;

    const info = await transporter.sendMail({
      from: `"Fly8" <${process.env.MAIL_USER}>`,
      to: recipients,
      subject,
      html,
    });

    console.log(`✅ [emailService] Email sent to ${recipients} | msgId: ${info.messageId}`);
    return { success: true, info };
  } catch (error) {
    console.error('❌ [emailService] Failed to send email:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail };
