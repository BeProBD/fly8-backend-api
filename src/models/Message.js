const mongoose = require('mongoose');

/**
 * Message Model
 * Real-time chat messages for service request conversations
 */
const messageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Conversation context - tied to a specific service request
  serviceRequestId: {
    type: String,
    required: true,
    ref: 'ServiceRequest',
    index: true
  },

  // Sender information
  senderId: {
    type: String,
    required: true,
    ref: 'User',
    index: true
  },
  senderRole: {
    type: String,
    enum: ['student', 'counselor', 'agent', 'super_admin'],
    required: true
  },

  // Recipient (for 1-to-1 chat context)
  recipientId: {
    type: String,
    ref: 'User',
    index: true
  },

  // Message content
  content: {
    type: String,
    required: true,
    maxlength: 5000
  },

  // Message type
  messageType: {
    type: String,
    enum: ['TEXT', 'FILE', 'SYSTEM', 'TASK_NOTIFICATION'],
    default: 'TEXT'
  },

  // File attachments (if messageType is FILE)
  attachments: [{
    name: String,
    url: String,
    size: Number,
    mimeType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Read status tracking
  readBy: [{
    userId: String,
    readAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Edit/Delete tracking
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,

  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,

  // Metadata for extensibility
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { timestamps: true });

// Indexes for efficient queries
messageSchema.index({ serviceRequestId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, serviceRequestId: 1 });
messageSchema.index({ recipientId: 1, 'readBy.userId': 1 });

// Method to check if message is read by a specific user
messageSchema.methods.isReadByUser = function(userId) {
  return this.readBy.some(r => r.userId === userId);
};

// Method to mark as read
messageSchema.methods.markAsReadBy = function(userId) {
  if (!this.isReadByUser(userId)) {
    this.readBy.push({ userId, readAt: new Date() });
  }
};

module.exports = mongoose.model('Message', messageSchema);
