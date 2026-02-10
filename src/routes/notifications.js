/**
 * Notification Routes
 * Endpoints for retrieving and managing notifications
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const notificationService = require('../services/notificationService');

/**
 * @route   GET /api/notifications
 * @desc    Get user's notifications with filtering and pagination
 * @access  Authenticated
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { isRead, type, page, limit } = req.query;

    const options = {
      isRead: isRead === 'true' ? true : isRead === 'false' ? false : null,
      type: type || null,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    };

    const result = await notificationService.getUserNotifications(
      req.user.userId,
      options
    );

    res.json(result);

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get count of unread notifications
 * @access  Authenticated
 */
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const Notification = require('../models/Notification');

    const unreadCount = await Notification.countDocuments({
      recipientId: req.user.userId,
      isRead: false
    });

    res.json({ unreadCount });

  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

/**
 * @route   PATCH /api/notifications/:notificationId/read
 * @desc    Mark notification as read
 * @access  Authenticated
 */
router.patch('/:notificationId/read', authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await notificationService.markAsRead(
      notificationId,
      req.user.userId
    );

    res.json({
      message: 'Notification marked as read',
      notification: {
        notificationId: notification.notificationId,
        isRead: notification.isRead,
        readAt: notification.readAt
      }
    });

  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: error.message || 'Failed to mark as read' });
  }
});

/**
 * @route   PATCH /api/notifications/mark-all-read
 * @desc    Mark all notifications as read
 * @access  Authenticated
 */
router.patch('/mark-all-read', authMiddleware, async (req, res) => {
  try {
    const result = await notificationService.markAllAsRead(req.user.userId);

    res.json({
      message: 'All notifications marked as read',
      count: result.modifiedCount
    });

  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

module.exports = router;
