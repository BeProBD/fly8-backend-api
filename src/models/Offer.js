/**
 * Offer Model
 * Promotional offers shown on the marketing website
 */

const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    bannerImage: {
      type: String, // Cloudinary URL
    },
    country: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

offerSchema.index({ isActive: 1, createdAt: -1 });
offerSchema.index({ isActive: 1, country: 1, createdAt: -1 });

module.exports = mongoose.model('Offer', offerSchema);
