const mongoose = require('mongoose');

const studentNoteSchema = new mongoose.Schema({
  noteId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  studentId: {
    type: String,
    required: true,
    ref: 'Student',
    index: true
  },
  authorId: {
    type: String,
    required: true,
    ref: 'User'
  },
  authorRole: {
    type: String,
    enum: ['agent', 'super_admin', 'counselor'],
    required: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 2000
  },
  isInternal: {
    type: Boolean,
    default: false
  },
  parentNoteId: {
    type: String,
    ref: 'StudentNote',
    default: null
  }
}, {
  timestamps: true
});

// Compound index for efficient querying
studentNoteSchema.index({ studentId: 1, createdAt: -1 });
studentNoteSchema.index({ authorId: 1, createdAt: -1 });

module.exports = mongoose.model('StudentNote', studentNoteSchema);
