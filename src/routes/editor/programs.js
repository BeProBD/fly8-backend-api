/**
 * Editor Program Routes
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, isEditor } = require('../../middlewares/auth');
const { getPrograms, createProgram, updateProgram, deleteProgram } = require('../../controllers/editor/programController');

router.use(authMiddleware);
router.use(isEditor);

router.get('/', getPrograms);
router.post('/', createProgram);
router.put('/:id', updateProgram);
router.delete('/:id', deleteProgram);

module.exports = router;
