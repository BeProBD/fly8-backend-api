/**
 * Request Validation Middleware
 * Uses Joi for schema-based validation
 */

const Joi = require('joi');

/**
 * Generic validation middleware factory
 * @param {Object} schema - Joi schema for validation
 * @param {String} source - Request property to validate (body, query, params)
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const data = req[source];

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace request data with validated/sanitized data
    req[source] = value;
    next();
  };
};

// ========================
// Auth Schemas
// ========================

const authSchemas = {
  register: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().min(8).required().messages({
      'string.min': 'Password must be at least 8 characters',
      'any.required': 'Password is required'
    }),
    firstName: Joi.string().min(1).max(50).required().messages({
      'string.min': 'First name is required',
      'any.required': 'First name is required'
    }),
    lastName: Joi.string().min(1).max(50).required().messages({
      'string.min': 'Last name is required',
      'any.required': 'Last name is required'
    }),
    role: Joi.string().valid('student', 'counselor', 'agent', 'admin').default('student'),
    phone: Joi.string().allow('').optional(),
    country: Joi.string().allow('').optional()
  }),

  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required'
    })
  })
};

// ========================
// Service Request Schemas
// ========================

const serviceRequestSchemas = {
  create: Joi.object({
    serviceType: Joi.string().valid(
      'PROFILE_ASSESSMENT',
      'UNIVERSITY_SHORTLISTING',
      'APPLICATION_ASSISTANCE',
      'VISA_GUIDANCE',
      'SCHOLARSHIP_SEARCH',
      'LOAN_ASSISTANCE',
      'ACCOMMODATION_HELP',
      'PRE_DEPARTURE_ORIENTATION'
    ).required().messages({
      'any.only': 'Invalid service type',
      'any.required': 'Service type is required'
    }),
    notes: Joi.string().max(2000).allow('').optional()
  }),

  assign: Joi.object({
    assignedCounselor: Joi.string().uuid().optional(),
    assignedAgent: Joi.string().uuid().optional(),
    note: Joi.string().max(500).allow('').optional()
  }).or('assignedCounselor', 'assignedAgent').messages({
    'object.missing': 'Either assignedCounselor or assignedAgent is required'
  }),

  updateStatus: Joi.object({
    status: Joi.string().valid(
      'PENDING_ADMIN_ASSIGNMENT',
      'ASSIGNED',
      'IN_PROGRESS',
      'COMPLETED',
      'ON_HOLD',
      'CANCELLED'
    ).required().messages({
      'any.only': 'Invalid status',
      'any.required': 'Status is required'
    }),
    note: Joi.string().max(500).allow('').optional()
  }),

  addNote: Joi.object({
    text: Joi.string().min(1).max(2000).required().messages({
      'string.min': 'Note text is required',
      'any.required': 'Note text is required'
    }),
    isInternal: Joi.boolean().default(false)
  })
};

// ========================
// Task Schemas
// ========================

const taskSchemas = {
  create: Joi.object({
    serviceRequestId: Joi.string().uuid().required().messages({
      'any.required': 'Service request ID is required'
    }),
    taskType: Joi.string().valid(
      'DOCUMENT_UPLOAD',
      'QUESTIONNAIRE',
      'VIDEO_CALL',
      'REVIEW_SESSION',
      'INFORMATION_SUBMISSION',
      'FORM_COMPLETION',
      'PAYMENT',
      'APPROVAL_REQUIRED',
      'OTHER'
    ).required().messages({
      'any.only': 'Invalid task type',
      'any.required': 'Task type is required'
    }),
    title: Joi.string().min(1).max(200).required().messages({
      'any.required': 'Title is required'
    }),
    description: Joi.string().min(1).max(2000).required().messages({
      'any.required': 'Description is required'
    }),
    instructions: Joi.string().max(5000).allow('').optional(),
    priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT').default('MEDIUM'),
    dueDate: Joi.date().iso().optional()
  }),

  submit: Joi.object({
    text: Joi.string().min(1).required().messages({
      'any.required': 'Submission text is required'
    }),
    files: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        url: Joi.string().uri().required(),
        publicId: Joi.string().optional(),
        size: Joi.number().optional()
      })
    ).optional()
  }),

  review: Joi.object({
    feedback: Joi.string().min(1).max(5000).required().messages({
      'any.required': 'Feedback is required'
    }),
    rating: Joi.number().min(1).max(5).optional(),
    requiresRevision: Joi.boolean().default(false)
  }),

  updateStatus: Joi.object({
    status: Joi.string().valid(
      'PENDING',
      'IN_PROGRESS',
      'SUBMITTED',
      'UNDER_REVIEW',
      'REVISION_REQUIRED',
      'COMPLETED'
    ).required(),
    note: Joi.string().max(500).allow('').optional()
  })
};

// ========================
// Admin Schemas
// ========================

const adminSchemas = {
  createUser: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    firstName: Joi.string().min(1).max(50).required(),
    lastName: Joi.string().min(1).max(50).required(),
    role: Joi.string().valid('counselor', 'agent').required().messages({
      'any.only': 'Role must be counselor or agent'
    }),
    phone: Joi.string().allow('').optional(),
    country: Joi.string().allow('').optional()
  }),

  assignCounselor: Joi.object({
    counselorId: Joi.string().uuid().required()
  }),

  assignAgent: Joi.object({
    agentId: Joi.string().uuid().required(),
    commissionPercentage: Joi.number().min(0).max(100).default(10)
  }),

  updateUserStatus: Joi.object({
    isActive: Joi.boolean().required()
  })
};

// ========================
// Admin Notification Schemas
// ========================

const adminNotificationSchemas = {
  create: Joi.object({
    targetType: Joi.string().valid('ALL', 'ROLE', 'USER').required().messages({
      'any.only': 'Target type must be ALL, ROLE, or USER',
      'any.required': 'Target type is required'
    }),
    targetRole: Joi.string().valid('student', 'agent', 'counselor', 'super_admin')
      .when('targetType', {
        is: 'ROLE',
        then: Joi.required(),
        otherwise: Joi.optional()
      }).messages({
        'any.only': 'Invalid target role',
        'any.required': 'Target role is required when target type is ROLE'
      }),
    targetUserId: Joi.string()
      .when('targetType', {
        is: 'USER',
        then: Joi.required(),
        otherwise: Joi.optional()
      }).messages({
        'any.required': 'Target user ID is required when target type is USER'
      }),
    title: Joi.string().min(1).max(200).required().messages({
      'string.min': 'Title is required',
      'string.max': 'Title must be less than 200 characters',
      'any.required': 'Title is required'
    }),
    message: Joi.string().min(1).max(2000).required().messages({
      'string.min': 'Message is required',
      'string.max': 'Message must be less than 2000 characters',
      'any.required': 'Message is required'
    }),
    type: Joi.string().valid('GENERAL', 'SYSTEM').default('GENERAL'),
    priority: Joi.string().valid('LOW', 'NORMAL', 'HIGH', 'URGENT').default('NORMAL'),
    channel: Joi.string().valid('DASHBOARD', 'EMAIL', 'BOTH').default('BOTH'),
    actionUrl: Joi.string().allow('').optional(),
    actionText: Joi.string().max(50).allow('').optional()
  }),

  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    targetType: Joi.string().valid('ALL', 'ROLE', 'USER').optional(),
    type: Joi.string().valid(
      'SERVICE_REQUEST_CREATED',
      'SERVICE_REQUEST_ASSIGNED',
      'TASK_ASSIGNED',
      'TASK_SUBMITTED',
      'TASK_REVIEWED',
      'TASK_REVISION_REQUIRED',
      'TASK_COMPLETED',
      'SERVICE_COMPLETED',
      'STATUS_UPDATE',
      'PAYMENT_RECEIVED',
      'COMMISSION_CREDITED',
      'GENERAL',
      'SYSTEM'
    ).optional(),
    isRead: Joi.string().valid('true', 'false').optional(),
    isArchived: Joi.string().valid('true', 'false').default('false'),
    priority: Joi.string().valid('LOW', 'NORMAL', 'HIGH', 'URGENT').optional(),
    search: Joi.string().max(100).allow('').optional(),
    sortBy: Joi.string().valid('createdAt', 'priority').default('createdAt'),
    order: Joi.string().valid('asc', 'desc').default('desc')
  }),

  update: Joi.object({
    isArchived: Joi.boolean().optional()
  }),

  bulkAction: Joi.object({
    notificationIds: Joi.array().items(Joi.string()).min(1).max(100).required().messages({
      'array.min': 'At least one notification ID is required',
      'array.max': 'Cannot process more than 100 notifications at once',
      'any.required': 'Notification IDs are required'
    }),
    action: Joi.string().valid('archive', 'unarchive', 'delete').required().messages({
      'any.only': 'Action must be archive, unarchive, or delete',
      'any.required': 'Action is required'
    })
  })
};

// ========================
// Query Schemas
// ========================

const querySchemas = {
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }),

  serviceRequestFilters: Joi.object({
    status: Joi.string().valid(
      'PENDING_ADMIN_ASSIGNMENT',
      'ASSIGNED',
      'IN_PROGRESS',
      'COMPLETED',
      'ON_HOLD',
      'CANCELLED'
    ).optional(),
    serviceType: Joi.string().optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }),

  taskFilters: Joi.object({
    serviceRequestId: Joi.string().uuid().optional(),
    status: Joi.string().valid(
      'PENDING',
      'IN_PROGRESS',
      'SUBMITTED',
      'UNDER_REVIEW',
      'REVISION_REQUIRED',
      'COMPLETED'
    ).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

// ========================
// Exports
// ========================

module.exports = {
  validate,
  authSchemas,
  serviceRequestSchemas,
  taskSchemas,
  adminSchemas,
  adminNotificationSchemas,
  querySchemas
};
