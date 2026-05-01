const express = require('express');
const {
  submitInternApplication,
  getAllInternApplications,
  exportInternApplicationsToExcel,
} = require('../controllers/InternController');
const { authMiddleware } = require('../middlewares/auth');

const router = express.Router();

router.post('/apply', submitInternApplication);
router.get('/all', authMiddleware, getAllInternApplications);
router.get('/export', authMiddleware, exportInternApplicationsToExcel);

module.exports = router;
