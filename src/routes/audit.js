const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const AuditLog = require('../models/AuditLog');

// Get audit logs (admin only)
router.get('/', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { userId, action, startDate, endDate, limit = 100 } = req.query;
    
    const filter = {};
    if (userId) filter.userId = userId;
    if (action) filter.action = action;
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json({ logs, count: logs.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get user activity
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Only allow users to see their own logs or admins to see all
    if (req.user.role !== 'super_admin' && req.user.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const logs = await AuditLog.find({ userId })
      .sort({ timestamp: -1 })
      .limit(50);

    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user activity' });
  }
});

// Get audit statistics
router.get('/stats', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const totalLogs = await AuditLog.countDocuments();
    
    const actionCounts = await AuditLog.aggregate([
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const recentActivity = await AuditLog.find()
      .sort({ timestamp: -1 })
      .limit(10);

    res.json({
      totalLogs,
      actionCounts,
      recentActivity
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit statistics' });
  }
});

module.exports = router;