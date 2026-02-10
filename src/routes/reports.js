/**
 * Reports API Routes
 * Comprehensive reporting endpoints for Super Admin dashboard
 * All endpoints require super_admin role
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const Student = require('../models/Student');
const User = require('../models/User');
const ServiceRequest = require('../models/ServiceRequest');
const ServiceApplication = require('../models/ServiceApplication');
const Commission = require('../models/Commission');
const University = require('../models/University');

// ============================================
// GET /overview - Dashboard KPIs and summary
// ============================================
router.get('/overview', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    const hasDateFilter = startDate || endDate;

    const [
      totalStudents,
      totalAgents,
      totalCounselors,
      totalUniversities,
      applicationStats,
      commissionStats,
      recentTrend
    ] = await Promise.all([
      // Total students
      Student.countDocuments(hasDateFilter ? { createdAt: dateFilter } : {}),

      // Total agents
      User.countDocuments({ role: 'agent', ...(hasDateFilter ? { createdAt: dateFilter } : {}) }),

      // Total counselors
      User.countDocuments({ role: 'counselor', ...(hasDateFilter ? { createdAt: dateFilter } : {}) }),

      // Total universities (active)
      University.countDocuments({ isActive: { $ne: false } }),

      // Applications by status
      ServiceRequest.aggregate([
        ...(hasDateFilter ? [{ $match: { createdAt: dateFilter } }] : []),
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),

      // Commission totals by status
      Commission.aggregate([
        ...(hasDateFilter ? [{ $match: { createdAt: dateFilter } }] : []),
        {
          $group: {
            _id: '$status',
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]),

      // 30-day comparison for trend calculation
      ServiceRequest.aggregate([
        {
          $facet: {
            current: [
              { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
              { $count: 'count' }
            ],
            previous: [
              {
                $match: {
                  createdAt: {
                    $gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
                    $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                  }
                }
              },
              { $count: 'count' }
            ]
          }
        }
      ])
    ]);

    // Calculate trend percentage
    const currentCount = recentTrend[0]?.current[0]?.count || 0;
    const previousCount = recentTrend[0]?.previous[0]?.count || 0;
    const trendPercentage = previousCount > 0
      ? Math.round(((currentCount - previousCount) / previousCount) * 100)
      : currentCount > 0 ? 100 : 0;

    res.json({
      success: true,
      data: {
        totals: {
          students: totalStudents,
          agents: totalAgents,
          counselors: totalCounselors,
          universities: totalUniversities
        },
        applications: applicationStats,
        commissions: commissionStats,
        trend: {
          current: currentCount,
          previous: previousCount,
          percentage: trendPercentage
        }
      }
    });
  } catch (error) {
    console.error('Reports overview error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reports overview' });
  }
});

// ============================================
// GET /applications - Applications with filters
// ============================================
router.get('/applications', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      country,
      agentId,
      status,
      page = 1,
      limit = 20
    } = req.query;

    const matchStage = {};

    // Date filter
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    if (status && status !== 'all') matchStage.status = status;
    if (agentId && agentId !== 'all') matchStage.assignedAgent = agentId;

    // Build aggregation pipeline
    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'students',
          localField: 'studentId',
          foreignField: 'studentId',
          as: 'student'
        }
      },
      { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } }
    ];

    // Country filter (through student)
    if (country && country !== 'all') {
      pipeline.push({
        $match: { 'student.country': country }
      });
    }

    // Status breakdown aggregation
    const statusAggregation = await ServiceRequest.aggregate([
      ...pipeline,
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get total count for pagination
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await ServiceRequest.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Paginated results with user details
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const applications = await ServiceRequest.aggregate([
      ...pipeline,
      {
        $lookup: {
          from: 'users',
          localField: 'student.userId',
          foreignField: 'userId',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          serviceRequestId: 1,
          serviceType: 1,
          status: 1,
          createdAt: 1,
          completedAt: 1,
          assignedCounselor: 1,
          assignedAgent: 1,
          'student.studentId': 1,
          'student.country': 1,
          'user.firstName': 1,
          'user.lastName': 1,
          'user.email': 1
        }
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]);

    res.json({
      success: true,
      data: {
        statusBreakdown: statusAggregation,
        applications,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Applications report error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch applications report' });
  }
});

// ============================================
// GET /applications/by-country - Country breakdown
// ============================================
router.get('/applications/by-country', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }
    if (status && status !== 'all') matchStage.status = status;

    const countryStats = await ServiceRequest.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'students',
          localField: 'studentId',
          foreignField: 'studentId',
          as: 'student'
        }
      },
      { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$student.country', 'Unknown'] },
          totalApplications: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'PENDING_ADMIN_ASSIGNMENT'] }, 1, 0] }
          },
          assigned: {
            $sum: { $cond: [{ $eq: ['$status', 'ASSIGNED'] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] }
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
          },
          onHold: {
            $sum: { $cond: [{ $eq: ['$status', 'ON_HOLD'] }, 1, 0] }
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] }
          }
        }
      },
      { $sort: { totalApplications: -1 } },
      { $limit: 25 }
    ]);

    res.json({
      success: true,
      data: countryStats.map(item => ({
        country: item._id,
        totalApplications: item.totalApplications,
        pending: item.pending,
        assigned: item.assigned,
        inProgress: item.inProgress,
        completed: item.completed,
        onHold: item.onHold,
        cancelled: item.cancelled
      }))
    });
  } catch (error) {
    console.error('Country report error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch country report' });
  }
});

// ============================================
// GET /applications/by-university - University breakdown
// ============================================
router.get('/applications/by-university', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { startDate, endDate, country } = req.query;

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    // Try ServiceApplication first (has university data)
    let universityStats = await ServiceApplication.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'universities',
          localField: 'universityId',
          foreignField: 'universityId',
          as: 'university'
        }
      },
      { $unwind: { path: '$university', preserveNullAndEmptyArrays: true } },
      ...(country && country !== 'all' ? [{ $match: { 'university.country': country } }] : []),
      {
        $group: {
          _id: '$universityId',
          universityName: { $first: { $ifNull: ['$university.name', 'Unknown University'] } },
          universityCountry: { $first: '$university.country' },
          totalApplications: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
          },
          notStarted: {
            $sum: { $cond: [{ $eq: ['$status', 'not_started'] }, 1, 0] }
          }
        }
      },
      { $match: { _id: { $ne: null } } },
      { $sort: { totalApplications: -1 } },
      { $limit: 20 }
    ]);

    // If no ServiceApplication data, get university list with counts from metadata
    if (universityStats.length === 0) {
      const universities = await University.find({ isActive: { $ne: false } })
        .select('universityId name country')
        .limit(20)
        .lean();

      universityStats = universities.map(uni => ({
        _id: uni.universityId,
        universityName: uni.name,
        universityCountry: uni.country,
        totalApplications: 0,
        completed: 0,
        inProgress: 0,
        notStarted: 0
      }));
    }

    res.json({
      success: true,
      data: universityStats
    });
  } catch (error) {
    console.error('University report error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch university report' });
  }
});

// ============================================
// GET /commissions - Revenue/Commission reports
// ============================================
router.get('/commissions', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { startDate, endDate, agentId, status, page = 1, limit = 20 } = req.query;

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }
    if (agentId && agentId !== 'all') matchStage.agentId = agentId;
    if (status && status !== 'all') matchStage.status = status;

    // Summary statistics
    const summary = await Commission.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          totalCommissions: { $sum: 1 },
          pendingAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] }
          },
          approvedAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] }
          },
          paidAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] }
          },
          avgCommission: { $avg: '$amount' }
        }
      }
    ]);

    // By status breakdown
    const byStatus = await Commission.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Monthly revenue trend (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const monthlyTrend = await Commission.aggregate([
      {
        $match: {
          ...matchStage,
          createdAt: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Paginated commission list
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const commissions = await Commission.find(matchStage)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Commission.countDocuments(matchStage);

    // Enrich with agent details
    const enrichedCommissions = await Promise.all(
      commissions.map(async (commission) => {
        const agent = await User.findOne({ userId: commission.agentId })
          .select('firstName lastName email')
          .lean();
        const student = await Student.findOne({ studentId: commission.studentId })
          .select('studentId')
          .lean();
        const studentUser = student
          ? await User.findOne({ userId: student.userId }).select('firstName lastName').lean()
          : null;
        return {
          ...commission,
          agent,
          studentName: studentUser ? `${studentUser.firstName} ${studentUser.lastName}` : 'Unknown'
        };
      })
    );

    res.json({
      success: true,
      data: {
        summary: summary[0] || {
          totalRevenue: 0,
          totalCommissions: 0,
          pendingAmount: 0,
          approvedAmount: 0,
          paidAmount: 0,
          avgCommission: 0
        },
        byStatus,
        monthlyTrend: monthlyTrend.map(item => ({
          month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
          total: item.total,
          count: item.count
        })),
        commissions: enrichedCommissions,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Commission report error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch commission report' });
  }
});

// ============================================
// GET /agents/performance - Agent metrics
// ============================================
router.get('/agents/performance', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { startDate, endDate, sortBy = 'totalEarnings', order = 'desc' } = req.query;

    // Get all active agents
    const agents = await User.find({ role: 'agent', isActive: true })
      .select('-password')
      .lean();

    const performanceData = await Promise.all(
      agents.map(async (agent) => {
        const dateFilter = {};
        if (startDate || endDate) {
          dateFilter.createdAt = {};
          if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
          if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }
        const hasDateFilter = Object.keys(dateFilter).length > 0;

        // Students referred by this agent
        const studentsReferred = await Student.countDocuments({
          referredBy: agent.userId,
          ...(hasDateFilter ? dateFilter : {})
        });

        // Students assigned to this agent
        const studentsAssigned = await Student.countDocuments({
          assignedAgent: agent.userId
        });

        // Total applications through this agent
        const applications = await ServiceRequest.countDocuments({
          assignedAgent: agent.userId,
          ...(hasDateFilter ? dateFilter : {})
        });

        // Completed applications
        const completedApplications = await ServiceRequest.countDocuments({
          assignedAgent: agent.userId,
          status: 'COMPLETED',
          ...(hasDateFilter ? { completedAt: dateFilter.createdAt } : {})
        });

        // In progress applications
        const inProgressApplications = await ServiceRequest.countDocuments({
          assignedAgent: agent.userId,
          status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }
        });

        // Commission stats
        const commissionStats = await Commission.aggregate([
          {
            $match: {
              agentId: agent.userId,
              ...(hasDateFilter ? dateFilter : {})
            }
          },
          {
            $group: {
              _id: '$status',
              total: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          }
        ]);

        let totalEarnings = 0;
        let pendingEarnings = 0;
        let paidCommissions = 0;

        commissionStats.forEach(stat => {
          if (stat._id === 'paid') {
            totalEarnings = stat.total;
            paidCommissions = stat.count;
          }
          if (stat._id === 'pending' || stat._id === 'approved') {
            pendingEarnings += stat.total;
          }
        });

        // Conversion rate (completed / referred)
        const conversionRate = studentsReferred > 0
          ? parseFloat(((completedApplications / studentsReferred) * 100).toFixed(1))
          : 0;

        return {
          agentId: agent.userId,
          name: `${agent.firstName} ${agent.lastName}`,
          email: agent.email,
          phone: agent.phone,
          commissionRate: agent.commissionPercentage || 10,
          studentsReferred,
          studentsAssigned,
          totalApplications: applications,
          completedApplications,
          inProgressApplications,
          conversionRate,
          totalEarnings,
          pendingEarnings,
          paidCommissions,
          joinedAt: agent.createdAt
        };
      })
    );

    // Sort results
    const sortMultiplier = order === 'desc' ? -1 : 1;
    performanceData.sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      return (aVal - bVal) * sortMultiplier;
    });

    // Calculate summary statistics
    const summary = {
      totalAgents: performanceData.length,
      activeAgents: performanceData.filter(a => a.totalApplications > 0).length,
      totalStudentsReferred: performanceData.reduce((sum, a) => sum + a.studentsReferred, 0),
      totalApplications: performanceData.reduce((sum, a) => sum + a.totalApplications, 0),
      totalCompletedApplications: performanceData.reduce((sum, a) => sum + a.completedApplications, 0),
      totalEarnings: performanceData.reduce((sum, a) => sum + a.totalEarnings, 0),
      totalPendingEarnings: performanceData.reduce((sum, a) => sum + a.pendingEarnings, 0),
      avgConversionRate: performanceData.length > 0
        ? parseFloat((performanceData.reduce((sum, a) => sum + a.conversionRate, 0) / performanceData.length).toFixed(1))
        : 0,
      topPerformer: performanceData[0]?.name || 'N/A'
    };

    res.json({
      success: true,
      data: {
        summary,
        agents: performanceData
      }
    });
  } catch (error) {
    console.error('Agent performance error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch agent performance' });
  }
});

// ============================================
// GET /trends/monthly - Monthly trends for year
// ============================================
router.get('/trends/monthly', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);

    // Students registered per month
    const studentTrend = await Student.aggregate([
      { $match: { createdAt: { $gte: yearStart, $lte: yearEnd } } },
      {
        $group: {
          _id: { month: { $month: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.month': 1 } }
    ]);

    // Applications per month
    const applicationTrend = await ServiceRequest.aggregate([
      { $match: { createdAt: { $gte: yearStart, $lte: yearEnd } } },
      {
        $group: {
          _id: { month: { $month: '$createdAt' } },
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'PENDING_ADMIN_ASSIGNMENT'] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.month': 1 } }
    ]);

    // Revenue per month (paid commissions)
    const revenueTrend = await Commission.aggregate([
      {
        $match: {
          createdAt: { $gte: yearStart, $lte: yearEnd },
          status: 'paid'
        }
      },
      {
        $group: {
          _id: { month: { $month: '$createdAt' } },
          revenue: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.month': 1 } }
    ]);

    // Format data for charts (ensure all 12 months present)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const chartData = months.map((month, index) => {
      const monthNum = index + 1;
      const studentData = studentTrend.find(s => s._id.month === monthNum);
      const appData = applicationTrend.find(a => a._id.month === monthNum);
      const revData = revenueTrend.find(r => r._id.month === monthNum);

      return {
        month,
        monthNum,
        students: studentData?.count || 0,
        applications: appData?.total || 0,
        completedApplications: appData?.completed || 0,
        pendingApplications: appData?.pending || 0,
        revenue: revData?.revenue || 0,
        commissionsCount: revData?.count || 0
      };
    });

    // Calculate totals
    const totals = {
      students: chartData.reduce((sum, m) => sum + m.students, 0),
      applications: chartData.reduce((sum, m) => sum + m.applications, 0),
      completedApplications: chartData.reduce((sum, m) => sum + m.completedApplications, 0),
      revenue: chartData.reduce((sum, m) => sum + m.revenue, 0)
    };

    res.json({
      success: true,
      data: {
        year: parseInt(year),
        chartData,
        totals
      }
    });
  } catch (error) {
    console.error('Monthly trends error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch monthly trends' });
  }
});

// ============================================
// GET /trends/yearly - Yearly comparison
// ============================================
router.get('/trends/yearly', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const yearsToShow = 5;

    const yearlyStats = await Promise.all(
      Array.from({ length: yearsToShow }, (_, i) => currentYear - i).map(async (year) => {
        const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
        const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);

        const [students, applications, completedApps, revenue, agents] = await Promise.all([
          Student.countDocuments({ createdAt: { $gte: yearStart, $lte: yearEnd } }),
          ServiceRequest.countDocuments({ createdAt: { $gte: yearStart, $lte: yearEnd } }),
          ServiceRequest.countDocuments({
            createdAt: { $gte: yearStart, $lte: yearEnd },
            status: 'COMPLETED'
          }),
          Commission.aggregate([
            { $match: { createdAt: { $gte: yearStart, $lte: yearEnd }, status: 'paid' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          User.countDocuments({
            role: 'agent',
            createdAt: { $gte: yearStart, $lte: yearEnd }
          })
        ]);

        return {
          year,
          students,
          applications,
          completedApplications: completedApps,
          revenue: revenue[0]?.total || 0,
          newAgents: agents
        };
      })
    );

    // Calculate year-over-year growth
    const withGrowth = yearlyStats.reverse().map((stat, index, arr) => {
      if (index === 0) {
        return { ...stat, growth: { students: 0, applications: 0, revenue: 0 } };
      }
      const prev = arr[index - 1];
      return {
        ...stat,
        growth: {
          students: prev.students > 0 ? Math.round(((stat.students - prev.students) / prev.students) * 100) : 0,
          applications: prev.applications > 0 ? Math.round(((stat.applications - prev.applications) / prev.applications) * 100) : 0,
          revenue: prev.revenue > 0 ? Math.round(((stat.revenue - prev.revenue) / prev.revenue) * 100) : 0
        }
      };
    });

    res.json({
      success: true,
      data: withGrowth
    });
  } catch (error) {
    console.error('Yearly trends error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch yearly trends' });
  }
});

// ============================================
// GET /countries - List of countries with students
// ============================================
router.get('/countries', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const countries = await Student.aggregate([
      { $match: { country: { $ne: null, $ne: '' } } },
      {
        $group: {
          _id: '$country',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: countries.map(c => ({ country: c._id, studentCount: c.count }))
    });
  } catch (error) {
    console.error('Countries list error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch countries' });
  }
});

module.exports = router;
