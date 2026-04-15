/**
 * InteractionMode Enforcement Middleware
 *
 * When interactionMode === 'rep-counselor':
 *   - Student CANNOT access service requests, tasks, documents, or chat
 *   - Only the representative + counselor can interact
 *
 * When interactionMode === 'student-counselor' (or null):
 *   - Normal student access
 *   - Representatives cannot interfere
 *
 * Usage: Apply to routes where a serviceRequestId or studentId is present.
 */

const ServiceRequest = require('../models/ServiceRequest');
const Student = require('../models/Student');

/**
 * Block students from accessing a specific service request
 * if its interactionMode is 'rep-counselor'.
 * Expects req.params.serviceRequestId or req.params.id as the SR identifier.
 */
async function enforceInteractionMode(req, res, next) {
  // Only applies to students
  if (!req.user || req.user.role !== 'student') {
    return next();
  }

  const serviceRequestId = req.params.serviceRequestId || req.params.id;
  if (!serviceRequestId) {
    return next();
  }

  try {
    const sr = await ServiceRequest.findOne({ serviceRequestId }).select('interactionMode').lean();
    if (sr && sr.interactionMode === 'rep-counselor') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'This service request is managed by your representative. Please contact them for updates.'
      });
    }
  } catch (err) {
    console.error('enforceInteractionMode error:', err.message);
  }

  next();
}

/**
 * Block students from accessing ANY service requests/tasks/documents
 * for their student record if their interactionMode is 'rep-counselor'.
 * Uses the student's userId to look up their Student record.
 */
async function enforceStudentInteractionMode(req, res, next) {
  if (!req.user || req.user.role !== 'student') {
    return next();
  }

  try {
    const student = await Student.findOne({ userId: req.user.userId }).select('interactionMode').lean();
    if (student && student.interactionMode === 'rep-counselor') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Your account is managed by a representative. Please contact them for service updates.'
      });
    }
  } catch (err) {
    console.error('enforceStudentInteractionMode error:', err.message);
  }

  next();
}

module.exports = {
  enforceInteractionMode,
  enforceStudentInteractionMode
};
