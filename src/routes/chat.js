/**
 * Chat Routes
 * Real-time messaging for service request conversations
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middlewares/auth');
const Message = require('../models/Message');
const ServiceRequest = require('../models/ServiceRequest');
const User = require('../models/User');
const Student = require('../models/Student');
const { emitToUser, emitToServiceRequest } = require('../socket/socketManager');

/**
 * Helper: Check if user has access to chat for a service request
 */
async function checkChatAccess(user, serviceRequest) {
  switch (user.role) {
    case 'super_admin':
      return true;

    case 'student':
      const student = await Student.findOne({ userId: user.userId });
      return student && serviceRequest.studentId === student.studentId;

    case 'counselor':
      return serviceRequest.assignedCounselor === user.userId;

    case 'agent':
      return serviceRequest.assignedAgent === user.userId;

    default:
      return false;
  }
}

/**
 * Helper: Emit chat message to all participants
 */
async function emitChatMessage(serviceRequest, message, excludeUserId) {
  // Get student userId
  const student = await Student.findOne({ studentId: serviceRequest.studentId });

  const participants = [
    student?.userId,
    serviceRequest.assignedCounselor,
    serviceRequest.assignedAgent
  ].filter(id => id && id !== excludeUserId);

  // Emit to each participant
  participants.forEach(userId => {
    emitToUser(userId, 'new_chat_message', {
      serviceRequestId: serviceRequest.serviceRequestId,
      message
    });
  });

  // Also emit to the service request room
  emitToServiceRequest(serviceRequest.serviceRequestId, 'new_chat_message', {
    serviceRequestId: serviceRequest.serviceRequestId,
    message
  });
}

/**
 * @route   GET /api/chat/:serviceRequestId/messages
 * @desc    Get messages for a service request
 * @access  Authenticated (with access check)
 */
router.get('/:serviceRequestId/messages', authMiddleware, async (req, res) => {
  try {
    const { serviceRequestId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verify service request exists
    const serviceRequest = await ServiceRequest.findOne({ serviceRequestId });
    if (!serviceRequest) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    // Check permissions
    const hasAccess = await checkChatAccess(req.user, serviceRequest);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if chat is enabled (service must be assigned)
    if (serviceRequest.status === 'PENDING_ADMIN_ASSIGNMENT') {
      return res.status(403).json({
        error: 'Chat is not available until a counselor is assigned',
        chatDisabled: true
      });
    }

    // Fetch messages with pagination (chronological order for chat)
    const skip = (page - 1) * limit;
    const messages = await Message.find({
      serviceRequestId,
      isDeleted: false
    })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Message.countDocuments({
      serviceRequestId,
      isDeleted: false
    });

    // Enrich with sender info
    const enrichedMessages = await Promise.all(
      messages.map(async (msg) => {
        const sender = await User.findOne({ userId: msg.senderId })
          .select('userId firstName lastName avatar role')
          .lean();
        return { ...msg, sender };
      })
    );

    res.json({
      messages: enrichedMessages,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: skip + messages.length < total
      }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * @route   POST /api/chat/:serviceRequestId/messages
 * @desc    Send a message
 * @access  Authenticated (with access check)
 */
router.post('/:serviceRequestId/messages', authMiddleware, async (req, res) => {
  try {
    const { serviceRequestId } = req.params;
    const { content, messageType = 'TEXT', attachments = [], recipientId } = req.body;

    if (!content && attachments.length === 0) {
      return res.status(400).json({ error: 'Message content or attachments required' });
    }

    // Verify service request exists
    const serviceRequest = await ServiceRequest.findOne({ serviceRequestId });
    if (!serviceRequest) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    // Check permissions
    const hasAccess = await checkChatAccess(req.user, serviceRequest);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if chat is enabled
    if (serviceRequest.status === 'PENDING_ADMIN_ASSIGNMENT') {
      return res.status(403).json({
        error: 'Chat is not available until a counselor is assigned',
        chatDisabled: true
      });
    }

    // Create message
    const messageId = uuidv4();
    const message = new Message({
      messageId,
      serviceRequestId,
      senderId: req.user.userId,
      senderRole: req.user.role,
      recipientId,
      content: content || '',
      messageType,
      attachments,
      readBy: [{ userId: req.user.userId, readAt: new Date() }]
    });

    await message.save();

    // Get sender info for real-time emission
    const sender = await User.findOne({ userId: req.user.userId })
      .select('userId firstName lastName avatar role')
      .lean();

    const enrichedMessage = {
      ...message.toObject(),
      sender
    };

    // Emit to all participants
    await emitChatMessage(serviceRequest, enrichedMessage, req.user.userId);

    res.status(201).json({
      message: enrichedMessage
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * @route   PATCH /api/chat/:serviceRequestId/messages/:messageId/read
 * @desc    Mark message as read
 * @access  Authenticated
 */
router.patch('/:serviceRequestId/messages/:messageId/read', authMiddleware, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findOne({ messageId });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    message.markAsReadBy(req.user.userId);
    await message.save();

    res.json({ success: true });

  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

/**
 * @route   PATCH /api/chat/:serviceRequestId/messages/read-all
 * @desc    Mark all messages as read
 * @access  Authenticated
 */
router.patch('/:serviceRequestId/messages/read-all', authMiddleware, async (req, res) => {
  try {
    const { serviceRequestId } = req.params;

    await Message.updateMany(
      {
        serviceRequestId,
        'readBy.userId': { $ne: req.user.userId }
      },
      {
        $push: { readBy: { userId: req.user.userId, readAt: new Date() } }
      }
    );

    res.json({ success: true });

  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

/**
 * @route   GET /api/chat/:serviceRequestId/unread-count
 * @desc    Get unread message count
 * @access  Authenticated
 */
router.get('/:serviceRequestId/unread-count', authMiddleware, async (req, res) => {
  try {
    const { serviceRequestId } = req.params;

    const count = await Message.countDocuments({
      serviceRequestId,
      isDeleted: false,
      'readBy.userId': { $ne: req.user.userId }
    });

    res.json({ unreadCount: count });

  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * @route   GET /api/chat/:serviceRequestId/participants
 * @desc    Get chat participants info
 * @access  Authenticated
 */
router.get('/:serviceRequestId/participants', authMiddleware, async (req, res) => {
  try {
    const { serviceRequestId } = req.params;

    const serviceRequest = await ServiceRequest.findOne({ serviceRequestId });
    if (!serviceRequest) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    const hasAccess = await checkChatAccess(req.user, serviceRequest);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get student info
    const student = await Student.findOne({ studentId: serviceRequest.studentId });
    const studentUser = student ? await User.findOne({ userId: student.userId })
      .select('userId firstName lastName avatar role email')
      .lean() : null;

    // Get counselor info
    const counselor = serviceRequest.assignedCounselor
      ? await User.findOne({ userId: serviceRequest.assignedCounselor })
          .select('userId firstName lastName avatar role email')
          .lean()
      : null;

    // Get agent info
    const agent = serviceRequest.assignedAgent
      ? await User.findOne({ userId: serviceRequest.assignedAgent })
          .select('userId firstName lastName avatar role email')
          .lean()
      : null;

    res.json({
      participants: {
        student: studentUser,
        counselor,
        agent
      },
      chatEnabled: serviceRequest.status !== 'PENDING_ADMIN_ASSIGNMENT'
    });

  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({ error: 'Failed to get participants' });
  }
});

module.exports = router;
