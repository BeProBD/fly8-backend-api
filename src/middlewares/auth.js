const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');

const JWT_SECRET = process.env.JWT_SECRET || 'fly8-secret-key-change-in-production';

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({ userId: decoded.userId }).select('-password');

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    req.user = user;

    // For students, also attach student record
    if (user.role === 'student') {
      const student = await Student.findOne({ userId: user.userId });
      req.student = student;
    }

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * Role-based access control middleware
 * Restricts route access to specific roles
 */
const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  };
};

/**
 * Get query filter for role-based data access
 * @param {Object} user - User object from req.user
 * @param {String} entityType - Type of entity ('serviceRequest', 'task', 'notification')
 * @returns {Object} MongoDB query filter
 */
const getRoleBasedFilter = (user, entityType) => {
  switch (user.role) {
    case 'super_admin':
      // Super admin sees everything
      return {};

    case 'student':
      // Students see only their own data
      switch (entityType) {
        case 'serviceRequest':
          // Need to get studentId from Student model
          return { studentId: user.studentId }; // Will be set in context
        case 'task':
          return { assignedTo: user.userId };
        case 'notification':
          return { recipientId: user.userId };
        default:
          return { userId: user.userId };
      }

    case 'counselor':
    case 'agent':
      // Counselors/Agents see only assigned data
      switch (entityType) {
        case 'serviceRequest':
          return {
            $or: [
              { assignedCounselor: user.userId },
              { assignedAgent: user.userId }
            ]
          };
        case 'task':
          return { assignedBy: user.userId };
        case 'notification':
          return { recipientId: user.userId };
        default:
          return {};
      }

    default:
      return { _id: null }; // No access
  }
};

/**
 * Check if user can access specific resource
 * @param {Object} user - User object
 * @param {Object} resource - Resource to check access for
 * @param {String} resourceType - Type of resource
 * @returns {Boolean} Access allowed or not
 */
const canAccessResource = (user, resource, resourceType) => {
  if (user.role === 'super_admin') {
    return true;
  }

  switch (resourceType) {
    case 'serviceRequest':
      if (user.role === 'student') {
        return resource.studentId === user.studentId;
      }
      if (user.role === 'counselor' || user.role === 'agent') {
        return resource.assignedCounselor === user.userId ||
               resource.assignedAgent === user.userId;
      }
      return false;

    case 'task':
      if (user.role === 'student') {
        return resource.assignedTo === user.userId;
      }
      if (user.role === 'counselor' || user.role === 'agent') {
        return resource.assignedBy === user.userId;
      }
      return false;

    case 'student':
      if (user.role === 'student') {
        return resource.userId === user.userId;
      }
      if (user.role === 'counselor' || user.role === 'agent') {
        return resource.assignedCounselor === user.userId ||
               student.assignedAgent === user.userId;
      }
      return false;

    default:
      return false;
  }
};

/**
 * Get dashboard redirect URL based on user role
 * @param {String} role - User role
 * @returns {String} Dashboard URL
 */
const getDashboardUrl = (role) => {
  const dashboardMap = {
    'student': '/student/dashboard',
    'counselor': '/counselor/dashboard',
    'agent': '/agent/dashboard',
    'super_admin': '/admin/dashboard'
  };

  return dashboardMap[role] || '/';
};

/**
 * Middleware to check resource ownership
 * Verifies user can access the requested resource
 */
const checkResourceAccess = (resourceType, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      if (req.user.role === 'super_admin') {
        return next(); // Admin has access to everything
      }

      const resourceId = req.params[resourceIdParam];
      let resource;
      let Model;

      // Get appropriate model
      switch (resourceType) {
        case 'serviceRequest':
          Model = require('../models/ServiceRequest');
          break;
        case 'task':
          Model = require('../models/Task');
          break;
        case 'student':
          Model = require('../models/Student');
          break;
        default:
          return res.status(400).json({ error: 'Invalid resource type' });
      }

      // Find resource
      const filter = resourceType === 'serviceRequest'
        ? { serviceRequestId: resourceId }
        : resourceType === 'task'
        ? { taskId: resourceId }
        : { studentId: resourceId };

      resource = await Model.findOne(filter);

      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      // Check access
      if (!canAccessResource(req.user, resource, resourceType)) {
        return res.status(403).json({ error: 'Access denied to this resource' });
      }

      req.resource = resource; // Attach to request for use in route handler
      next();

    } catch (error) {
      console.error('Resource access check error:', error);
      res.status(500).json({ error: 'Access check failed' });
    }
  };
};

module.exports = {
  authMiddleware,
  roleMiddleware,
  getRoleBasedFilter,
  canAccessResource,
  getDashboardUrl,
  checkResourceAccess,
  JWT_SECRET
};