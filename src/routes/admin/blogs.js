/**
 * Admin Blog Routes
 * Requires authentication and super_admin role
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authMiddleware, roleMiddleware } = require('../../middlewares/auth');
const {
  getAdminBlogs,
  createBlog,
  updateBlog,
  deleteBlog,
  submitForReview,
  approveBlog,
  rejectBlog,
  uploadImage,
} = require('../../controllers/admin/blogController');

// Multer configuration for blog images
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// All routes require authentication and super_admin role
router.use(authMiddleware);
router.use(roleMiddleware('super_admin'));

// GET /api/v1/admin/blogs - Get all blogs (including drafts)
router.get('/', getAdminBlogs);

// POST /api/v1/admin/blogs - Create blog
router.post(
  '/',
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'authorImage', maxCount: 1 },
  ]),
  createBlog
);

// POST /api/v1/admin/blogs/upload - Upload image
router.post('/upload', upload.single('image'), uploadImage);
router.post('/imgupload', upload.single('image'), uploadImage); // Legacy

// PUT /api/v1/admin/blogs/:id - Update blog
router.put(
  '/:id',
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'authorImage', maxCount: 1 },
  ]),
  updateBlog
);

// PUT /api/v1/admin/blogs/:id/submit - Submit for review
router.put('/:id/submit', submitForReview);

// PUT /api/v1/admin/blogs/:id/approve - Approve blog
router.put('/:id/approve', approveBlog);

// PUT /api/v1/admin/blogs/:id/reject - Reject blog
router.put('/:id/reject', rejectBlog);

// DELETE /api/v1/admin/blogs/:id - Delete blog
router.delete('/:id', deleteBlog);

module.exports = router;
