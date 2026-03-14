/**
 * Public Campaign Leads Routes
 * No authentication required — used by Facebook campaign landing page
 */

const express = require('express');
const router = express.Router();
const {
  submitCampaignLead,
} = require('../../controllers/public/campaignLeadController');

// POST /api/v1/public/campaign-leads
router.post('/', submitCampaignLead);

module.exports = router;
