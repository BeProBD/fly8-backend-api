/**
 * Editor University Routes
 */

const express = require('express');
const router  = express.Router();
const { authMiddleware, isEditor } = require('../../middlewares/auth');
const {
  getUniversities,
  createUniversity,
  updateUniversity,
  deleteUniversity,
} = require('../../controllers/editor/universityController');

router.use(authMiddleware);
router.use(isEditor);

router.get('/',    getUniversities);
router.post('/',   createUniversity);
router.put('/:id', updateUniversity);
router.delete('/:id', deleteUniversity);

module.exports = router;
