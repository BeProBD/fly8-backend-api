/**
 * Field-Level RBAC Middleware
 * Intercepts res.json() for restricted roles and applies explicit serializers.
 *
 * Rep1/Rep2 can ONLY see:
 *   - Student basic info (name, email, status, country)
 *   - Progress & status
 *   - Assigned counselor
 *
 * Rep1/Rep2 must NOT see:
 *   - Documents (transcripts, passport, SOP, etc.)
 *   - Internal notes
 *   - Financial details (budget, commission internals, payments)
 *   - Task details (full task objects)
 */

const {
  serializeStudent,
  serializeServiceRequest,
  serializeTask,
  serializeUser
} = require('../utils/serializers');

/**
 * Express middleware: intercepts res.json() for rep1/rep2 roles
 * and applies explicit serializers to the response body.
 */
function repFieldFilter(req, res, next) {
  if (!req.user || (req.user.role !== 'rep1' && req.user.role !== 'rep2')) {
    return next();
  }

  const role = req.user.role;
  const originalJson = res.json.bind(res);

  res.json = function(body) {
    if (!body || typeof body !== 'object') return originalJson(body);

    const filtered = { ...body };

    // Serialize top-level student
    if (filtered.student) {
      filtered.student = serializeStudent(filtered.student, role);
    }

    // Serialize top-level serviceRequest
    if (filtered.serviceRequest) {
      filtered.serviceRequest = serializeServiceRequest(filtered.serviceRequest, role);
    }

    // Serialize data arrays (list endpoints)
    if (filtered.data && Array.isArray(filtered.data)) {
      filtered.data = filtered.data.map(item => {
        const obj = item.toObject ? item.toObject() : { ...item };

        // Detect student-like objects
        if (obj.studentId && obj.userId && !obj.serviceRequestId) {
          return serializeStudent(obj, role);
        }

        // Detect service request-like objects
        if (obj.serviceRequestId && obj.serviceType) {
          const serialized = serializeServiceRequest(obj, role);
          // Also serialize nested student
          if (serialized.student) {
            serialized.student = serializeStudent(serialized.student, role);
          }
          return serialized;
        }

        return obj;
      });
    }

    // Serialize tasks array
    if (filtered.tasks && Array.isArray(filtered.tasks)) {
      filtered.tasks = filtered.tasks.map(t => serializeTask(t, role));
    }

    return originalJson(filtered);
  };

  next();
}

module.exports = {
  repFieldFilter,
  // Re-export serializers for direct use in controllers
  serializeStudent,
  serializeServiceRequest,
  serializeTask,
  serializeUser
};
