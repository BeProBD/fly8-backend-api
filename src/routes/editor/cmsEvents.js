/**
 * Editor CMS Event Routes
 * Requires authentication + editor or super_admin role
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authMiddleware, isEditor } = require('../../middlewares/auth');
const {
  getCmsEvents,
  getCmsEvent,
  createCmsEvent,
  updateCmsEvent,
  deleteCmsEvent,
} = require('../../controllers/editor/cmsEventController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});

router.use(authMiddleware);
router.use(isEditor);

router.get('/', getCmsEvents);
router.get('/:id', getCmsEvent);
router.post('/', upload.single('image'), createCmsEvent);
router.put('/:id', upload.single('image'), updateCmsEvent);
router.delete('/:id', deleteCmsEvent);

module.exports = router;
