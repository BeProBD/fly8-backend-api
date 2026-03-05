/**
 * SuccessStory Model
 * Student success stories managed via the Editor CMS
 */

const mongoose = require('mongoose');

const successStorySchema = new mongoose.Schema(
  {
    studentName: {
      type: String,
      required: [true, 'Student name is required'],
      trim: true,
      maxlength: [100, 'Student name cannot exceed 100 characters'],
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
      maxlength: [100, 'Country cannot exceed 100 characters'],
    },
    university: {
      type: String,
      required: [true, 'University is required'],
      trim: true,
      maxlength: [200, 'University cannot exceed 200 characters'],
    },
    program: {
      type: String,
      required: [true, 'Program is required'],
      trim: true,
      maxlength: [200, 'Program cannot exceed 200 characters'],
    },
    quote: {
      type: String,
      required: [true, 'Quote is required'],
      trim: true,
      maxlength: [1000, 'Quote cannot exceed 1000 characters'],
    },
    year: {
      type: String,
      trim: true,
      maxlength: [10, 'Year cannot exceed 10 characters'],
    },
    flag: {
      type: String,
      trim: true,
      maxlength: [10, 'Flag cannot exceed 10 characters'],
    },
    avatar: {
      type: String, // Cloudinary URL
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  { timestamps: true }
);

successStorySchema.index({ isPublished: 1, createdAt: -1 });
successStorySchema.index({ order: 1 });

module.exports = mongoose.model('SuccessStory', successStorySchema);
