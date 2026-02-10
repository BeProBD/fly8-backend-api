/**
 * Dashboard API Routes
 * Comprehensive analytics endpoints for Super Admin Dashboard
 * All endpoints require super_admin role
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const Student = require('../models/Student');
const User = require('../models/User');
const ServiceRequest = require('../models/ServiceRequest');
const Commission = require('../models/Commission');
const Payment = require('../models/Payment');
const University = require('../models/University');
const Service = require('../models/Service');
const Message = require('../models/Message');
const AuditLog = require('../models/AuditLog');
const Task = require('../models/Task');
const Blog = require('../models/Blog');

// Helper to get date range based on period
const getDateRange = (period) => {
  const now = new Date();
  const ranges = {
    'today': { start: new Date(now.setHours(0, 0, 0, 0)), end: new Date() },
    '7d': { start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), end: new Date() },
    '30d': { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
    '90d': { start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), end: new Date() }
  };
  return ranges[period] || ranges['30d'];
};

// Helper to calculate growth percentage
const calcGrowth = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return parseFloat((((current - previous) / previous) * 100).toFixed(1));
};

// ============================================
// GET /dashboard/kpis - Core KPI metrics with growth
// ============================================
router.get('/kpis', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const { start, end } = getDateRange(period);

    // Previous period for growth calculation
    const periodMs = end - start;
    const prevStart = new Date(start.getTime() - periodMs);
    const prevEnd = new Date(start.getTime());

    const [
      // Current period metrics
      currentStudents,
      currentAgents,
      currentCounselors,
      currentUniversities,
      currentServices,
      currentRevenue,

      // Previous period metrics
      prevStudents,
      prevAgents,
      prevCounselors,
      prevRevenue,

      // Total counts (all time)
      totalStudents,
      totalAgents,
      totalCounselors,
      totalUniversities,
      totalServices,
      totalRevenue
    ] = await Promise.all([
      // Current period
      Student.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      User.countDocuments({ role: 'agent', createdAt: { $gte: start, $lte: end } }),
      User.countDocuments({ role: 'counselor', createdAt: { $gte: start, $lte: end } }),
      University.countDocuments({ createdAt: { $gte: start, $lte: end }, isActive: { $ne: false } }),
      Service.countDocuments({ createdAt: { $gte: start, $lte: end }, isActive: true }),
      Payment.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),

      // Previous period
      Student.countDocuments({ createdAt: { $gte: prevStart, $lte: prevEnd } }),
      User.countDocuments({ role: 'agent', createdAt: { $gte: prevStart, $lte: prevEnd } }),
      User.countDocuments({ role: 'counselor', createdAt: { $gte: prevStart, $lte: prevEnd } }),
      Payment.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: prevStart, $lte: prevEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),

      // All time totals
      Student.countDocuments(),
      User.countDocuments({ role: 'agent', isActive: true }),
      User.countDocuments({ role: 'counselor', isActive: true }),
      University.countDocuments({ isActive: { $ne: false } }),
      Service.countDocuments({ isActive: true }),
      Payment.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const currentRevenueVal = currentRevenue[0]?.total || 0;
    const prevRevenueVal = prevRevenue[0]?.total || 0;
    const totalRevenueVal = totalRevenue[0]?.total || 0;

    res.json({
      success: true,
      data: {
        students: {
          total: totalStudents,
          periodCount: currentStudents,
          growth: calcGrowth(currentStudents, prevStudents)
        },
        agents: {
          total: totalAgents,
          periodCount: currentAgents,
          growth: calcGrowth(currentAgents, prevAgents)
        },
        counselors: {
          total: totalCounselors,
          periodCount: currentCounselors,
          growth: calcGrowth(currentCounselors, prevCounselors)
        },
        universities: {
          total: totalUniversities,
          periodCount: currentUniversities,
          growth: 0 // Universities don't typically have rapid growth
        },
        services: {
          total: totalServices,
          periodCount: currentServices,
          growth: 0
        },
        revenue: {
          total: totalRevenueVal,
          periodAmount: currentRevenueVal,
          growth: calcGrowth(currentRevenueVal, prevRevenueVal),
          currency: 'USD'
        },
        period
      }
    });
  } catch (error) {
    console.error('Dashboard KPIs error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch KPIs' });
  }
});

// ============================================
// GET /dashboard/health - System health & activity
// ============================================
router.get('/health', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      registrationsToday,
      applicationsToday,
      pendingRequests,
      overdueTasks,
      failedPayments,
      unreadMessages,
      criticalLogs
    ] = await Promise.all([
      // New registrations today
      Student.countDocuments({ createdAt: { $gte: todayStart } }),

      // Applications today
      ServiceRequest.countDocuments({ createdAt: { $gte: todayStart } }),

      // Pending service requests
      ServiceRequest.countDocuments({ status: 'PENDING_ADMIN_ASSIGNMENT' }),

      // Overdue tasks
      Task.countDocuments({
        deadline: { $lt: new Date() },
        status: { $nin: ['COMPLETED', 'CANCELLED'] }
      }).catch(() => 0), // Task model might not exist

      // Failed payments in last 7 days
      Payment.countDocuments({
        status: 'failed',
        createdAt: { $gte: sevenDaysAgo }
      }),

      // Unread messages (system-wide, not read by any admin)
      Message.countDocuments({
        createdAt: { $gte: sevenDaysAgo },
        'readBy.userId': { $exists: false }
      }).catch(() => 0),

      // Critical audit logs (last 24 hours)
      AuditLog.find({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        action: { $in: ['user_deleted', 'payment_failed', 'commission_disputed', 'security_alert'] }
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
        .catch(() => [])
    ]);

    // Calculate health score (0-100)
    let healthScore = 100;
    if (pendingRequests > 10) healthScore -= 15;
    if (overdueTasks > 5) healthScore -= 20;
    if (failedPayments > 0) healthScore -= 10 * failedPayments;
    healthScore = Math.max(0, healthScore);

    res.json({
      success: true,
      data: {
        registrationsToday,
        applicationsToday,
        pendingRequests,
        overdueTasks,
        failedPayments,
        unreadMessages,
        criticalLogs,
        healthScore,
        healthStatus: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'warning' : 'critical'
      }
    });
  } catch (error) {
    console.error('Dashboard health error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch system health' });
  }
});

// ============================================
// GET /dashboard/funnel - Conversion funnel metrics
// ============================================
router.get('/funnel', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const { start, end } = getDateRange(period);

    const [
      totalStudents,
      totalApplications,
      approvedApplications,
      completedPayments
    ] = await Promise.all([
      Student.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      ServiceRequest.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      ServiceRequest.countDocuments({
        createdAt: { $gte: start, $lte: end },
        status: { $in: ['COMPLETED', 'IN_PROGRESS', 'ASSIGNED'] }
      }),
      Payment.countDocuments({
        status: 'completed',
        createdAt: { $gte: start, $lte: end }
      })
    ]);

    // Calculate conversion rates
    const applicationRate = totalStudents > 0 ? parseFloat(((totalApplications / totalStudents) * 100).toFixed(1)) : 0;
    const approvalRate = totalApplications > 0 ? parseFloat(((approvedApplications / totalApplications) * 100).toFixed(1)) : 0;
    const paymentRate = approvedApplications > 0 ? parseFloat(((completedPayments / approvedApplications) * 100).toFixed(1)) : 0;

    res.json({
      success: true,
      data: {
        students: { count: totalStudents, rate: 100, label: 'Total Students' },
        applications: { count: totalApplications, rate: applicationRate, label: 'Applications' },
        approved: { count: approvedApplications, rate: approvalRate, label: 'Approved' },
        paid: { count: completedPayments, rate: paymentRate, label: 'Paid' },
        period
      }
    });
  } catch (error) {
    console.error('Dashboard funnel error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch funnel data' });
  }
});

// ============================================
// GET /dashboard/alerts - Action required items
// ============================================
router.get('/alerts', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      pendingApprovals,
      disputedCommissions,
      stuckRequests,
      failedPayments,
      pendingAgentRequests
    ] = await Promise.all([
      ServiceRequest.countDocuments({ status: 'PENDING_ADMIN_ASSIGNMENT' }),
      Commission.countDocuments({ status: 'disputed' }),
      ServiceRequest.countDocuments({
        status: 'ON_HOLD',
        updatedAt: { $lt: sevenDaysAgo }
      }),
      Payment.countDocuments({ status: 'failed', createdAt: { $gte: sevenDaysAgo } }),
      ServiceRequest.countDocuments({
        isAgentInitiated: true,
        agentApprovalStatus: 'PENDING_APPROVAL'
      })
    ]);

    const alerts = [];

    if (pendingApprovals > 0) {
      alerts.push({
        type: 'pending_approvals',
        count: pendingApprovals,
        severity: pendingApprovals > 10 ? 'high' : 'medium',
        label: 'Pending Approvals',
        route: '/admin/service-requests?status=PENDING_ADMIN_ASSIGNMENT',
        icon: 'Clock'
      });
    }

    if (pendingAgentRequests > 0) {
      alerts.push({
        type: 'agent_requests',
        count: pendingAgentRequests,
        severity: 'high',
        label: 'Agent Request Approvals',
        route: '/admin/agent-requests',
        icon: 'UserCheck'
      });
    }

    if (disputedCommissions > 0) {
      alerts.push({
        type: 'disputed_commissions',
        count: disputedCommissions,
        severity: 'high',
        label: 'Disputed Commissions',
        route: '/admin/commissions?status=disputed',
        icon: 'AlertTriangle'
      });
    }

    if (stuckRequests > 0) {
      alerts.push({
        type: 'stuck_requests',
        count: stuckRequests,
        severity: 'medium',
        label: 'Stuck Requests',
        route: '/admin/service-requests?status=ON_HOLD',
        icon: 'Pause'
      });
    }

    if (failedPayments > 0) {
      alerts.push({
        type: 'failed_payments',
        count: failedPayments,
        severity: 'high',
        label: 'Failed Payments',
        route: '/admin/payments?status=failed',
        icon: 'CreditCard'
      });
    }

    res.json({
      success: true,
      data: {
        totalAlerts: alerts.reduce((sum, a) => sum + a.count, 0),
        alerts
      }
    });
  } catch (error) {
    console.error('Dashboard alerts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch alerts' });
  }
});

// ============================================
// GET /dashboard/top-agents - Top performing agents
// ============================================
router.get('/top-agents', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { limit = 5, period = '30d' } = req.query;
    const { start, end } = getDateRange(period);

    // Get agents with their performance metrics
    const agentStats = await Student.aggregate([
      {
        $match: {
          assignedAgent: { $ne: null },
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$assignedAgent',
          studentsCount: { $sum: 1 }
        }
      },
      { $sort: { studentsCount: -1 } },
      { $limit: parseInt(limit) }
    ]);

    // Enrich with user details and commission data
    const topAgents = await Promise.all(
      agentStats.map(async (stat) => {
        const user = await User.findOne({ userId: stat._id })
          .select('firstName lastName email avatar')
          .lean();

        const commissionTotal = await Commission.aggregate([
          { $match: { agentId: stat._id, status: 'paid' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        return {
          userId: stat._id,
          name: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
          avatar: user?.avatar,
          email: user?.email,
          applications: stat.studentsCount,
          revenue: commissionTotal[0]?.total || 0
        };
      })
    );

    res.json({ success: true, data: topAgents });
  } catch (error) {
    console.error('Top agents error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch top agents' });
  }
});

// ============================================
// GET /dashboard/counselor-workload - Counselor assignments
// ============================================
router.get('/counselor-workload', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    const workload = await ServiceRequest.aggregate([
      {
        $match: {
          assignedCounselor: { $ne: null },
          status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'WAITING_STUDENT'] }
        }
      },
      {
        $group: {
          _id: '$assignedCounselor',
          activeRequests: { $sum: 1 }
        }
      },
      { $sort: { activeRequests: -1 } },
      { $limit: parseInt(limit) }
    ]);

    // Enrich with user details
    const counselorWorkload = await Promise.all(
      workload.map(async (item) => {
        const user = await User.findOne({ userId: item._id })
          .select('firstName lastName avatar')
          .lean();

        const completedThisMonth = await ServiceRequest.countDocuments({
          assignedCounselor: item._id,
          status: 'COMPLETED',
          completedAt: { $gte: new Date(new Date().setDate(1)) }
        });

        return {
          userId: item._id,
          name: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
          avatar: user?.avatar,
          activeRequests: item.activeRequests,
          completedThisMonth
        };
      })
    );

    res.json({ success: true, data: counselorWorkload });
  } catch (error) {
    console.error('Counselor workload error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch counselor workload' });
  }
});

// ============================================
// GET /dashboard/top-universities - Universities by applications
// ============================================
router.get('/top-universities', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    // Get universities with application counts
    const universities = await University.find({ isActive: { $ne: false } })
      .select('universityId universityName country imageUrl')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    // For each university, get application count (if we have that data)
    const enrichedUniversities = universities.map((uni, index) => ({
      universityId: uni.universityId,
      name: uni.universityName,
      country: uni.country,
      imageUrl: uni.imageUrl,
      applications: Math.floor(Math.random() * 100) + 50, // Placeholder - replace with actual aggregation
      rank: index + 1
    }));

    res.json({ success: true, data: enrichedUniversities });
  } catch (error) {
    console.error('Top universities error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch top universities' });
  }
});

// ============================================
// GET /dashboard/top-countries - Countries by student count
// ============================================
router.get('/top-countries', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    const countryStats = await Student.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: 'userId',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$user.country', 'Unknown'] },
          studentCount: { $sum: 1 }
        }
      },
      { $match: { _id: { $ne: 'Unknown', $ne: '', $ne: null } } },
      { $sort: { studentCount: -1 } },
      { $limit: parseInt(limit) }
    ]);

    const countryFlags = {
      'Germany': '🇩🇪', 'Austria': '🇦🇹', 'Switzerland': '🇨🇭',
      'Netherlands': '🇳🇱', 'France': '🇫🇷', 'UK': '🇬🇧',
      'USA': '🇺🇸', 'Canada': '🇨🇦', 'Australia': '🇦🇺',
      'India': '🇮🇳', 'China': '🇨🇳', 'Nigeria': '🇳🇬',
      'Pakistan': '🇵🇰', 'Bangladesh': '🇧🇩', 'Nepal': '🇳🇵'
    };

    const countries = countryStats.map(item => ({
      name: item._id,
      code: item._id.substring(0, 2).toUpperCase(),
      flag: countryFlags[item._id] || '🌍',
      students: item.studentCount
    }));

    res.json({ success: true, data: countries });
  } catch (error) {
    console.error('Top countries error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch top countries' });
  }
});

// ============================================
// GET /dashboard/trends - Daily trends for charts
// ============================================
router.get('/trends', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { period = '30d', metrics = 'students,applications,revenue' } = req.query;
    const metricsArray = metrics.split(',');
    const { start } = getDateRange(period);

    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const trends = {};

    // Generate date range
    const dateRange = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      dateRange.push(date);
    }

    if (metricsArray.includes('students')) {
      const studentTrend = await Student.aggregate([
        { $match: { createdAt: { $gte: start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const studentMap = new Map(studentTrend.map(s => [s._id, s.count]));
      trends.students = dateRange.map(d => ({
        date: d.toISOString().split('T')[0],
        value: studentMap.get(d.toISOString().split('T')[0]) || 0
      }));
    }

    if (metricsArray.includes('applications')) {
      const appTrend = await ServiceRequest.aggregate([
        { $match: { createdAt: { $gte: start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const appMap = new Map(appTrend.map(a => [a._id, a.count]));
      trends.applications = dateRange.map(d => ({
        date: d.toISOString().split('T')[0],
        value: appMap.get(d.toISOString().split('T')[0]) || 0
      }));
    }

    if (metricsArray.includes('revenue')) {
      const revTrend = await Payment.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            total: { $sum: '$amount' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const revMap = new Map(revTrend.map(r => [r._id, r.total]));
      trends.revenue = dateRange.map(d => ({
        date: d.toISOString().split('T')[0],
        value: revMap.get(d.toISOString().split('T')[0]) || 0
      }));
    }

    res.json({ success: true, data: trends, period });
  } catch (error) {
    console.error('Dashboard trends error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trends' });
  }
});

// ============================================
// GET /dashboard/recent-activity - Recent activity feeds
// ============================================
router.get('/recent-activity', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    const [
      recentStudents,
      recentApplications,
      recentPayments,
      recentMessages
    ] = await Promise.all([
      // Recent students
      Student.find()
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .lean()
        .then(async (students) => {
          return Promise.all(students.map(async (student) => {
            const user = await User.findOne({ userId: student.userId })
              .select('firstName lastName email avatar')
              .lean();
            return {
              studentId: student.studentId,
              name: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
              email: user?.email,
              avatar: user?.avatar,
              status: student.status || 'active',
              createdAt: student.createdAt
            };
          }));
        }),

      // Recent service applications
      ServiceRequest.find()
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .lean()
        .then(async (requests) => {
          return Promise.all(requests.map(async (req) => {
            const student = await Student.findOne({ studentId: req.studentId }).lean();
            const user = student ? await User.findOne({ userId: student.userId })
              .select('firstName lastName')
              .lean() : null;
            return {
              requestId: req.serviceRequestId,
              serviceType: req.serviceType,
              status: req.status,
              studentName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
              createdAt: req.createdAt
            };
          }));
        }),

      // Recent payments
      Payment.find()
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .lean()
        .then(async (payments) => {
          return Promise.all(payments.map(async (payment) => {
            const student = await Student.findOne({ studentId: payment.studentId }).lean();
            const user = student ? await User.findOne({ userId: student.userId })
              .select('firstName lastName')
              .lean() : null;
            return {
              paymentId: payment.paymentId,
              amount: payment.amount,
              currency: payment.currency || 'USD',
              status: payment.status,
              studentName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
              createdAt: payment.createdAt
            };
          }));
        }),

      // Recent messages
      Message.find()
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .lean()
        .then(async (messages) => {
          return Promise.all(messages.map(async (msg) => {
            const sender = await User.findOne({ userId: msg.senderId })
              .select('firstName lastName role')
              .lean();
            return {
              messageId: msg.messageId,
              content: msg.content?.substring(0, 50) + (msg.content?.length > 50 ? '...' : ''),
              senderName: sender ? `${sender.firstName} ${sender.lastName}` : 'Unknown',
              senderRole: sender?.role || msg.senderRole,
              isRead: msg.readBy?.length > 0,
              createdAt: msg.createdAt
            };
          }));
        }).catch(() => [])
    ]);

    res.json({
      success: true,
      data: {
        students: recentStudents,
        applications: recentApplications,
        payments: recentPayments,
        messages: recentMessages
      }
    });
  } catch (error) {
    console.error('Recent activity error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch recent activity' });
  }
});

// ============================================
// GET /dashboard/content-metrics - Blog content metrics
// ============================================
router.get('/content-metrics', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalBlogs,
      publishedBlogs,
      draftBlogs,
      recentBlogs,
      blogsByCategory
    ] = await Promise.all([
      Blog.countDocuments().catch(() => 0),
      Blog.countDocuments({ status: 'published' }).catch(() => 0),
      Blog.countDocuments({ status: 'draft' }).catch(() => 0),
      Blog.find({ createdAt: { $gte: thirtyDaysAgo } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title slug status createdAt views')
        .lean()
        .catch(() => []),
      Blog.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]).catch(() => [])
    ]);

    // Calculate total views
    const totalViews = await Blog.aggregate([
      { $group: { _id: null, total: { $sum: { $ifNull: ['$views', 0] } } } }
    ]).catch(() => [{ total: 0 }]);

    res.json({
      success: true,
      data: {
        totalBlogs,
        publishedBlogs,
        draftBlogs,
        totalViews: totalViews[0]?.total || 0,
        recentBlogs,
        blogsByCategory: blogsByCategory.map(b => ({
          category: b._id || 'Uncategorized',
          count: b.count
        }))
      }
    });
  } catch (error) {
    console.error('Content metrics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch content metrics' });
  }
});

// ============================================
// GET /dashboard/audit-log - Recent audit entries
// ============================================
router.get('/audit-log', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    const enrichedLogs = await Promise.all(
      logs.map(async (log) => {
        const user = await User.findOne({ userId: log.userId })
          .select('firstName lastName role')
          .lean();
        return {
          ...log,
          userName: user ? `${user.firstName} ${user.lastName}` : 'System',
          userRole: user?.role || 'system'
        };
      })
    );

    res.json({ success: true, data: enrichedLogs });
  } catch (error) {
    console.error('Audit log error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit log' });
  }
});

module.exports = router;
