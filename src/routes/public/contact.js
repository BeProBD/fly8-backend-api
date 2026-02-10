/**
 * Public Contact Routes
 * No authentication required
 */

const express = require('express');
const router = express.Router();
const { submitContact } = require('../../controllers/public/contactController');

// POST /api/v1/public/contact
router.post('/', submitContact);

// Legacy support: POST /api/v1/reach/contact
router.post('/contact', submitContact);

module.exports = router;
