/**
 * Public Contact Controller
 * Handles contact form submissions
 */

const nodemailer = require('nodemailer');

/**
 * Submit contact form
 * POST /api/v1/public/contact
 */
exports.submitContact = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required',
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    // Create email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    // Email to admin
    const adminMailOptions = {
      from: process.env.MAIL_USER,
      to: process.env.ADMIN_EMAIL || 'contact@fly8.global',
      subject: `New Contact Form Submission: ${subject || 'No Subject'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #667eea; color: white; padding: 20px; text-align: center;">
            <h2>New Contact Form Submission</h2>
          </div>
          <div style="padding: 20px; background: #f9f9f9;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
            ${subject ? `<p><strong>Subject:</strong> ${subject}</p>` : ''}
            <p><strong>Message:</strong></p>
            <div style="background: white; padding: 15px; border-left: 4px solid #667eea;">
              ${message.replace(/\n/g, '<br>')}
            </div>
          </div>
          <div style="padding: 10px; background: #333; color: white; text-align: center;">
            <small>Received at: ${new Date().toLocaleString()}</small>
          </div>
        </div>
      `,
    };

    // Confirmation email to user
    const userMailOptions = {
      from: process.env.MAIL_USER,
      to: email,
      subject: 'Thank you for contacting Fly8',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1>Thank You for Reaching Out!</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <p>Dear <strong>${name}</strong>,</p>
            <p>Thank you for contacting Fly8. We have received your message and our team will get back to you within 24-48 hours.</p>
            <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #667eea;">
              <h3 style="margin-top: 0; color: #667eea;">Your Message:</h3>
              <p>${message.replace(/\n/g, '<br>')}</p>
            </div>
            <p>If your inquiry is urgent, feel free to reach us at:</p>
            <ul style="list-style: none; padding: 0;">
              <li>📧 Email: contact@fly8.global</li>
              <li>📱 WhatsApp: +880 1784073483</li>
            </ul>
          </div>
          <div style="background: #333; color: white; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
            <p style="margin: 0;">© 2025 Fly8 - Your Global Education Partner</p>
          </div>
        </div>
      `,
    };

    // Send emails
    await Promise.all([
      transporter.sendMail(adminMailOptions),
      transporter.sendMail(userMailOptions),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Thank you for your message. We will get back to you soon!',
    });
  } catch (error) {
    console.error('Contact form error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send message. Please try again later.',
      error: error.message,
    });
  }
};
