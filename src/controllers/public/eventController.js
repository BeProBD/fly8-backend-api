/**
 * Public Event Controller
 * Handles public event registrations (German Course, GSTU)
 * No authentication required for registration
 */

const GermanCourseRegistration = require('../../models/GermanCourseRegistration');
const GstuRegistration = require('../../models/GstuRegistration');
const nodemailer = require('nodemailer');

// Email transporter configuration
const getTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
};

// =============================================================================
// GERMAN COURSE REGISTRATION
// =============================================================================

/**
 * Register for German Language Course
 * POST /api/v1/public/events/german-course/register
 */
exports.registerGermanCourse = async (req, res) => {
  try {
    const {
      fullName,
      email,
      whatsappNumber,
      academicLevel,
      otherAcademicLevel,
      previousFly8Course,
      fly8Relation,
    } = req.body;

    // Validate required fields
    if (!fullName || !email || !whatsappNumber || !academicLevel || !previousFly8Course || !fly8Relation) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled',
      });
    }

    // Check if email already exists
    const existingRegistration = await GermanCourseRegistration.findOne({ email });
    if (existingRegistration) {
      return res.status(409).json({
        success: false,
        message: 'This email is already registered for the German Language Course',
        registrationNumber: existingRegistration.registrationNumber,
      });
    }

    // Generate unique registration number
    let registrationNumber;
    let isUnique = false;
    while (!isUnique) {
      registrationNumber = 'GLC2025' + Math.floor(Math.random() * 90000 + 10000).toString();
      const existing = await GermanCourseRegistration.findOne({ registrationNumber });
      if (!existing) {
        isUnique = true;
      }
    }

    // Create registration
    const registration = new GermanCourseRegistration({
      fullName,
      email,
      whatsappNumber,
      academicLevel,
      otherAcademicLevel: academicLevel === 'Other' ? otherAcademicLevel : undefined,
      previousFly8Course,
      fly8Relation,
      registrationNumber,
    });

    await registration.save();

    // Send confirmation email
    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: process.env.MAIL_USER,
        to: email,
        subject: 'Registration Successful - German Language Free Course',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="margin: 0; font-size: 28px;">🎉 Congratulations!</h1>
              <h2 style="margin: 10px 0 0 0; font-weight: normal;">Registration Successful</h2>
            </div>
            <div style="padding: 30px; background: white;">
              <p style="font-size: 18px; color: #333;">Dear <strong>${fullName}</strong>,</p>
              <p style="color: #555; line-height: 1.6;">
                Thank you for registering for the <strong>German Language Free Course</strong> with Fly8!
              </p>
              <div style="background: #f0f0f0; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <h3 style="color: #667eea; margin-top: 0;">📋 Your Registration Details:</h3>
                <p style="margin: 5px 0;"><strong>Registration Number:</strong></p>
                <p style="font-size: 24px; color: #764ba2; font-weight: bold; margin: 5px 0;">${registrationNumber}</p>
                <p style="color: #d9534f; margin: 5px 0;">⚠️ Please save this number for future reference!</p>
              </div>
              <div style="background: #e3f2fd; padding: 20px; border-radius: 10px; border-left: 4px solid #2196f3; margin: 20px 0;">
                <h3 style="color: #1976d2; margin-top: 0;">📚 Course Details:</h3>
                <ul style="list-style: none; padding: 0; color: #555;">
                  <li style="margin: 8px 0;">📅 <strong>Start Date:</strong> 27 November, 2025</li>
                  <li style="margin: 8px 0;">🎓 <strong>Total Classes:</strong> 8</li>
                  <li style="margin: 8px 0;">💰 <strong>Course Fee:</strong> FREE</li>
                </ul>
              </div>
              <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px solid #eee;">
                <p style="color: #555; margin: 5px 0;">For any queries, contact us:</p>
                <p style="margin: 5px 0; color: #667eea;"><strong>📧 Email:</strong> contact@fly8.global</p>
                <p style="margin: 5px 0; color: #667eea;"><strong>📱 WhatsApp:</strong> +880 1784073483</p>
              </div>
            </div>
            <div style="background: #333; color: white; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
              <p style="margin: 0; font-size: 14px;">© 2025 Fly8 - Your Global Education Partner</p>
            </div>
          </div>
        `,
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
    }

    return res.status(201).json({
      success: true,
      message: 'Registration successful! Check your email for confirmation.',
      registrationNumber,
      data: registration,
    });
  } catch (error) {
    console.error('Registration error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', '),
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This email is already registered',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.',
    });
  }
};

/**
 * Get German Course registration by number
 * GET /api/v1/public/events/german-course/:registrationNumber
 */
exports.getGermanCourseRegistration = async (req, res) => {
  try {
    const { registrationNumber } = req.params;

    const registration = await GermanCourseRegistration.findOne({ registrationNumber });

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Registration not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: registration,
    });
  } catch (error) {
    console.error('Get registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching registration',
      error: error.message,
    });
  }
};

/**
 * Check if email exists for German Course
 * POST /api/v1/public/events/german-course/check-email
 */
exports.checkGermanCourseEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const existing = await GermanCourseRegistration.findOne({ email });

    if (existing) {
      return res.status(200).json({
        exists: true,
        message: 'This email is already registered',
        registrationNumber: existing.registrationNumber,
      });
    }

    return res.status(200).json({
      exists: false,
      message: 'Email is available',
    });
  } catch (error) {
    console.error('Check email error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking email',
      error: error.message,
    });
  }
};

// =============================================================================
// GSTU REGISTRATION
// =============================================================================

/**
 * Register for GSTU Event
 * POST /api/v1/public/events/gstu/register
 */
exports.registerGstu = async (req, res) => {
  try {
    const formData = req.body;

    // Generate unique registration number
    let regNum;
    let isUnique = false;
    while (!isUnique) {
      regNum = 'GEG2025' + Math.floor(Math.random() * 90000 + 10000).toString();
      const existing = await GstuRegistration.findOne({ registrationNumber: regNum });
      if (!existing) {
        isUnique = true;
      }
    }

    const registration = new GstuRegistration({
      ...formData,
      registrationNumber: regNum,
    });

    await registration.save();

    // Send confirmation email
    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: process.env.MAIL_USER,
        to: formData.email,
        subject: 'Registration Successful - Global Education Gateway Summit 2025',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1>🎉 Congratulations!</h1>
              <h2>Registration Successful</h2>
            </div>
            <div style="padding: 30px; background: #f8f9fa;">
              <p style="font-size: 18px;">Dear <strong>${formData.fullName}</strong>,</p>
              <p>You have successfully registered for the <strong>Global Education Gateway Summit 2025</strong>.</p>
              <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <h3 style="color: #667eea;">Your Registration Details:</h3>
                <p><strong>Registration Number:</strong> <span style="font-size: 24px; color: #764ba2;">${regNum}</span></p>
                <p style="color: red;">⚠️ Please save this number carefully!</p>
              </div>
              <div style="background: #d1ecf1; padding: 20px; border-radius: 10px; margin-top: 20px; border-left: 4px solid #0c5460;">
                <h3>📅 Event Details:</h3>
                <ul style="list-style: none; padding: 0;">
                  <li>📅 <strong>Date:</strong> 20 September, 2025</li>
                  <li>🕙 <strong>Time:</strong> 10:00 AM – 5:00 PM</li>
                  <li>📍 <strong>Venue:</strong> Gopalganj Science and Technology University</li>
                </ul>
              </div>
              <div style="text-align: center; margin-top: 30px;">
                <p>For any queries, contact us at:</p>
                <p>📧 Email: contact@fly8.global</p>
                <p>📱 WhatsApp: +880 1784073483</p>
              </div>
            </div>
            <div style="background: #333; color: white; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
              <p>© 2025 Fly8 & GSTU Research and Higher Studies Society</p>
            </div>
          </div>
        `,
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
    }

    return res.status(201).json({
      success: true,
      registrationNumber: regNum,
      data: registration,
    });
  } catch (error) {
    console.error('GSTU registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * Get GSTU registration by number
 * GET /api/v1/public/events/gstu/:registrationNumber
 */
exports.getGstuRegistration = async (req, res) => {
  try {
    const { registrationNumber } = req.params;

    const registration = await GstuRegistration.findOne({ registrationNumber });

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Registration not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: registration,
    });
  } catch (error) {
    console.error('Get GSTU registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching registration',
      error: error.message,
    });
  }
};

/**
 * Check if email/phone exists for GSTU
 * POST /api/v1/public/events/gstu/check-existing
 */
exports.checkGstuExisting = async (req, res) => {
  try {
    const { email, contactNumber } = req.body;

    const existing = await GstuRegistration.findOne({
      $or: [{ email }, { contactNumber }],
    });

    if (existing) {
      return res.status(200).json({
        exists: true,
        message: 'You have already registered for this event',
        registrationNumber: existing.registrationNumber,
      });
    }

    return res.status(200).json({
      exists: false,
    });
  } catch (error) {
    console.error('Check existing error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking registration',
      error: error.message,
    });
  }
};
