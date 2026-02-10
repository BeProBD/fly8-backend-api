/**
 * Public Blog Routes
 * No authentication required
 */

const express = require('express');
const router = express.Router();
const {
  getPublishedBlogs,
  getBlogById,
  getBlogBySlug,
  getBlogsByCategory,
  getCategories,
} = require('../../controllers/public/blogController');

// GET /api/v1/public/blogs - Get published blogs
// Also serves: GET /api/v1/blog/blogs (legacy)
router.get('/', getPublishedBlogs);
router.get('/blogs', getPublishedBlogs); // Legacy support

// GET /api/v1/public/blogs/categories - Get blog categories
router.get('/categories', getCategories);

// GET /api/v1/public/blogs/slug/:slug - Get blog by slug
router.get('/slug/:slug', getBlogBySlug);

// GET /api/v1/public/blogs/category/:category - Get blogs by category
router.get('/category/:category', getBlogsByCategory);

// GET /api/v1/public/blogs/:id - Get blog by ID
router.get('/:id', getBlogById);

module.exports = router;
