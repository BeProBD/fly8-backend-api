/**
 * Public Blog Controller
 * Handles public/marketing endpoints for blogs (no authentication required)
 */

const Blog = require('../../models/Blog');

/**
 * Get all published blogs
 * GET /api/v1/public/blogs
 */
exports.getPublishedBlogs = async (req, res) => {
  try {
    const { category, limit, page } = req.query;

    const filter = { status: 'published' };

    if (category) {
      filter.category = { $regex: new RegExp(category, 'i') };
    }

    // Pagination
    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const blogs = await Blog.find(filter)
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .populate('createdBy', 'firstName lastName');

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
    console.error('Error fetching blogs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch blogs',
      error: error.message,
    });
  }
};

/**
 * Get single blog by ID
 * GET /api/v1/public/blogs/:id
 */
exports.getBlogById = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id).populate('createdBy', 'firstName lastName');

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    // Increment view count
    blog.views = (blog.views || 0) + 1;
    await blog.save();

    return res.status(200).json({
      success: true,
      data: blog,
    });
  } catch (error) {
    console.error('Error fetching blog:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch blog',
      error: error.message,
    });
  }
};

/**
 * Get blog by slug
 * GET /api/v1/public/blogs/slug/:slug
 */
exports.getBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const blog = await Blog.findOne({
      slug,
      status: 'published',
    }).populate('createdBy', 'firstName lastName');

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    // Increment view count
    blog.views = (blog.views || 0) + 1;
    await blog.save();

    return res.status(200).json({
      success: true,
      data: blog,
    });
  } catch (error) {
    console.error('Error fetching blog:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch blog',
      error: error.message,
    });
  }
};

/**
 * Get blogs by category
 * GET /api/v1/public/blogs/category/:category
 */
exports.getBlogsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { limit, page } = req.query;

    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const blogs = await Blog.find({
      category: { $regex: new RegExp(category, 'i') },
      status: 'published',
    })
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .populate('createdBy', 'firstName lastName');

    const total = await Blog.countDocuments({
      category: { $regex: new RegExp(category, 'i') },
      status: 'published',
    });

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
    console.error('Error fetching blogs by category:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch blogs',
      error: error.message,
    });
  }
};

/**
 * Get blog categories
 * GET /api/v1/public/blogs/categories
 */
exports.getCategories = async (req, res) => {
  try {
    const categories = await Blog.aggregate([
      { $match: { status: 'published', category: { $exists: true, $ne: '' } } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    return res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message,
    });
  }
};
