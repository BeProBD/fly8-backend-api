const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middlewares/auth');

let io;

const initSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId} (${socket.userRole})`);

    // Join user-specific room
    socket.join(`user:${socket.userId}`);

    // Join role-specific room
    socket.join(`role:${socket.userRole}`);

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`);
    });

    // Handle custom events
    socket.on('join_student_room', (studentId) => {
      socket.join(`student:${studentId}`);
    });

    socket.on('join_application_room', (applicationId) => {
      socket.join(`application:${applicationId}`);
    });

    socket.on('join_service_request_room', (serviceRequestId) => {
      socket.join(`service_request:${serviceRequestId}`);
    });

    socket.on('leave_service_request_room', (serviceRequestId) => {
      socket.leave(`service_request:${serviceRequestId}`);
    });

    // Chat room events
    socket.on('join_chat_room', (serviceRequestId) => {
      socket.join(`chat:${serviceRequestId}`);
      console.log(`User ${socket.userId} joined chat room: ${serviceRequestId}`);
    });

    socket.on('leave_chat_room', (serviceRequestId) => {
      socket.leave(`chat:${serviceRequestId}`);
      console.log(`User ${socket.userId} left chat room: ${serviceRequestId}`);
    });

    // Typing indicators
    socket.on('typing_start', ({ serviceRequestId }) => {
      socket.to(`chat:${serviceRequestId}`).emit('user_typing', {
        userId: socket.userId,
        isTyping: true
      });
    });

    socket.on('typing_stop', ({ serviceRequestId }) => {
      socket.to(`chat:${serviceRequestId}`).emit('user_typing', {
        userId: socket.userId,
        isTyping: false
      });
    });

    // Acknowledge connection
    socket.emit('connected', { userId: socket.userId, role: socket.userRole });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

// Emit notification to specific user
const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

// Emit to all users with specific role
const emitToRole = (role, event, data) => {
  if (io) {
    io.to(`role:${role}`).emit(event, data);
  }
};

// Emit to all super admins
const emitToAdmins = (event, data) => {
  emitToRole('super_admin', event, data);
};

// Emit to specific service request room
const emitToServiceRequest = (serviceRequestId, event, data) => {
  if (io) {
    io.to(`service_request:${serviceRequestId}`).emit(event, data);
  }
};

// Emit to specific student room
const emitToStudent = (studentId, event, data) => {
  if (io) {
    io.to(`student:${studentId}`).emit(event, data);
  }
};

// Broadcast service request update
const broadcastServiceRequestUpdate = (serviceRequest, event = 'service_request_updated') => {
  if (io && serviceRequest) {
    // Emit to student
    if (serviceRequest.studentId) {
      emitToStudent(serviceRequest.studentId, event, serviceRequest);
    }
    // Emit to assigned counselor
    if (serviceRequest.assignedCounselor) {
      emitToUser(serviceRequest.assignedCounselor, event, serviceRequest);
    }
    // Emit to assigned agent
    if (serviceRequest.assignedAgent) {
      emitToUser(serviceRequest.assignedAgent, event, serviceRequest);
    }
    // Emit to all admins
    emitToAdmins(event, serviceRequest);
  }
};

// Broadcast task update
const broadcastTaskUpdate = (task, event = 'task_updated') => {
  if (io && task) {
    // Emit to assigned user
    if (task.assignedTo) {
      emitToUser(task.assignedTo, event, task);
    }
    // Emit to creator
    if (task.assignedBy) {
      emitToUser(task.assignedBy, event, task);
    }
  }
};

// Emit to chat room
const emitToChatRoom = (serviceRequestId, event, data) => {
  if (io) {
    io.to(`chat:${serviceRequestId}`).emit(event, data);
  }
};

// Broadcast to all connected users
const broadcastToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

// Emit to multiple specific users
const emitToUsers = (userIds, event, data) => {
  if (io && Array.isArray(userIds)) {
    userIds.forEach(userId => {
      io.to(`user:${userId}`).emit(event, data);
    });
  }
};

// Emit admin notification created event (for real-time admin dashboard updates)
const emitAdminNotificationCreated = (data) => {
  emitToRole('super_admin', 'admin_notification_created', data);
};

// Emit new notification event to recipient
const emitNewNotification = (recipientId, notification) => {
  emitToUser(recipientId, 'new_notification', notification);
  emitToUser(recipientId, 'notification', notification);
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToUsers,
  emitToRole,
  emitToAdmins,
  emitToServiceRequest,
  emitToStudent,
  broadcastServiceRequestUpdate,
  broadcastTaskUpdate,
  emitToChatRoom,
  broadcastToAll,
  emitAdminNotificationCreated,
  emitNewNotification
};