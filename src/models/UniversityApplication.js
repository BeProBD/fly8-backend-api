/**
 * UniversityApplication Model
 *
 * Sidecar to ServiceRequest for the APPLICATION_ASSISTANCE service.
 * Holds Apply-University-specific data: program, multi-step form payload,
 * 8-stage progression, per-application documents.
 *
 * One UniversityApplication is created 1:1 with a ServiceRequest when a
 * student submits an Apply University application. The ServiceRequest
 * remains the canonical record for admin assignment + counselor workflow,
 * so existing admin/counselor pages continue to work unchanged.
 */

const mongoose = require('mongoose');

// ── Stage definitions ──────────────────────────────────────────────────────
const STAGE_KEYS = [
  'APPLICATION_CREATED',
  'APPLICATION_STARTED',
  'APPLICATION_REVIEW_BY_FLY8',
  'SUBMITTING_TO_SCHOOL',
  'AWAITING_SCHOOL_DECISION',
  'ADMISSION_PROCESSING',
  'PRE_ARRIVAL',
  'ARRIVAL',
];

const STAGE_LABELS = {
  APPLICATION_CREATED: 'Application Created',
  APPLICATION_STARTED: 'Application Started',
  APPLICATION_REVIEW_BY_FLY8: 'Application Review (By Fly8)',
  SUBMITTING_TO_SCHOOL: 'Submitting to School',
  AWAITING_SCHOOL_DECISION: 'Awaiting School Decision',
  ADMISSION_PROCESSING: 'Admission Processing',
  PRE_ARRIVAL: 'Pre-Arrival',
  ARRIVAL: 'Arrival',
};

const buildDefaultStages = () =>
  STAGE_KEYS.map((key, idx) => ({
    key,
    label: STAGE_LABELS[key],
    // Stage 0 (APPLICATION_CREATED) is completed at creation time.
    // All other stages start locked; counselor unlocks them as work progresses.
    status: idx === 0 ? 'COMPLETED' : 'LOCKED',
    unlockedAt: idx === 0 ? new Date() : null,
    completedAt: idx === 0 ? new Date() : null,
  }));

// ── Sub-schemas ────────────────────────────────────────────────────────────
const stageSchema = new mongoose.Schema(
  {
    key: { type: String, enum: STAGE_KEYS, required: true },
    label: String,
    status: {
      type: String,
      enum: ['LOCKED', 'UNLOCKED', 'IN_PROGRESS', 'COMPLETED'],
      default: 'LOCKED',
    },
    unlockedAt: Date,
    unlockedBy: { type: String, ref: 'User' },
    completedAt: Date,
    notes: String,
  },
  { _id: false },
);

const documentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    publicId: String,
    size: Number,
    source: {
      type: String,
      enum: ['application_upload', 'profile_reused'],
      default: 'application_upload',
    },
    stageKey: { type: String, enum: STAGE_KEYS },
    uploadedBy: { type: String, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// ── Main schema ────────────────────────────────────────────────────────────
const universityApplicationSchema = new mongoose.Schema(
  {
    applicationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Canonical linkage — every UA has exactly one ServiceRequest
    serviceRequestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      ref: 'ServiceRequest',
    },

    studentId: {
      type: String,
      required: true,
      index: true,
      ref: 'Student',
    },

    // Selected program snapshot (frozen at apply time — survives if the source
    // Program record is later edited/removed)
    program: {
      programId: String,
      programName: { type: String, required: true },
      institutionName: { type: String, required: true },
      country: String,
      programLevel: String,
      intake: String,
      studentResiding: String,
      mode: String, // ON_CAMPUS / ONLINE / HYBRID / etc.
      duration: String,
      source: {
        type: String,
        enum: ['marketing_website', 'dashboard_manual'],
        default: 'dashboard_manual',
      },
    },

    // Multi-step form payload — kept as structured Mixed sub-docs so Phase 2/3
    // can read/write per-step without migrations.
    personalInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
    contactInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
    educationInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
    testScores: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Per-application documents (separate from student profile docs)
    documents: { type: [documentSchema], default: [] },

    // 8-stage progression
    stages: { type: [stageSchema], default: buildDefaultStages },
    currentStage: {
      type: String,
      enum: STAGE_KEYS,
      default: 'APPLICATION_CREATED',
    },

    // Aggregate statuses (for the list table)
    applicationStatus: {
      type: String,
      enum: [
        'SUBMITTED',
        'UNDER_REVIEW',
        'IN_PROGRESS',
        'ADMITTED',
        'REJECTED',
        'WITHDRAWN',
      ],
      default: 'SUBMITTED',
      index: true,
    },
    documentStatus: {
      type: String,
      enum: ['PENDING', 'PARTIAL', 'COMPLETE'],
      default: 'PENDING',
    },

    // Quick refs for the table — denormalised from ServiceRequest for fast list rendering
    assignedCounselor: { type: String, ref: 'User' },
    assignedAgent: { type: String, ref: 'User' },

    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// ── Indexes ────────────────────────────────────────────────────────────────
universityApplicationSchema.index({ studentId: 1, submittedAt: -1 });
universityApplicationSchema.index({ assignedCounselor: 1, applicationStatus: 1 });

// ── Helpers exposed on the model ───────────────────────────────────────────
universityApplicationSchema.statics.STAGE_KEYS = STAGE_KEYS;
universityApplicationSchema.statics.STAGE_LABELS = STAGE_LABELS;
universityApplicationSchema.statics.buildDefaultStages = buildDefaultStages;

module.exports = mongoose.model(
  'UniversityApplication',
  universityApplicationSchema,
);
