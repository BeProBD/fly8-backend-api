/**
 * Admin Blog Controller
 * CRUD operations for blogs (super_admin only)
 */

const Blog = require('../../models/Blog');
const { cloudinary } = require('../../config/cloudinary');
const DOMPurify = require('isomorphic-dompurify');

// Sanitize HTML content
const sanitizeContent = content => DOMPurify.sanitize(content);

// Upload to Cloudinary
const uploadToCloudinary = async file => {
  try {
    const base64Image = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(base64Image, {
      resource_type: 'image',
      folder: 'fly8-blogs',
      timeout: 120000,
    });
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

/**
 * Get all blogs (including drafts) for admin
 * GET /api/v1/admin/blogs
 */
exports.getAdminBlogs = async (req, res) => {
  try {
    const { status, limit, page } = req.query;
    const filter = status ? { status } : {};

    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 20;
    const skip = (pageNumber - 1) * limitNumber;

    const blogs = await Blog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .populate('createdBy', 'firstName lastName email');

    const total = await Blog.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: blogs,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error('Error fetching admin blogs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch blogs',
      error: error.message,
    });
  }
};

/**
 * Create blog
 * POST /api/v1/admin/blogs
 */
exports.createBlog = async (req, res) => {
  try {
    const {
      title,
      content,
      authorName,
      excerpt,
      category,
      layout,
      saveAsDraft,
      image,
      authorImage,
    } = req.body;

    if (!title || !content || !authorName) {
      return res.status(400).json({
        success: false,
        message: 'Title, content, and author name are required',
      });
    }

    const status = saveAsDraft === 'true' || saveAsDraft === true ? 'draft' : 'pending';
    const sanitizedContent = sanitizeContent(content);

    let imageUrl = image;
    let authorImageUrl = authorImage;

    // Handle file uploads
    if (req.files) {
      if (req.files.image && req.files.image[0]) {
        imageUrl = await uploadToCloudinary(req.files.image[0]);
      }
      if (req.files.authorImage && req.files.authorImage[0]) {
        authorImageUrl = await uploadToCloudinary(req.files.authorImage[0]);
      }
    }

    const blogData = {
      title,
      content: sanitizedContent,
      authorName,
      status,
      createdBy: req.user?._id,
    };

    if (excerpt) blogData.excerpt = excerpt;
    if (category) blogData.category = category;
    if (layout) blogData.layout = layout;
    if (imageUrl) blogData.image = imageUrl;
    if (authorImageUrl) blogData.authorImage = authorImageUrl;

    const blog = new Blog(blogData);
    await blog.save();

    return res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      data: blog,
    });
  } catch (error) {
    console.error('Error creating blog:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create blog',
      error: error.message,
    });
  }
};

/**
 * Update blog
 * PUT /api/v1/admin/blogs/:id
 */
exports.updateBlog = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    // Update fields
    if (req.body.content) {
      req.body.content = sanitizeContent(req.body.content);
    }

    Object.assign(blog, req.body);

    // Handle file uploads
    if (req.files) {
      if (req.files.image && req.files.image[0]) {
        blog.image = await uploadToCloudinary(req.files.image[0]);
      }
      if (req.files.authorImage && req.files.authorImage[0]) {
        blog.authorImage = await uploadToCloudinary(req.files.authorImage[0]);
      }
    }

    await blog.save();

    return res.status(200).json({
      success: true,
      message: 'Blog updated successfully',
      data: blog,
    });
  } catch (error) {
    console.error('Error updating blog:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update blog',
      error: error.message,
    });
  }
};

/**
 * Delete blog
 * DELETE /api/v1/admin/blogs/:id
 */
exports.deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    await Blog.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Blog deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting blog:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete blog',
      error: error.message,
    });
  }
};

/**
 * Submit blog for review
 * PUT /api/v1/admin/blogs/:id/submit
 */
exports.submitForReview = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id);
    if (!blog || blog.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Invalid blog or status',
      });
    }

    blog.status = 'pending';
    await blog.save();

    return res.status(200).json({
      success: true,
      message: 'Blog submitted for review',
      data: blog,
    });
  } catch (error) {
    console.error('Error submitting blog:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit blog',
      error: error.message,
    });
  }
};

/**
 * Approve blog
 * PUT /api/v1/admin/blogs/:id/approve
 */
exports.approveBlog = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id);
    if (!blog || blog.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Invalid blog or status',
      });
    }

    blog.status = 'published';
    blog.publishedAt = new Date();
    await blog.save();

    return res.status(200).json({
      success: true,
      message: 'Blog approved and published',
      data: blog,
    });
  } catch (error) {
    console.error('Error approving blog:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve blog',
      error: error.message,
    });
  }
};

/**
 * Reject blog
 * PUT /api/v1/admin/blogs/:id/reject
 */
exports.rejectBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const blog = await Blog.findById(id);
    if (!blog || blog.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Invalid blog or status',
      });
    }

    blog.status = 'rejected';
    blog.rejectionReason = reason;
    await blog.save();

    return res.status(200).json({
      success: true,
      message: 'Blog rejected',
      data: blog,
    });
  } catch (error) {
    console.error('Error rejecting blog:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject blog',
      error: error.message,
    });
  }
};

/**
 * Upload image
 * POST /api/v1/admin/blogs/upload
 */
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const url = await uploadToCloudinary(req.file);

    return res.status(200).json({
      success: true,
      url,
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message,
    });
  }
};
