/**
 * Task Routes
 * Generic task management endpoints for all services
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const {
  createTask,
  getTasks,
  getTaskById,
  submitTask,
  reviewTask,
  updateTaskStatus,
  deleteTask,
  getTaskStats
} = require('../controllers/taskController');

/**
 * @route   POST /api/tasks
 * @desc    Create a new task
 * @access  Counselor, Agent, Super Admin
 */
router.post('/',
  authMiddleware,
  roleMiddleware('counselor', 'agent', 'super_admin'),
  createTask
);

/**
 * @route   GET /api/tasks
 * @desc    Get all tasks (role-based filtering)
 * @access  Authenticated (All roles)
 */
router.get('/',
  authMiddleware,
  getTasks
);

/**
 * @route   GET /api/tasks/:taskId
 * @desc    Get single task by ID
 * @access  Authenticated (with ownership check)
 */
router.get('/:taskId',
  authMiddleware,
  getTaskById
);

/**
 * @route   POST /api/tasks/:taskId/submit
 * @desc    Submit task (by student)
 * @access  Student only
 */
router.post('/:taskId/submit',
  authMiddleware,
  roleMiddleware('student'),
  submitTask
);

/**
 * @route   POST /api/tasks/:taskId/review
 * @desc    Review task and provide feedback
 * @access  Counselor, Agent, Super Admin
 */
router.post('/:taskId/review',
  authMiddleware,
  roleMiddleware('counselor', 'agent', 'super_admin'),
  reviewTask
);

/**
 * @route   PATCH /api/tasks/:taskId/status
 * @desc    Update task status
 * @access  Counselor, Agent, Super Admin
 */
router.patch('/:taskId/status',
  authMiddleware,
  roleMiddleware('counselor', 'agent', 'super_admin'),
  updateTaskStatus
);

/**
 * @route   DELETE /api/tasks/:taskId
 * @desc    Delete task
 * @access  Counselor, Agent, Super Admin
 */
router.delete('/:taskId',
  authMiddleware,
  roleMiddleware('counselor', 'agent', 'super_admin'),
  deleteTask
);

/**
 * @route   GET /api/tasks/stats/:serviceRequestId
 * @desc    Get task statistics for a service request
 * @access  Authenticated
 */
router.get('/stats/:serviceRequestId',
  authMiddleware,
  getTaskStats
);

module.exports = router;
