/**
 * Editor Blog Controller
 * Blogs are published immediately — no approval workflow
 */

const Blog = require('../../models/Blog');
const { cloudinary } = require('../../config/cloudinary');
const sanitizeHtml = require('sanitize-html');

const sanitizeContent = content =>
  sanitizeHtml(content, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img', 'h1', 'h2', 'figure', 'figcaption', 'iframe',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen'],
      '*': ['class', 'id', 'style'],
    },
    allowedIframeHostnames: ['www.youtube.com', 'player.vimeo.com'],
  });

const uploadToCloudinary = async file => {
  const base64Image = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(base64Image, {
    resource_type: 'image',
    folder: 'fly8-blogs',
    timeout: 120000,
  });
  return result.secure_url;
};

/** GET /api/v1/editor/blogs */
exports.getEditorBlogs = async (req, res) => {
  try {
    const { status, limit = 20, page = 1 } = req.query;
    const filter = status ? { status } : {};

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const blogs = await Blog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'firstName lastName email');

    const total = await Blog.countDocuments(filter);

    res.json({
      success: true,
      data: blogs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch blogs', error: error.message });
  }
};

/** POST /api/v1/editor/blogs */
exports.createBlog = async (req, res) => {
  try {
    const { title, content, authorName, excerpt, category, layout, saveAsDraft, image, authorImage } = req.body;

    if (!title || !content || !authorName) {
      return res.status(400).json({ success: false, message: 'Title, content, and author name are required' });
    }

    // Editor publishes directly — no approval needed
    const saveAsDraftBool = saveAsDraft === 'true' || saveAsDraft === true;
    const status = saveAsDraftBool ? 'draft' : 'published';
    const sanitizedContent = sanitizeContent(content);

    let imageUrl = image;
    let authorImageUrl = authorImage;

    if (req.files) {
      if (req.files.image?.[0]) imageUrl = await uploadToCloudinary(req.files.image[0]);
      if (req.files.authorImage?.[0]) authorImageUrl = await uploadToCloudinary(req.files.authorImage[0]);
    }

    // Ensure slug is unique
    let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const existing = await Blog.findOne({ slug });
    if (existing) slug = `${slug}-${Date.now()}`;

    const blog = new Blog({
      title,
      slug,
      content: sanitizedContent,
      authorName,
      status,
      publishedAt: status === 'published' ? new Date() : undefined,
      createdBy: req.user._id,
      ...(excerpt && { excerpt }),
      ...(category && { category }),
      ...(layout && { layout }),
      ...(imageUrl && { image: imageUrl }),
      ...(authorImageUrl && { authorImage: authorImageUrl }),
    });

    await blog.save();
    res.status(201).json({ success: true, message: 'Blog created successfully', data: blog });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create blog', error: error.message });
  }
};

/** PUT /api/v1/editor/blogs/:id */
exports.updateBlog = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    if (req.body.content) req.body.content = sanitizeContent(req.body.content);

    // If going from draft to published, set publishedAt
    if (req.body.status === 'published' && blog.status !== 'published') {
      req.body.publishedAt = new Date();
    }

    Object.assign(blog, req.body);

    if (req.files) {
      if (req.files.image?.[0]) blog.image = await uploadToCloudinary(req.files.image[0]);
      if (req.files.authorImage?.[0]) blog.authorImage = await uploadToCloudinary(req.files.authorImage[0]);
    }

    await blog.save();
    res.json({ success: true, message: 'Blog updated successfully', data: blog });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update blog', error: error.message });
  }
};

/** DELETE /api/v1/editor/blogs/:id */
exports.deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    await Blog.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Blog deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete blog', error: error.message });
  }
};

/** POST /api/v1/editor/blogs/upload */
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const url = await uploadToCloudinary(req.file);
    res.json({ success: true, url });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to upload image', error: error.message });
  }
};
