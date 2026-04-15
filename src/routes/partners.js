const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const ServiceRequest = require('../models/ServiceRequest');
const Student = require('../models/Student');
const Task = require('../models/Task');
const Commission = require('../models/Commission');
const User = require('../models/User');
const PaymentRequest = require('../models/PaymentRequest');
const { createAuditLog } = require('../utils/auditLogger');

// All partner routes require auth + rep3 role
router.use(authMiddleware, roleMiddleware('rep3'));

// =============================================================================
// DASHBOARD
// =============================================================================

router.get('/dashboard', async (req, res) => {
  try {
    const repUserId = req.user.userId;

    // Use countDocuments and aggregation instead of fetching full documents
    const [
      totalStudents, activeStudents,
      totalSR, activeSR, completedSR,
      totalTasks, pendingTasks,
      earningsAgg
    ] = await Promise.all([
      Student.countDocuments({ createdByRep: repUserId }),
      Student.countDocuments({ createdByRep: repUserId, status: 'active' }),
      ServiceRequest.countDocuments({ representativeId: repUserId }),
      ServiceRequest.countDocuments({ representativeId: repUserId, status: { $nin: ['COMPLETED', 'CANCELLED'] } }),
      ServiceRequest.countDocuments({ representativeId: repUserId, status: 'COMPLETED' }),
      Task.countDocuments({ assignedTo: repUserId }),
      Task.countDocuments({ assignedTo: repUserId, status: { $ne: 'COMPLETED' } }),
      Commission.aggregate([
        { $match: { agentId: repUserId, isDeleted: false } },
        { $group: {
          _id: '$status',
          total: { $sum: '$amount' }
        }}
      ])
    ]);

    const earningsMap = {};
    earningsAgg.forEach(e => { earningsMap[e._id] = e.total; });
    const totalEarnings = earningsMap['paid'] || 0;
    const pendingEarnings = (earningsMap['pending'] || 0) + (earningsMap['approved'] || 0);

    res.json({
      dashboard: {
        totalStudents,
        activeStudents,
        totalServiceRequests: totalSR,
        activeServiceRequests: activeSR,
        completedServiceRequests: completedSR,
        totalTasks,
        pendingTasks,
        totalEarnings,
        pendingEarnings,
        representativeLevel: 3
      }
    });
  } catch (error) {
    console.error('Partner dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// =============================================================================
// STUDENT MANAGEMENT (Create + View)
// =============================================================================

// Create student profile (Partner creates on behalf of student)
router.post('/students', async (req, res) => {
  try {
    const repUserId = req.user.userId;
    const {
      email, firstName, lastName, phone, country,
      interestedCountries, selectedServices,
      currentEducationLevel, fieldOfStudy, gpa, graduationYear, institution,
      ielts, toefl, gre, preferredCountries, preferredDegreeLevel, budget
    } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'Email, firstName, and lastName are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    // Create user account for the student
    const userId = uuidv4();
    const tempPassword = uuidv4().substring(0, 12); // Temporary password

    const user = new User({
      userId,
      email,
      password: tempPassword,
      firstName,
      lastName,
      role: 'student',
      phone: phone || '',
      country: country || '',
      avatar: `https://api.dicebear.com/5.x/initials/svg?seed=${firstName} ${lastName}`
    });
    await user.save();

    // Create student record
    const studentId = uuidv4();
    const student = new Student({
      studentId,
      userId,
      interestedCountries: interestedCountries || [],
      selectedServices: selectedServices || [],
      onboardingCompleted: true, // Partner handles onboarding
      status: 'active',
      createdByRep: repUserId,
      referredBy: repUserId,
      interactionMode: 'rep-counselor',
      country: country || '',
      currentEducationLevel,
      fieldOfStudy,
      gpa,
      graduationYear,
      institution,
      ielts,
      toefl,
      gre,
      preferredCountries: preferredCountries || [],
      preferredDegreeLevel,
      budget
    });
    await student.save();

    // Audit log
    createAuditLog({
      actorUserId: repUserId,
      actorRole: 'rep3',
      action: 'student_created_by_partner',
      entityType: 'student',
      entityId: studentId,
      details: { firstName, lastName, email, interactionMode: 'rep-counselor' },
      req
    }).catch(() => {});

    res.status(201).json({
      message: 'Student profile created successfully',
      student: {
        studentId,
        userId,
        firstName,
        lastName,
        email
      }
    });
  } catch (error) {
    console.error('Partner create student error:', error);
    res.status(500).json({ error: 'Failed to create student profile' });
  }
});

// Get all students created by this partner
router.get('/students', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const repUserId = req.user.userId;

    const filter = { createdByRep: repUserId };
    if (status) filter.status = status;

    const students = await Student.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Populate user data
    const studentUserIds = students.map(s => s.userId);
    const users = await User.find({ userId: { $in: studentUserIds } })
      .select('userId firstName lastName email phone avatar')
      .lean();

    const usersMap = {};
    users.forEach(u => { usersMap[u.userId] = u; });

    const enriched = students.map(s => ({
      ...s,
      user: usersMap[s.userId] || null
    }));

    const total = await Student.countDocuments(filter);

    res.json({
      data: enriched,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Partner get students error:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

router.get('/students/:studentId', async (req, res) => {
  try {
    const repUserId = req.user.userId;
    const student = await Student.findOne({
      studentId: req.params.studentId,
      createdByRep: repUserId
    }).lean();

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const user = await User.findOne({ userId: student.userId })
      .select('-password')
      .lean();

    // Get service requests for this student
    const serviceRequests = await ServiceRequest.find({
      studentId: student.studentId
    }).sort({ createdAt: -1 }).lean();

    res.json({
      student: { ...student, user },
      serviceRequests
    });
  } catch (error) {
    console.error('Partner get student details error:', error);
    res.status(500).json({ error: 'Failed to fetch student details' });
  }
});

// =============================================================================
// SERVICE REQUEST MANAGEMENT (Create + View + Track)
// =============================================================================

// Create service request on behalf of student
router.post('/service-requests', async (req, res) => {
  try {
    const repUserId = req.user.userId;
    const { studentId, serviceType, metadata, formData } = req.body;

    if (!studentId || !serviceType) {
      return res.status(400).json({ error: 'studentId and serviceType are required' });
    }

    // Verify this student belongs to the partner
    const student = await Student.findOne({
      studentId,
      createdByRep: repUserId
    });

    if (!student) {
      return res.status(403).json({ error: 'Access denied - student not found or not owned by you' });
    }

    const serviceRequestId = uuidv4();
    const serviceRequest = new ServiceRequest({
      serviceRequestId,
      studentId,
      serviceType,
      status: 'PENDING_ADMIN_ASSIGNMENT',
      metadata: metadata || {},
      formData: formData || null,
      formSubmittedAt: formData ? new Date() : null,
      representativeId: repUserId,
      representativeLevel: 3,
      createdBy: 'rep3',
      interactionMode: 'rep-counselor',
      statusHistory: [{
        status: 'CREATED',
        changedBy: repUserId,
        changedAt: new Date(),
        note: 'Service request created by partner representative'
      }]
    });

    await serviceRequest.save();

    // Audit log
    createAuditLog({
      actorUserId: repUserId,
      actorRole: 'rep3',
      action: 'service_request_created_by_partner',
      entityType: 'service_request',
      entityId: serviceRequestId,
      details: { studentId, serviceType, interactionMode: 'rep-counselor' },
      req
    }).catch(() => {});

    res.status(201).json({
      message: 'Service request created successfully',
      serviceRequest
    });
  } catch (error) {
    console.error('Partner create service request error:', error);
    res.status(500).json({ error: 'Failed to create service request' });
  }
});

// Get all service requests for partner's students
router.get('/service-requests', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, serviceType } = req.query;
    const repUserId = req.user.userId;

    const filter = { representativeId: repUserId };
    if (status) filter.status = status;
    if (serviceType) filter.serviceType = serviceType;

    const requests = await ServiceRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Populate counselor info
    const counselorIds = [...new Set(requests.map(r => r.assignedCounselor).filter(Boolean))];
    const counselors = await User.find({ userId: { $in: counselorIds } })
      .select('userId firstName lastName email avatar')
      .lean();

    const counselorMap = {};
    counselors.forEach(c => { counselorMap[c.userId] = c; });

    // Populate student info
    const studentIds = [...new Set(requests.map(r => r.studentId))];
    const students = await Student.find({ studentId: { $in: studentIds } }).lean();
    const studentUserIds = students.map(s => s.userId);
    const studentUsers = await User.find({ userId: { $in: studentUserIds } })
      .select('userId firstName lastName email avatar')
      .lean();

    const studentUserMap = {};
    studentUsers.forEach(u => { studentUserMap[u.userId] = u; });

    const studentMap = {};
    students.forEach(s => {
      studentMap[s.studentId] = {
        ...s,
        user: studentUserMap[s.userId] || null
      };
    });

    const enriched = requests.map(r => ({
      ...r,
      counselor: counselorMap[r.assignedCounselor] || null,
      student: studentMap[r.studentId] || null
    }));

    const total = await ServiceRequest.countDocuments(filter);

    res.json({
      data: enriched,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Partner get service requests error:', error);
    res.status(500).json({ error: 'Failed to fetch service requests' });
  }
});

router.get('/service-requests/:id', async (req, res) => {
  try {
    const repUserId = req.user.userId;
    const request = await ServiceRequest.findOne({
      serviceRequestId: req.params.id,
      representativeId: repUserId
    }).lean();

    if (!request) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    // Get tasks for this request (all, regardless of assignee)
    const tasks = await Task.find({ serviceRequestId: request.serviceRequestId })
      .sort({ createdAt: -1 })
      .lean();

    // Counselor
    let counselor = null;
    if (request.assignedCounselor) {
      counselor = await User.findOne({ userId: request.assignedCounselor })
        .select('userId firstName lastName email avatar phone')
        .lean();
    }

    // Student + user
    const student = await Student.findOne({ studentId: request.studentId }).lean();
    let studentUser = null;
    if (student) {
      studentUser = await User.findOne({ userId: student.userId })
        .select('userId firstName lastName email avatar phone')
        .lean();
    }

    // Partner (self) — include for UI consistency
    const partner = await User.findOne({ userId: repUserId })
      .select('userId firstName lastName email avatar phone')
      .lean();

    // Attach counselor/student/partner ONTO the serviceRequest too,
    // so the frontend can read them from a single object without losing data
    // when it unwraps with `res.serviceRequest`.
    const serviceRequest = {
      ...request,
      counselor,
      student: student ? { ...student, user: studentUser } : null,
      partner,
      tasks,
    };

    res.json({
      serviceRequest,
      tasks,
      counselor,
      student: student ? { ...student, user: studentUser } : null,
      partner,
    });
  } catch (error) {
    console.error('Partner get service request detail error:', error);
    res.status(500).json({ error: 'Failed to fetch service request details' });
  }
});

// =============================================================================
// TASKS (Partner can submit tasks assigned to them)
// =============================================================================

router.get('/tasks', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, serviceRequestId } = req.query;
    const repUserId = req.user.userId;

    // A partner must see:
    //   (a) any task directly assigned to them, OR
    //   (b) any task tied to a serviceRequest they own (representativeId = partner),
    //       even if the task was (historically / accidentally) assigned to the student.
    const ownedRequests = await ServiceRequest.find({ representativeId: repUserId })
      .select('serviceRequestId')
      .lean();
    const ownedIds = ownedRequests.map(r => r.serviceRequestId);

    const or = [{ assignedTo: repUserId }];
    if (ownedIds.length) or.push({ serviceRequestId: { $in: ownedIds } });

    const filter = { $or: or };
    if (status) filter.status = status;
    if (serviceRequestId) {
      // Narrow to a single SR, but still require partner ownership
      if (!ownedIds.includes(serviceRequestId)) {
        // Allow only if the task is directly assigned to the partner
        filter.$or = [{ assignedTo: repUserId, serviceRequestId }];
      } else {
        filter.$or = [
          { assignedTo: repUserId, serviceRequestId },
          { serviceRequestId },
        ];
      }
    }

    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      Task.countDocuments(filter),
    ]);

    // Enrich with counselor (assignedBy) + serviceRequest meta for the list UI
    const counselorIds = [...new Set(tasks.map(t => t.assignedBy).filter(Boolean))];
    const counselors = counselorIds.length
      ? await User.find({ userId: { $in: counselorIds } })
          .select('userId firstName lastName email avatar')
          .lean()
      : [];
    const counselorMap = {};
    counselors.forEach(c => { counselorMap[c.userId] = c; });

    const srIds = [...new Set(tasks.map(t => t.serviceRequestId).filter(Boolean))];
    const srs = srIds.length
      ? await ServiceRequest.find({ serviceRequestId: { $in: srIds } })
          .select('serviceRequestId serviceType status studentId assignedCounselor representativeId')
          .lean()
      : [];
    const srMap = {};
    srs.forEach(s => { srMap[s.serviceRequestId] = s; });

    const enriched = tasks.map(t => ({
      ...t,
      counselor: counselorMap[t.assignedBy] || null,
      serviceRequest: srMap[t.serviceRequestId] || null,
    }));

    res.json({
      data: enriched,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Partner get tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Submit task (partner acts like student for task submission)
router.post('/tasks/:taskId/submit', async (req, res) => {
  try {
    const repUserId = req.user.userId;
    const { text, files } = req.body;

    let task = await Task.findOne({
      taskId: req.params.taskId,
      assignedTo: repUserId
    });

    // Fallback: if task isn't directly assigned to the partner but belongs to
    // one of their service requests, allow submission (rep-counselor mode).
    if (!task) {
      task = await Task.findOne({ taskId: req.params.taskId });
      if (task) {
        const sr = await ServiceRequest.findOne({
          serviceRequestId: task.serviceRequestId,
          representativeId: repUserId,
        }).lean();
        if (!sr) task = null;
      }
    }

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const previousStatus = task.status;
    task.submit(text, files || []);
    await task.save();

    // Audit log
    createAuditLog({
      actorUserId: repUserId,
      actorRole: 'rep3',
      action: 'task_submitted_by_partner',
      entityType: 'task',
      entityId: task.taskId,
      previousState: { status: previousStatus },
      newState: { status: task.status },
      details: { serviceRequestId: task.serviceRequestId },
      req
    }).catch(() => {});

    res.json({ message: 'Task submitted successfully', task });
  } catch (error) {
    console.error('Partner submit task error:', error);
    res.status(500).json({ error: 'Failed to submit task' });
  }
});

// =============================================================================
// COMMISSIONS
// =============================================================================

router.get('/commissions', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const repUserId = req.user.userId;

    const filter = { agentId: repUserId, isDeleted: false };
    if (status) filter.status = status;

    const commissions = await Commission.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Commission.countDocuments(filter);

    res.json({
      data: commissions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Partner get commissions error:', error);
    res.status(500).json({ error: 'Failed to fetch commissions' });
  }
});

router.get('/commission-stats', async (req, res) => {
  try {
    const repUserId = req.user.userId;

    const commissions = await Commission.find({
      agentId: repUserId,
      isDeleted: false
    });

    const totalEarned = commissions
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + c.amount, 0);

    const pendingAmount = commissions
      .filter(c => c.status === 'pending' || c.status === 'approved')
      .reduce((sum, c) => sum + c.amount, 0);

    res.json({
      totalEarned,
      pendingAmount,
      totalCommissions: commissions.length,
      representativeLevel: 3
    });
  } catch (error) {
    console.error('Partner commission stats error:', error);
    res.status(500).json({ error: 'Failed to fetch commission stats' });
  }
});

// =============================================================================
// PAYMENT REQUESTS (partner-initiated)
// =============================================================================

// List payment requests created by this partner
router.get('/payment-requests', async (req, res) => {
  try {
    const { serviceRequestId, status, page = 1, limit = 50 } = req.query;
    const q = { partnerId: req.user.userId };
    if (serviceRequestId) q.serviceRequestId = serviceRequestId;
    if (status) q.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      PaymentRequest.find(q).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      PaymentRequest.countDocuments(q),
    ]);

    res.json({
      data,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.max(1, Math.ceil(total / Number(limit))),
      },
    });
  } catch (err) {
    console.error('List partner payment requests error:', err);
    res.status(500).json({ error: 'Failed to fetch payment requests' });
  }
});

// Create a payment request on a COMPLETED service owned by this partner
router.post('/payment-requests', async (req, res) => {
  try {
    const { serviceRequestId, amount, note = '' } = req.body;

    if (!serviceRequestId || amount === undefined || amount === null) {
      return res
        .status(400)
        .json({ error: 'serviceRequestId and amount are required' });
    }
    const numericAmount = Number(amount);
    if (!(numericAmount > 0)) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    const serviceRequest = await ServiceRequest.findOne({ serviceRequestId });
    if (!serviceRequest) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    // Ownership: partner can only create for their own rep-counselor cases
    if (serviceRequest.representativeId !== req.user.userId) {
      return res
        .status(403)
        .json({ error: 'You do not own this service request' });
    }

    // Data integrity: must be completed
    if (serviceRequest.status !== 'COMPLETED') {
      return res.status(400).json({
        error: 'Payment can only be requested after the service is completed',
      });
    }

    // Dedupe: disallow if there is already a pending/approved request
    const existingActive = await PaymentRequest.findOne({
      serviceRequestId,
      status: { $in: ['pending', 'approved'] },
    });
    if (existingActive) {
      return res.status(409).json({
        error: 'A payment request is already active for this service',
        paymentRequest: existingActive,
      });
    }

    // Dedupe: disallow if there is already a paid request (one payment per service)
    const alreadyPaid = await PaymentRequest.findOne({
      serviceRequestId,
      status: 'paid',
    });
    if (alreadyPaid) {
      return res.status(409).json({
        error: 'This service has already been paid',
        paymentRequest: alreadyPaid,
      });
    }

    const doc = await PaymentRequest.create({
      paymentRequestId: uuidv4(),
      serviceRequestId,
      partnerId: req.user.userId,
      studentId: serviceRequest.studentId,
      amount: numericAmount,
      note,
      status: 'pending',
    });

    try {
      await createAuditLog({
        actorUserId: req.user.userId,
        actorRole: req.user.role,
        action: 'payment_request_created',
        entityType: 'payment_request',
        entityId: doc.paymentRequestId,
        details: { serviceRequestId, amount: numericAmount },
        req,
      });
    } catch (_) { /* audit is best-effort */ }

    res.status(201).json({ message: 'Payment request created', data: doc });
  } catch (err) {
    if (err && err.code === 11000) {
      return res
        .status(409)
        .json({ error: 'A payment request already exists for this service' });
    }
    console.error('Create payment request error:', err);
    res.status(500).json({ error: 'Failed to create payment request' });
  }
});

// Cancel own pending request
router.patch('/payment-requests/:id/cancel', async (req, res) => {
  try {
    const doc = await PaymentRequest.findOne({
      paymentRequestId: req.params.id,
      partnerId: req.user.userId,
    });
    if (!doc) return res.status(404).json({ error: 'Payment request not found' });
    if (doc.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be cancelled' });
    }
    doc.status = 'cancelled';
    await doc.save();
    res.json({ message: 'Payment request cancelled', data: doc });
  } catch (err) {
    console.error('Cancel payment request error:', err);
    res.status(500).json({ error: 'Failed to cancel payment request' });
  }
});

module.exports = router;
