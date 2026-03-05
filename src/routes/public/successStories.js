/**
 * Public Success Story Routes
 * No authentication required
 */

const express = require('express');
const router = express.Router();
const { getSuccessStories, getSuccessStory } = require('../../controllers/public/successStoryController');

router.get('/', getSuccessStories);
router.get('/:id', getSuccessStory);

module.exports = router;
