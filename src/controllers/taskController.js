/**
 * Task Controller
 * Manages tasks for all service types
 */

const { v4: uuidv4 } = require('uuid');
const Task = require('../models/Task');
const ServiceRequest = require('../models/ServiceRequest');
const User = require('../models/User');
const Student = require('../models/Student');
const notificationService = require('../services/notificationService');
const { logTaskEvent } = require('../utils/auditLogger');
const { emitToUser, broadcastTaskUpdate } = require('../socket/socketManager');

/**
 * Create a new task (Counselor/Agent only)
 */
const createTask = async (req, res) => {
  try {
    const {
      serviceRequestId,
      taskType,
      title,
      description,
      instructions,
      priority,
      dueDate
    } = req.body;

    if (!serviceRequestId || !taskType || !title || !description) {
      return res.status(400).json({
        error: 'Missing required fields: serviceRequestId, taskType, title, description'
      });
    }

    // Verify service request exists
    const serviceRequest = await ServiceRequest.findOne({ serviceRequestId });
    if (!serviceRequest) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    // Verify user is assigned to this service request
    const isAssigned =
      req.user.role === 'super_admin' ||
      serviceRequest.assignedCounselor === req.user.userId ||
      serviceRequest.assignedAgent === req.user.userId;

    if (!isAssigned) {
      return res.status(403).json({
        error: 'You are not assigned to this service request'
      });
    }

    // Get student's userId from service request
    const student = await Student.findOne({ studentId: serviceRequest.studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Create task
    const taskId = uuidv4();
    const task = new Task({
      taskId,
      serviceRequestId,
      taskType,
      title,
      description,
      instructions: instructions || '',
      assignedTo: student.userId,
      assignedBy: req.user.userId,
      status: 'PENDING',
      priority: priority || 'MEDIUM',
      dueDate: dueDate ? new Date(dueDate) : null
    });

    // Add initial status to history
    task.statusHistory.push({
      status: 'PENDING',
      changedBy: req.user.userId,
      changedAt: new Date(),
      note: 'Task created and assigned to student'
    });

    await task.save();

    // Audit log: Task created
    await logTaskEvent(req, 'task_created', task);

    // Update service request status to IN_PROGRESS if it's ASSIGNED
    if (serviceRequest.status === 'ASSIGNED') {
      serviceRequest.updateStatus('IN_PROGRESS', req.user.userId, 'First task created');
      await serviceRequest.save();
    }

    // Send notification to student
    try {
      const studentUser = await User.findOne({ userId: student.userId });
      if (studentUser) {
        await notificationService.notifyTaskAssigned(task, studentUser, req.user);
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
      // Don't fail the request if notification fails
    }

    // Emit real-time update to student
    try {
      const enrichedTask = await getEnrichedTask(task);
      emitToUser(student.userId, 'task_created', enrichedTask);
      broadcastTaskUpdate(enrichedTask, 'task_created');
    } catch (socketError) {
      console.error('Socket emission error:', socketError);
    }

    res.status(201).json({
      message: 'Task created successfully',
      task: {
        taskId: task.taskId,
        taskType: task.taskType,
        title: task.title,
        status: task.status,
        assignedTo: task.assignedTo,
        dueDate: task.dueDate,
        createdAt: task.createdAt
      }
    });

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

/**
 * Get all tasks (role-based filtering)
 */
const getTasks = async (req, res) => {
  try {
    const { serviceRequestId, status, page = 1, limit = 20 } = req.query;

    let filter = {};

    // Role-based filtering
    switch (req.user.role) {
      case 'super_admin':
        // Admin sees everything
        filter = {};
        break;

      case 'student':
        // Students see only their assigned tasks
        filter = { assignedTo: req.user.userId };
        break;

      case 'counselor':
      case 'agent':
        // Counselors/Agents see only tasks they created
        filter = { assignedBy: req.user.userId };
        break;

      default:
        return res.status(403).json({ error: 'Access denied' });
    }

    // Apply additional filters
    if (serviceRequestId) {
      filter.serviceRequestId = serviceRequestId;
    }
    if (status) {
      filter.status = status;
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const tasks = await Task.find(filter)
      .sort({ dueDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Task.countDocuments(filter);

    // Enrich tasks with user information
    const enrichedTasks = await Promise.all(
      tasks.map(async (task) => {
        const assignedToUser = await User.findOne({ userId: task.assignedTo })
          .select('userId firstName lastName email avatar')
          .lean();

        const assignedByUser = await User.findOne({ userId: task.assignedBy })
          .select('userId firstName lastName email avatar')
          .lean();

        const serviceRequest = await ServiceRequest.findOne({ serviceRequestId: task.serviceRequestId })
          .select('serviceType status')
          .lean();

        return {
          ...task,
          assignedToUser,
          assignedByUser,
          serviceRequest
        };
      })
    );

    res.json({
      tasks: enrichedTasks,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
};

/**
 * Get single task by ID
 */
const getTaskById = async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await Task.findOne({ taskId });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check access permissions
    const canAccess =
      req.user.role === 'super_admin' ||
      task.assignedTo === req.user.userId ||
      task.assignedBy === req.user.userId;

    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    // Populate related data
    const assignedToUser = await User.findOne({ userId: task.assignedTo })
      .select('userId firstName lastName email avatar')
      .lean();

    const assignedByUser = await User.findOne({ userId: task.assignedBy })
      .select('userId firstName lastName email avatar')
      .lean();

    const serviceRequest = await ServiceRequest.findOne({ serviceRequestId: task.serviceRequestId }).lean();

    res.json({
      task: {
        ...task.toObject(),
        assignedToUser,
        assignedByUser,
        serviceRequest
      }
    });

  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
};

/**
 * Submit task (Student only)
 */
const submitTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { text, files } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Submission text is required' });
    }

    const task = await Task.findOne({ taskId });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify student is assigned to this task
    if (task.assignedTo !== req.user.userId) {
      return res.status(403).json({ error: 'This task is not assigned to you' });
    }

    // Check if task can be submitted
    if (task.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Task is already completed' });
    }

    // Capture previous status for audit
    const previousStatus = task.status;

    // Submit task
    task.submit(text, files || []);
    await task.save();

    // Audit log: Task submitted
    await logTaskEvent(req, 'task_submitted', task, previousStatus);

    // Send notification to counselor/agent
    try {
      const assignedByUser = await User.findOne({ userId: task.assignedBy });
      if (assignedByUser) {
        await notificationService.notifyTaskSubmitted(task, assignedByUser, req.user);
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
      // Don't fail the request if notification fails
    }

    // Emit real-time update
    try {
      const enrichedTask = await getEnrichedTask(task);
      emitToUser(task.assignedBy, 'task_updated', enrichedTask);
      broadcastTaskUpdate(enrichedTask, 'task_submitted');
    } catch (socketError) {
      console.error('Socket emission error:', socketError);
    }

    res.json({
      message: 'Task submitted successfully',
      task: {
        taskId: task.taskId,
        status: task.status,
        submission: task.submission
      }
    });

  } catch (error) {
    console.error('Submit task error:', error);
    res.status(500).json({ error: 'Failed to submit task' });
  }
};

/**
 * Review task and provide feedback (Counselor/Agent only)
 */
const reviewTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { feedback, rating, requiresRevision } = req.body;

    if (!feedback) {
      return res.status(400).json({ error: 'Feedback text is required' });
    }

    const task = await Task.findOne({ taskId });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify user created this task
    if (task.assignedBy !== req.user.userId && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'You did not create this task' });
    }

    // Check if task has been submitted
    if (task.status !== 'SUBMITTED' && task.status !== 'UNDER_REVIEW') {
      return res.status(400).json({
        error: 'Task must be submitted before it can be reviewed',
        currentStatus: task.status
      });
    }

    // Capture previous status for audit
    const previousStatus = task.status;

    // Provide feedback
    task.provideFeedback(feedback, req.user.userId, rating);

    // Update status based on review
    if (requiresRevision) {
      task.updateStatus('REVISION_REQUIRED', req.user.userId, 'Revision requested after review');
    } else {
      task.updateStatus('COMPLETED', req.user.userId, 'Task approved and completed');
    }

    await task.save();

    // Audit log: Task reviewed
    const auditAction = requiresRevision ? 'task_revision_requested' : 'task_completed';
    await logTaskEvent(req, auditAction, task, previousStatus);

    // Send notification to student
    try {
      const studentUser = await User.findOne({ userId: task.assignedTo });
      if (studentUser) {
        await notificationService.notifyTaskReviewed(
          task,
          studentUser,
          req.user,
          requiresRevision || false
        );
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
      // Don't fail the request if notification fails
    }

    // Emit real-time update to student
    try {
      const enrichedTask = await getEnrichedTask(task);
      emitToUser(task.assignedTo, 'task_updated', enrichedTask);
      broadcastTaskUpdate(enrichedTask, requiresRevision ? 'task_revision_required' : 'task_completed');
    } catch (socketError) {
      console.error('Socket emission error:', socketError);
    }

    res.json({
      message: requiresRevision ? 'Revision requested' : 'Task completed successfully',
      task: {
        taskId: task.taskId,
        status: task.status,
        feedback: task.feedback
      }
    });

  } catch (error) {
    console.error('Review task error:', error);
    res.status(500).json({ error: 'Failed to review task' });
  }
};

/**
 * Update task status (Counselor/Agent/Admin only)
 */
const updateTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status, note } = req.body;

    const task = await Task.findOne({ taskId });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify permissions
    const canUpdate =
      req.user.role === 'super_admin' ||
      task.assignedBy === req.user.userId;

    if (!canUpdate) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate status transition
    const validTransitions = {
      'PENDING': ['IN_PROGRESS', 'COMPLETED'],
      'IN_PROGRESS': ['SUBMITTED', 'COMPLETED'],
      'SUBMITTED': ['UNDER_REVIEW', 'REVISION_REQUIRED', 'COMPLETED'],
      'UNDER_REVIEW': ['REVISION_REQUIRED', 'COMPLETED'],
      'REVISION_REQUIRED': ['IN_PROGRESS', 'SUBMITTED'],
      'COMPLETED': [] // Terminal state
    };

    if (!validTransitions[task.status].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status transition',
        currentStatus: task.status,
        requestedStatus: status,
        allowedTransitions: validTransitions[task.status]
      });
    }

    // Capture previous status for audit
    const previousStatus = task.status;

    task.updateStatus(status, req.user.userId, note || '');
    await task.save();

    // Audit log: Task status changed
    const auditAction = status === 'COMPLETED' ? 'task_completed' : 'task_status_changed';
    await logTaskEvent(req, auditAction, task, previousStatus);

    res.json({
      message: 'Task status updated successfully',
      task: {
        taskId: task.taskId,
        status: task.status
      }
    });

  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({ error: 'Failed to update task status' });
  }
};

/**
 * Delete task (Counselor/Agent/Admin only)
 */
const deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await Task.findOne({ taskId });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify permissions
    const canDelete =
      req.user.role === 'super_admin' ||
      task.assignedBy === req.user.userId;

    if (!canDelete) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only allow deletion if task hasn't been submitted
    if (task.status !== 'PENDING' && task.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        error: 'Cannot delete task that has been submitted or completed',
        currentStatus: task.status
      });
    }

    // Audit log: Task deleted (before actual deletion)
    await logTaskEvent(req, 'task_deleted', task);

    await Task.deleteOne({ taskId });

    res.json({
      message: 'Task deleted successfully'
    });

  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

/**
 * Get task statistics by service request
 */
const getTaskStats = async (req, res) => {
  try {
    const { serviceRequestId } = req.params;

    const stats = {
      total: 0,
      byStatus: {},
      completionRate: 0
    };

    // Build filter based on role
    let filter = { serviceRequestId };

    switch (req.user.role) {
      case 'super_admin':
        // Admin sees all
        break;

      case 'student':
        filter.assignedTo = req.user.userId;
        break;

      case 'counselor':
      case 'agent':
        filter.assignedBy = req.user.userId;
        break;

      default:
        return res.status(403).json({ error: 'Access denied' });
    }

    // Get counts
    stats.total = await Task.countDocuments(filter);

    const statusCounts = await Task.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    statusCounts.forEach(item => {
      stats.byStatus[item._id] = item.count;
    });

    // Calculate completion rate
    const completedCount = stats.byStatus['COMPLETED'] || 0;
    stats.completionRate = stats.total > 0
      ? Math.round((completedCount / stats.total) * 100)
      : 0;

    res.json({ stats });

  } catch (error) {
    console.error('Get task stats error:', error);
    res.status(500).json({ error: 'Failed to fetch task statistics' });
  }
};

/**
 * Helper: Get enriched task with populated relations
 */
const getEnrichedTask = async (task) => {
  const taskObj = task.toObject ? task.toObject() : task;

  const assignedToUser = await User.findOne({ userId: taskObj.assignedTo })
    .select('userId firstName lastName email avatar')
    .lean();

  const assignedByUser = await User.findOne({ userId: taskObj.assignedBy })
    .select('userId firstName lastName email avatar')
    .lean();

  const serviceRequest = await ServiceRequest.findOne({ serviceRequestId: taskObj.serviceRequestId })
    .select('serviceType status studentId')
    .lean();

  return {
    ...taskObj,
    assignedToUser,
    assignedByUser,
    serviceRequest
  };
};

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  submitTask,
  reviewTask,
  updateTaskStatus,
  deleteTask,
  getTaskStats
};
