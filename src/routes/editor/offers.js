/**
 * Editor Offer Routes
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authMiddleware, isEditor } = require('../../middlewares/auth');
const { getOffers, createOffer, updateOffer, deleteOffer } = require('../../controllers/editor/offerController');

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

router.get('/', getOffers);
router.post('/', upload.single('bannerImage'), createOffer);
router.put('/:id', upload.single('bannerImage'), updateOffer);
router.delete('/:id', deleteOffer);

module.exports = router;
