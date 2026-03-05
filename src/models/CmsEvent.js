/**
 * CmsEvent Model
 * Events managed via the Editor CMS (distinct from event registrations)
 */

const mongoose = require('mongoose');

const cmsEventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    location: {
      type: String,
      trim: true,
      maxlength: [300, 'Location cannot exceed 300 characters'],
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    category: {
      type: String,
      trim: true,
      maxlength: [100, 'Category cannot exceed 100 characters'],
      default: 'General',
    },
    image: {
      type: String, // Cloudinary URL
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  { timestamps: true }
);

// Generate slug from title before saving
cmsEventSchema.pre('save', function (next) {
  if (this.isModified('title') && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

cmsEventSchema.index({ isPublished: 1, startDate: -1 });
cmsEventSchema.index({ isFeatured: 1 });
cmsEventSchema.index({ slug: 1 });

module.exports = mongoose.model('CmsEvent', cmsEventSchema);
