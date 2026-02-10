/**
 * Shortlist Model
 * Agents save/bookmark programs for specific students
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const ShortlistSchema = new mongoose.Schema(
  {
    shortlistId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
      index: true
    },
    agentId: {
      type: String,
      required: [true, 'Agent ID is required'],
      ref: 'User',
      index: true
    },
    studentId: {
      type: String,
      required: [true, 'Student ID is required'],
      ref: 'Student',
      index: true
    },
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Program ID is required'],
      ref: 'Program'
    },
    notes: {
      type: String,
      maxlength: 500,
      trim: true
    }
  },
  { timestamps: true }
);

// Prevent duplicate shortlist entries
ShortlistSchema.index({ agentId: 1, studentId: 1, programId: 1 }, { unique: true });
ShortlistSchema.index({ agentId: 1, createdAt: -1 });

module.exports = mongoose.model('Shortlist', ShortlistSchema);
