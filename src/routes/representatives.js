const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const { repFieldFilter } = require('../middlewares/fieldFilter');
const ServiceRequest = require('../models/ServiceRequest');
const Student = require('../models/Student');
const Task = require('../models/Task');
const Commission = require('../models/Commission');
const User = require('../models/User');

// All representative routes require auth + rep1/rep2 role
router.use(authMiddleware, roleMiddleware('rep1', 'rep2'));

// STRICT READ-ONLY: rep1/rep2 can only use GET methods
router.use((req, res, next) => {
  if (req.method !== 'GET') {
    return res.status(403).json({
      error: 'Read-only access — representatives at this level cannot modify data'
    });
  }
  next();
});

// FIELD-LEVEL RBAC: Strip sensitive data from responses
router.use(repFieldFilter);

// =============================================================================
// DASHBOARD
// =============================================================================

router.get('/dashboard', async (req, res) => {
  try {
    const repUserId = req.user.userId;

    // Use countDocuments and aggregation instead of fetching full documents
    const [totalStudents, activeStudents, totalSR, activeSR, completedSR, earningsAgg] = await Promise.all([
      Student.countDocuments({ referredBy: repUserId }),
      Student.countDocuments({ referredBy: repUserId, status: 'active' }),
      ServiceRequest.countDocuments({ representativeId: repUserId }),
      ServiceRequest.countDocuments({ representativeId: repUserId, status: { $nin: ['COMPLETED', 'CANCELLED'] } }),
      ServiceRequest.countDocuments({ representativeId: repUserId, status: 'COMPLETED' }),
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
        totalEarnings,
        pendingEarnings,
        commissionPercentage: req.user.role === 'rep1' ? 20 : 40,
        representativeLevel: req.user.role === 'rep1' ? 1 : 2
      }
    });
  } catch (error) {
    console.error('Rep dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// =============================================================================
// STUDENTS (READ ONLY)
// =============================================================================

router.get('/students', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const repUserId = req.user.userId;

    const filter = { referredBy: repUserId };
    if (status) filter.status = status;

    const students = await Student.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Populate user data for each student
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
    console.error('Rep get students error:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// =============================================================================
// SERVICE REQUESTS (READ ONLY)
// =============================================================================

router.get('/service-requests', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const repUserId = req.user.userId;

    const filter = { representativeId: repUserId };
    if (status) filter.status = status;

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

    const enriched = requests.map(r => ({
      ...r,
      counselor: counselorMap[r.assignedCounselor] || null
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
    console.error('Rep get service requests error:', error);
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

    // Get tasks for this request (read-only view)
    const tasks = await Task.find({ serviceRequestId: request.serviceRequestId }).lean();

    // Get counselor info
    let counselor = null;
    if (request.assignedCounselor) {
      counselor = await User.findOne({ userId: request.assignedCounselor })
        .select('userId firstName lastName email avatar').lean();
    }

    // Get student info
    const student = await Student.findOne({ studentId: request.studentId }).lean();
    let studentUser = null;
    if (student) {
      studentUser = await User.findOne({ userId: student.userId })
        .select('userId firstName lastName email avatar').lean();
    }

    res.json({
      serviceRequest: request,
      tasks,
      counselor,
      student: student ? { ...student, user: studentUser } : null
    });
  } catch (error) {
    console.error('Rep get service request detail error:', error);
    res.status(500).json({ error: 'Failed to fetch service request details' });
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
    console.error('Rep get commissions error:', error);
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

    const totalCommissions = commissions.length;

    res.json({
      totalEarned,
      pendingAmount,
      totalCommissions,
      commissionPercentage: req.user.role === 'rep1' ? 20 : 40
    });
  } catch (error) {
    console.error('Rep commission stats error:', error);
    res.status(500).json({ error: 'Failed to fetch commission stats' });
  }
});

module.exports = router;
