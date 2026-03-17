/**
 * Admin Campaign Leads Routes
 * All routes require super_admin role.
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../../middlewares/auth');
const {
  getCampaignLeads,
  getCampaignLeadById,
  updateCampaignLead,
  deleteCampaignLead,
  exportCampaignLeads,
  getServiceTypeStats,
} = require('../../controllers/admin/campaignLeadController');

const protect = [authMiddleware, roleMiddleware('super_admin')];

// Static sub-routes MUST be declared before /:id to avoid param collision
router.get('/stats',  ...protect, getServiceTypeStats);
router.get('/export', ...protect, exportCampaignLeads);

// GET /api/v1/admin/campaign-leads
router.get('/', ...protect, getCampaignLeads);

// GET /api/v1/admin/campaign-leads/:id
router.get('/:id', ...protect, getCampaignLeadById);

// PATCH /api/v1/admin/campaign-leads/:id
router.patch('/:id', ...protect, updateCampaignLead);

// DELETE /api/v1/admin/campaign-leads/:id
router.delete('/:id', ...protect, deleteCampaignLead);

module.exports = router;
