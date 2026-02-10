/**
 * Notification Service
 * Handles dual-channel notifications (Email + Dashboard)
 * Integrates with Resend for email delivery and Socket.io for real-time updates
 */

const { v4: uuidv4 } = require('uuid');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { getIO } = require('../socket/socketManager');
const emailService = require('./emailService');

/**
 * Create and send notification
 * @param {Object} options - Notification options
 * @param {String} options.recipientId - User ID of recipient
 * @param {String} options.type - Notification type
 * @param {String} options.title - Notification title
 * @param {String} options.message - Notification message
 * @param {String} options.channel - EMAIL, DASHBOARD, or BOTH (default: BOTH)
 * @param {String} options.priority - LOW, NORMAL, HIGH, URGENT
 * @param {String} options.actionUrl - Optional URL for action button
 * @param {String} options.actionText - Optional text for action button
 * @param {Object} options.relatedEntities - Related entity IDs
 * @param {Object} options.metadata - Additional metadata
 */
const createNotification = async (options) => {
  try {
    const {
      recipientId,
      type,
      title,
      message,
      channel = 'BOTH',
      priority = 'NORMAL',
      actionUrl = null,
      actionText = null,
      relatedEntities = {},
      metadata = {}
    } = options;

    // Validate required fields
    if (!recipientId || !type || !title || !message) {
      throw new Error('Missing required notification fields');
    }

    // Get recipient user
    const recipient = await User.findOne({ userId: recipientId });
    if (!recipient) {
      throw new Error('Recipient user not found');
    }

    // Create notification record
    const notificationId = uuidv4();
    const notification = new Notification({
      notificationId,
      recipientId,
      type,
      title,
      message,
      channel,
      priority,
      actionUrl,
      actionText,
      relatedEntities,
      metadata
    });

    await notification.save();

    // Send via appropriate channels
    const results = {
      notificationId,
      dashboard: false,
      email: false,
      errors: []
    };

    // Dashboard notification (real-time via Socket.io)
    if (channel === 'DASHBOARD' || channel === 'BOTH') {
      try {
        await sendDashboardNotification(notification, recipient);
        results.dashboard = true;
      } catch (error) {
        console.error('Dashboard notification error:', error);
        results.errors.push({ channel: 'dashboard', error: error.message });
      }
    }

    // Email notification
    if (channel === 'EMAIL' || channel === 'BOTH') {
      try {
        await sendEmailNotification(notification, recipient);
        notification.emailSent = true;
        notification.emailSentAt = new Date();
        await notification.save();
        results.email = true;
      } catch (error) {
        console.error('Email notification error:', error);
        notification.emailError = error.message;
        await notification.save();
        results.errors.push({ channel: 'email', error: error.message });
      }
    }

    return results;

  } catch (error) {
    console.error('Create notification error:', error);
    throw error;
  }
};

/**
 * Send dashboard notification via Socket.io
 */
const sendDashboardNotification = async (notification, recipient) => {
  try {
    const io = getIO();
    if (!io) {
      throw new Error('Socket.io not initialized');
    }

    // Emit to user's room (users join with pattern `user:${userId}`)
    io.to(`user:${recipient.userId}`).emit('notification', {
      notificationId: notification.notificationId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      actionUrl: notification.actionUrl,
      actionText: notification.actionText,
      createdAt: notification.createdAt
    });

    console.log(`Dashboard notification sent to user: ${recipient.userId}`);

  } catch (error) {
    console.error('Send dashboard notification error:', error);
    throw error;
  }
};

/**
 * Send email notification via email service
 */
const sendEmailNotification = async (notification, recipient) => {
  try {
    await emailService.sendNotificationEmail({
      to: recipient.email,
      recipientName: `${recipient.firstName} ${recipient.lastName}`,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      actionUrl: notification.actionUrl,
      actionText: notification.actionText,
      priority: notification.priority
    });

    console.log(`Email notification sent to: ${recipient.email}`);

  } catch (error) {
    console.error('Send email notification error:', error);
    throw error;
  }
};

/**
 * Service Request Created - Notify Super Admins
 */
const notifyServiceRequestCreated = async (serviceRequest, student, user) => {
  try {
    // Get all super admins
    const admins = await User.find({ role: 'super_admin', isActive: true });

    const notifications = await Promise.all(
      admins.map(admin =>
        createNotification({
          recipientId: admin.userId,
          type: 'SERVICE_REQUEST_CREATED',
          title: 'New Service Request',
          message: `${user.firstName} ${user.lastName} has requested ${serviceRequest.serviceType.replace(/_/g, ' ')}`,
          channel: 'BOTH',
          priority: 'NORMAL',
          actionUrl: `/admin/service-requests/${serviceRequest.serviceRequestId}`,
          actionText: 'View Request',
          relatedEntities: {
            serviceRequestId: serviceRequest.serviceRequestId
          },
          metadata: {
            studentId: student.studentId,
            serviceType: serviceRequest.serviceType
          }
        })
      )
    );

    return notifications;

  } catch (error) {
    console.error('Notify service request created error:', error);
    throw error;
  }
};

/**
 * Service Request Assigned - Notify Counselor/Agent and Student
 */
const notifyServiceRequestAssigned = async (serviceRequest, assignedUser, student, studentUser) => {
  try {
    const notifications = [];

    // Notify assigned counselor/agent
    notifications.push(
      await createNotification({
        recipientId: assignedUser.userId,
        type: 'SERVICE_REQUEST_ASSIGNED',
        title: 'New Assignment',
        message: `You have been assigned to ${studentUser.firstName} ${studentUser.lastName}'s ${serviceRequest.serviceType.replace(/_/g, ' ')} request`,
        channel: 'BOTH',
        priority: 'HIGH',
        actionUrl: `/counselor/service-requests/${serviceRequest.serviceRequestId}`,
        actionText: 'View Details',
        relatedEntities: {
          serviceRequestId: serviceRequest.serviceRequestId
        }
      })
    );

    // Notify student
    notifications.push(
      await createNotification({
        recipientId: studentUser.userId,
        type: 'SERVICE_REQUEST_ASSIGNED',
        title: 'Request Assigned',
        message: `Your ${serviceRequest.serviceType.replace(/_/g, ' ')} request has been assigned to ${assignedUser.firstName} ${assignedUser.lastName}`,
        channel: 'BOTH',
        priority: 'NORMAL',
        actionUrl: `/student/service-requests/${serviceRequest.serviceRequestId}`,
        actionText: 'View Details',
        relatedEntities: {
          serviceRequestId: serviceRequest.serviceRequestId
        }
      })
    );

    return notifications;

  } catch (error) {
    console.error('Notify service request assigned error:', error);
    throw error;
  }
};

/**
 * Task Assigned - Notify Student
 */
const notifyTaskAssigned = async (task, studentUser, assignedByUser) => {
  try {
    return await createNotification({
      recipientId: studentUser.userId,
      type: 'TASK_ASSIGNED',
      title: 'New Task Assigned',
      message: `${assignedByUser.firstName} ${assignedByUser.lastName} assigned you a new task: ${task.title}`,
      channel: 'BOTH',
      priority: task.priority === 'HIGH' || task.priority === 'URGENT' ? 'HIGH' : 'NORMAL',
      actionUrl: `/student/tasks/${task.taskId}`,
      actionText: 'View Task',
      relatedEntities: {
        taskId: task.taskId,
        serviceRequestId: task.serviceRequestId
      },
      metadata: {
        dueDate: task.dueDate,
        taskType: task.taskType
      }
    });

  } catch (error) {
    console.error('Notify task assigned error:', error);
    throw error;
  }
};

/**
 * Task Submitted - Notify Counselor/Agent
 */
const notifyTaskSubmitted = async (task, assignedByUser, studentUser) => {
  try {
    return await createNotification({
      recipientId: assignedByUser.userId,
      type: 'TASK_SUBMITTED',
      title: 'Task Submitted',
      message: `${studentUser.firstName} ${studentUser.lastName} submitted: ${task.title}`,
      channel: 'BOTH',
      priority: 'NORMAL',
      actionUrl: `/counselor/tasks/${task.taskId}`,
      actionText: 'Review Submission',
      relatedEntities: {
        taskId: task.taskId,
        serviceRequestId: task.serviceRequestId
      }
    });

  } catch (error) {
    console.error('Notify task submitted error:', error);
    throw error;
  }
};

/**
 * Task Reviewed - Notify Student
 */
const notifyTaskReviewed = async (task, studentUser, reviewerUser, requiresRevision) => {
  try {
    return await createNotification({
      recipientId: studentUser.userId,
      type: requiresRevision ? 'TASK_REVISION_REQUIRED' : 'TASK_COMPLETED',
      title: requiresRevision ? 'Revision Requested' : 'Task Completed',
      message: requiresRevision
        ? `${reviewerUser.firstName} ${reviewerUser.lastName} requested revisions for: ${task.title}`
        : `${reviewerUser.firstName} ${reviewerUser.lastName} approved: ${task.title}`,
      channel: 'BOTH',
      priority: requiresRevision ? 'HIGH' : 'NORMAL',
      actionUrl: `/student/tasks/${task.taskId}`,
      actionText: 'View Feedback',
      relatedEntities: {
        taskId: task.taskId,
        serviceRequestId: task.serviceRequestId
      },
      metadata: {
        rating: task.feedback?.rating
      }
    });

  } catch (error) {
    console.error('Notify task reviewed error:', error);
    throw error;
  }
};

/**
 * Service Completed - Notify Student AND Super Admins
 * Per requirements: Both Student and Super Admin must be notified on service completion
 */
const notifyServiceCompleted = async (serviceRequest, studentUser, completedByUser) => {
  try {
    const notifications = [];

    // Notify Student
    notifications.push(
      await createNotification({
        recipientId: studentUser.userId,
        type: 'SERVICE_COMPLETED',
        title: 'Service Completed',
        message: `Your ${serviceRequest.serviceType.replace(/_/g, ' ')} has been completed by ${completedByUser.firstName} ${completedByUser.lastName}`,
        channel: 'BOTH',
        priority: 'NORMAL',
        actionUrl: `/student/service-requests/${serviceRequest.serviceRequestId}`,
        actionText: 'View Details',
        relatedEntities: {
          serviceRequestId: serviceRequest.serviceRequestId
        }
      })
    );

    // Notify ALL Super Admins
    const superAdmins = await User.find({ role: 'super_admin', isActive: true });

    const adminNotifications = await Promise.all(
      superAdmins.map(admin =>
        createNotification({
          recipientId: admin.userId,
          type: 'SERVICE_COMPLETED',
          title: 'Service Completed',
          message: `${completedByUser.firstName} ${completedByUser.lastName} completed ${studentUser.firstName} ${studentUser.lastName}'s ${serviceRequest.serviceType.replace(/_/g, ' ')}`,
          channel: 'BOTH',
          priority: 'NORMAL',
          actionUrl: `/admin/service-requests/${serviceRequest.serviceRequestId}`,
          actionText: 'View Details',
          relatedEntities: {
            serviceRequestId: serviceRequest.serviceRequestId
          },
          metadata: {
            studentId: serviceRequest.studentId,
            completedBy: completedByUser.userId,
            serviceType: serviceRequest.serviceType
          }
        })
      )
    );

    notifications.push(...adminNotifications);

    return notifications;

  } catch (error) {
    console.error('Notify service completed error:', error);
    throw error;
  }
};

/**
 * Get user's notifications
 */
const getUserNotifications = async (userId, options = {}) => {
  try {
    const {
      isRead = null,
      type = null,
      page = 1,
      limit = 20
    } = options;

    const filter = { recipientId: userId };

    if (isRead !== null) {
      filter.isRead = isRead;
    }
    if (type) {
      filter.type = type;
    }

    const skip = (page - 1) * limit;
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({
      recipientId: userId,
      isRead: false
    });

    return {
      notifications,
      unreadCount,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };

  } catch (error) {
    console.error('Get user notifications error:', error);
    throw error;
  }
};

/**
 * Mark notification as read
 */
const markAsRead = async (notificationId, userId) => {
  try {
    const notification = await Notification.findOne({
      notificationId,
      recipientId: userId
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    if (!notification.isRead) {
      notification.markAsRead();
      await notification.save();
    }

    return notification;

  } catch (error) {
    console.error('Mark as read error:', error);
    throw error;
  }
};

/**
 * Mark all notifications as read
 */
const markAllAsRead = async (userId) => {
  try {
    const result = await Notification.updateMany(
      { recipientId: userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    return result;

  } catch (error) {
    console.error('Mark all as read error:', error);
    throw error;
  }
};

// ========================
// Admin Notification Methods
// ========================

/**
 * Create admin notification for multiple recipients
 * @param {Object} options - Notification options
 * @param {String} adminUserId - ID of admin creating the notification
 */
const createAdminNotification = async (options, adminUserId) => {
  try {
    const {
      targetType,
      targetRole,
      targetUserId,
      type = 'GENERAL',
      title,
      message,
      priority = 'NORMAL',
      channel = 'BOTH',
      actionUrl = null,
      actionText = null
    } = options;

    // Determine recipients based on targetType
    let recipients = [];

    if (targetType === 'ALL') {
      recipients = await User.find({ isActive: true }).select('userId email firstName lastName role');
    } else if (targetType === 'ROLE') {
      recipients = await User.find({ role: targetRole, isActive: true }).select('userId email firstName lastName role');
    } else if (targetType === 'USER') {
      const user = await User.findOne({ userId: targetUserId, isActive: true }).select('userId email firstName lastName role');
      if (user) {
        recipients = [user];
      }
    }

    if (recipients.length === 0) {
      throw new Error('No active recipients found for the specified criteria');
    }

    const results = {
      total: recipients.length,
      dashboard: 0,
      email: 0,
      failed: 0,
      notificationIds: []
    };

    // Create notification for each recipient
    for (const recipient of recipients) {
      try {
        const notificationId = uuidv4();
        const notification = new Notification({
          notificationId,
          recipientId: recipient.userId,
          type,
          title,
          message,
          channel,
          priority,
          actionUrl,
          actionText,
          sentBy: adminUserId,
          targetType,
          targetRole: targetType === 'ROLE' ? targetRole : null
        });

        await notification.save();
        results.notificationIds.push(notificationId);

        // Send via channels
        if (channel === 'DASHBOARD' || channel === 'BOTH') {
          try {
            await sendDashboardNotification(notification, recipient);
            results.dashboard++;
          } catch (dashError) {
            console.error(`Dashboard notification failed for ${recipient.userId}:`, dashError);
          }
        }

        if (channel === 'EMAIL' || channel === 'BOTH') {
          try {
            await sendEmailNotification(notification, recipient);
            notification.emailSent = true;
            notification.emailSentAt = new Date();
            await notification.save();
            results.email++;
          } catch (emailError) {
            notification.emailError = emailError.message;
            await notification.save();
            console.error(`Email notification failed for ${recipient.email}:`, emailError);
          }
        }
      } catch (error) {
        console.error(`Failed to send notification to ${recipient.userId}:`, error);
        results.failed++;
      }
    }

    // Emit event to admin dashboard for real-time updates
    try {
      const io = getIO();
      if (io) {
        io.to('role:super_admin').emit('admin_notification_created', {
          targetType,
          targetRole,
          recipientCount: results.total,
          title,
          createdBy: adminUserId
        });
      }
    } catch (socketError) {
      console.error('Failed to emit admin notification event:', socketError);
    }

    return results;

  } catch (error) {
    console.error('Create admin notification error:', error);
    throw error;
  }
};

/**
 * Get all notifications for admin view with filters
 */
const getAllNotificationsAdmin = async (filters = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      targetType,
      type,
      isRead,
      isArchived = 'false',
      priority,
      search,
      sortBy = 'createdAt',
      order = 'desc'
    } = filters;

    const query = { isArchived: isArchived === 'true' };

    if (targetType) query.targetType = targetType;
    if (type) query.type = type;
    if (isRead !== undefined && isRead !== '') {
      query.isRead = isRead === 'true';
    }
    if (priority) query.priority = priority;
    if (search && search.trim()) {
      query.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { message: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const sortOrder = order === 'desc' ? -1 : 1;

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Notification.countDocuments(query)
    ]);

    // Enrich with recipient and sender details
    const enrichedNotifications = await Promise.all(
      notifications.map(async (notification) => {
        const [recipient, sender] = await Promise.all([
          User.findOne({ userId: notification.recipientId })
            .select('firstName lastName email role avatar')
            .lean(),
          notification.sentBy
            ? User.findOne({ userId: notification.sentBy })
                .select('firstName lastName email')
                .lean()
            : Promise.resolve(null)
        ]);
        return { ...notification, recipient, sender };
      })
    );

    return {
      notifications: enrichedNotifications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };

  } catch (error) {
    console.error('Get all notifications admin error:', error);
    throw error;
  }
};

/**
 * Get notification statistics for admin dashboard
 */
const getNotificationStats = async () => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      total,
      unread,
      archived,
      sentToday,
      sentThisWeek,
      sentThisMonth,
      byType,
      byPriority,
      byTargetType
    ] = await Promise.all([
      Notification.countDocuments({ isArchived: false }),
      Notification.countDocuments({ isRead: false, isArchived: false }),
      Notification.countDocuments({ isArchived: true }),
      Notification.countDocuments({ createdAt: { $gte: startOfToday }, isArchived: false }),
      Notification.countDocuments({ createdAt: { $gte: startOfWeek }, isArchived: false }),
      Notification.countDocuments({ createdAt: { $gte: startOfMonth }, isArchived: false }),
      Notification.aggregate([
        { $match: { isArchived: false } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      Notification.aggregate([
        { $match: { isArchived: false } },
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]),
      Notification.aggregate([
        { $match: { isArchived: false, sentBy: { $ne: null } } },
        { $group: { _id: '$targetType', count: { $sum: 1 } } }
      ])
    ]);

    return {
      total,
      unread,
      archived,
      sentToday,
      sentThisWeek,
      sentThisMonth,
      byType: Object.fromEntries(byType.map(b => [b._id || 'UNKNOWN', b.count])),
      byPriority: Object.fromEntries(byPriority.map(b => [b._id || 'NORMAL', b.count])),
      byTargetType: Object.fromEntries(byTargetType.map(b => [b._id || 'USER', b.count]))
    };

  } catch (error) {
    console.error('Get notification stats error:', error);
    throw error;
  }
};

/**
 * Get single notification by ID (admin)
 */
const getNotificationById = async (notificationId) => {
  try {
    const notification = await Notification.findOne({ notificationId }).lean();

    if (!notification) {
      return null;
    }

    // Enrich with user details
    const [recipient, sender] = await Promise.all([
      User.findOne({ userId: notification.recipientId })
        .select('firstName lastName email role avatar')
        .lean(),
      notification.sentBy
        ? User.findOne({ userId: notification.sentBy })
            .select('firstName lastName email')
            .lean()
        : Promise.resolve(null)
    ]);

    return { ...notification, recipient, sender };

  } catch (error) {
    console.error('Get notification by ID error:', error);
    throw error;
  }
};

/**
 * Archive notification
 */
const archiveNotification = async (notificationId, adminUserId) => {
  try {
    const notification = await Notification.findOne({ notificationId });

    if (!notification) {
      throw new Error('Notification not found');
    }

    notification.archive(adminUserId);
    await notification.save();

    return notification;

  } catch (error) {
    console.error('Archive notification error:', error);
    throw error;
  }
};

/**
 * Unarchive notification
 */
const unarchiveNotification = async (notificationId) => {
  try {
    const notification = await Notification.findOne({ notificationId });

    if (!notification) {
      throw new Error('Notification not found');
    }

    notification.unarchive();
    await notification.save();

    return notification;

  } catch (error) {
    console.error('Unarchive notification error:', error);
    throw error;
  }
};

/**
 * Delete notification permanently
 */
const deleteNotification = async (notificationId) => {
  try {
    const result = await Notification.deleteOne({ notificationId });

    if (result.deletedCount === 0) {
      throw new Error('Notification not found');
    }

    return { success: true };

  } catch (error) {
    console.error('Delete notification error:', error);
    throw error;
  }
};

/**
 * Bulk action on notifications
 */
const bulkAction = async (notificationIds, action, adminUserId) => {
  try {
    let result;

    if (action === 'archive') {
      result = await Notification.updateMany(
        { notificationId: { $in: notificationIds } },
        {
          isArchived: true,
          archivedAt: new Date(),
          archivedBy: adminUserId
        }
      );
    } else if (action === 'unarchive') {
      result = await Notification.updateMany(
        { notificationId: { $in: notificationIds } },
        {
          isArchived: false,
          archivedAt: null,
          archivedBy: null
        }
      );
    } else if (action === 'delete') {
      result = await Notification.deleteMany(
        { notificationId: { $in: notificationIds } }
      );
    }

    return {
      success: true,
      modifiedCount: result.modifiedCount || result.deletedCount || 0
    };

  } catch (error) {
    console.error('Bulk action error:', error);
    throw error;
  }
};

/**
 * Get available recipients for admin notification UI
 */
const getAvailableRecipients = async (params = {}) => {
  try {
    const { search, role, page = 1, limit = 50 } = params;

    const query = { isActive: true };

    if (role) {
      query.role = role;
    }

    if (search && search.trim()) {
      query.$or = [
        { firstName: { $regex: search.trim(), $options: 'i' } },
        { lastName: { $regex: search.trim(), $options: 'i' } },
        { email: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total, roleCounts] = await Promise.all([
      User.find(query)
        .select('userId firstName lastName email role avatar')
        .sort({ firstName: 1, lastName: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query),
      User.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ])
    ]);

    return {
      users,
      roleCounts: Object.fromEntries(roleCounts.map(r => [r._id, r.count])),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };

  } catch (error) {
    console.error('Get available recipients error:', error);
    throw error;
  }
};

module.exports = {
  createNotification,
  notifyServiceRequestCreated,
  notifyServiceRequestAssigned,
  notifyTaskAssigned,
  notifyTaskSubmitted,
  notifyTaskReviewed,
  notifyServiceCompleted,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  // Admin methods
  createAdminNotification,
  getAllNotificationsAdmin,
  getNotificationStats,
  getNotificationById,
  archiveNotification,
  unarchiveNotification,
  deleteNotification,
  bulkAction,
  getAvailableRecipients
};
