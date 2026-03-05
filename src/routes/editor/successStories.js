/**
 * Editor Success Story Routes
 * Requires authentication + editor or super_admin role
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authMiddleware, isEditor } = require('../../middlewares/auth');
const {
  getSuccessStories,
  getSuccessStory,
  createSuccessStory,
  updateSuccessStory,
  deleteSuccessStory,
} = require('../../controllers/editor/successStoryController');

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

router.get('/', getSuccessStories);
router.get('/:id', getSuccessStory);
router.post('/', upload.single('avatar'), createSuccessStory);
router.put('/:id', upload.single('avatar'), updateSuccessStory);
router.delete('/:id', deleteSuccessStory);

module.exports = router;
