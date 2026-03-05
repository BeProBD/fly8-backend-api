/**
 * Editor Blog Routes
 * Requires authentication + editor or super_admin role
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authMiddleware, isEditor } = require('../../middlewares/auth');
const {
  getEditorBlogs,
  createBlog,
  updateBlog,
  deleteBlog,
  uploadImage,
} = require('../../controllers/editor/blogController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});

router.use(authMiddleware);
router.use(isEditor);

router.get('/', getEditorBlogs);
router.post('/upload', upload.single('image'), uploadImage);
router.post('/', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'authorImage', maxCount: 1 }]), createBlog);
router.put('/:id', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'authorImage', maxCount: 1 }]), updateBlog);
router.delete('/:id', deleteBlog);

module.exports = router;
