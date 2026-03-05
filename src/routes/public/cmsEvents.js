/**
 * Public CMS Event Routes
 * No authentication required
 */

const express = require('express');
const router = express.Router();
const { getCmsEvents, getCmsEvent } = require('../../controllers/public/cmsEventController');

router.get('/', getCmsEvents);
router.get('/:idOrSlug', getCmsEvent);

module.exports = router;
