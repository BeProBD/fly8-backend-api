/**
 * Response Serializers
 * Explicit, role-based field filtering for API responses.
 * Replaces implicit res.json() interception with deterministic output.
 *
 * Usage:
 *   const { serializeStudent } = require('../utils/serializers');
 *   res.json({ student: serializeStudent(student, req.user.role) });
 */

// ============================================================================
// STUDENT SERIALIZER
// ============================================================================

const STUDENT_BASE_FIELDS = [
  'studentId', 'userId', 'status', 'country',
  'interestedCountries', 'interestedServices', 'selectedServices',
  'onboardingCompleted', 'interactionMode',
  'referralSource', 'representativeName',
  'assignedCounselor', 'assignedAgent', 'referredBy',
  'createdByRep', 'createdAt', 'updatedAt'
];

const STUDENT_ACADEMIC_FIELDS = [
  'age', 'currentEducationLevel', 'fieldOfStudy', 'gpa',
  'graduationYear', 'institution', 'ielts', 'toefl', 'gre',
  'preferredCountries', 'preferredDegreeLevel', 'budget',
  'careerGoals', 'industry', 'workLocation'
];

const STUDENT_DOCUMENT_FIELDS = ['documents'];

const STUDENT_INTERNAL_FIELDS = [
  'commissionPercentage', 'referralNotes',
  'oldStudentId', 'oldProfileId', 'migratedAt'
];

function serializeStudent(student, role) {
  if (!student) return null;
  const obj = student.toObject ? student.toObject() : { ...student };

  switch (role) {
    case 'rep1':
    case 'rep2':
      // Read-only: basic info only — no academics, no documents, no internals
      return pickFields(obj, [
        ...STUDENT_BASE_FIELDS,
        'user' // nested user info (pre-serialized)
      ]);

    case 'rep3':
      // Partner: base + academics (they created the student)
      return pickFields(obj, [
        ...STUDENT_BASE_FIELDS,
        ...STUDENT_ACADEMIC_FIELDS,
        'user'
      ]);

    case 'counselor':
    case 'agent':
      // Full student view minus internal admin fields
      return omitFields(obj, STUDENT_INTERNAL_FIELDS);

    case 'super_admin':
      return obj; // Everything

    default:
      return pickFields(obj, STUDENT_BASE_FIELDS);
  }
}

// ============================================================================
// SERVICE REQUEST SERIALIZER
// ============================================================================

const SR_BASE_FIELDS = [
  'serviceRequestId', 'studentId', 'serviceType', 'status',
  'assignedCounselor', 'assignedAgent', 'representativeId',
  'representativeLevel', 'interactionMode', 'createdBy',
  'appliedAt', 'assignedAt', 'completedAt',
  'statusHistory', 'progress', 'createdAt', 'updatedAt'
];

const SR_SENSITIVE_FIELDS = [
  'notes', 'internalNotes', 'adminNotes', 'formData',
  'metadata', 'agentApprovalStatus', 'isAgentInitiated',
  'approvedBy', 'approvedAt', 'approvalNotes'
];

function serializeServiceRequest(sr, role) {
  if (!sr) return null;
  const obj = sr.toObject ? sr.toObject() : { ...sr };

  switch (role) {
    case 'rep1':
    case 'rep2':
      // Minimal view — no notes, no form data, no internal fields
      return pickFields(obj, [
        ...SR_BASE_FIELDS,
        'counselor', 'student' // nested enrichment
      ]);

    case 'rep3':
      // Partner: base + form data (they created it)
      return omitFields(obj, ['internalNotes', 'adminNotes', 'approvalNotes']);

    case 'student':
      // Students: no internal notes, no agent approval details
      return omitFields(obj, [
        'internalNotes', 'adminNotes', 'agentApprovalStatus',
        'isAgentInitiated', 'approvedBy', 'approvalNotes'
      ]);

    case 'counselor':
    case 'agent':
      // Staff: everything minus admin-only notes
      return omitFields(obj, ['adminNotes']);

    case 'super_admin':
      return obj;

    default:
      return pickFields(obj, SR_BASE_FIELDS);
  }
}

// ============================================================================
// TASK SERIALIZER
// ============================================================================

function serializeTask(task, role) {
  if (!task) return null;
  const obj = task.toObject ? task.toObject() : { ...task };

  switch (role) {
    case 'rep1':
    case 'rep2':
      // Summary only — no submission details, no files
      return {
        taskId: obj.taskId,
        title: obj.title,
        status: obj.status,
        dueDate: obj.dueDate,
        createdAt: obj.createdAt
      };

    default:
      return obj;
  }
}

// ============================================================================
// USER SERIALIZER (for nested user objects)
// ============================================================================

function serializeUser(user, role) {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : { ...user };

  // Never expose password
  delete obj.password;

  switch (role) {
    case 'rep1':
    case 'rep2':
      return {
        userId: obj.userId,
        firstName: obj.firstName,
        lastName: obj.lastName,
        email: obj.email,
        avatar: obj.avatar
      };

    default:
      delete obj.password;
      return obj;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function pickFields(obj, fields) {
  const result = {};
  for (const field of fields) {
    if (obj[field] !== undefined) {
      result[field] = obj[field];
    }
  }
  return result;
}

function omitFields(obj, fields) {
  const result = { ...obj };
  for (const field of fields) {
    delete result[field];
  }
  return result;
}

module.exports = {
  serializeStudent,
  serializeServiceRequest,
  serializeTask,
  serializeUser,
  pickFields,
  omitFields
};
