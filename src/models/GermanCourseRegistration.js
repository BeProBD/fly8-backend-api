/**
 * German Course Registration Model
 * German Language Free Course Registration
 */

const mongoose = require('mongoose');

const germanCourseRegistrationSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email address',
      ],
    },
    whatsappNumber: {
      type: String,
      required: [true, 'WhatsApp number is required'],
      trim: true,
      match: [
        /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/,
        'Please enter a valid phone number',
      ],
    },
    academicLevel: {
      type: String,
      required: [true, 'Academic level is required'],
      enum: [
        'HSC / Equivalent',
        'Diploma',
        'Undergraduate',
        'Graduate',
        'Postgraduate',
        'Job Holder',
        'Other',
      ],
    },
    otherAcademicLevel: {
      type: String,
      trim: true,
      maxlength: [100, 'Other academic level cannot exceed 100 characters'],
    },
    previousFly8Course: {
      type: String,
      required: [true, 'Please indicate if you have participated in previous courses'],
      enum: [
        'Yes – IELTS Course',
        'Yes – Japanese Language Course',
        'Yes – Both',
        'No – This will be my first course',
      ],
    },
    fly8Relation: {
      type: String,
      required: [true, 'Please indicate your relation with Fly8 Family'],
      enum: ['Member', 'Intern', 'None of the above'],
    },
    registrationNumber: {
      type: String,
      unique: true,
      required: true,
    },
    registrationDate: {
      type: Date,
      default: Date.now,
    },
    courseDetails: {
      totalClasses: {
        type: Number,
        default: 8,
      },
      startDate: {
        type: String,
        default: '27 November, 2025',
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (email and registrationNumber already have unique indexes from schema)
germanCourseRegistrationSchema.index({ createdAt: -1 });

// Pre-save validation
germanCourseRegistrationSchema.pre('save', function (next) {
  if (this.academicLevel === 'Other' && !this.otherAcademicLevel) {
    next(new Error('Please specify your academic level'));
  }
  next();
});

module.exports = mongoose.model('GermanCourseRegistration', germanCourseRegistrationSchema);
