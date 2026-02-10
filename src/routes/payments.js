const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const Payment = require('../models/Payment');
const ServiceApplication = require('../models/ServiceApplication');
const Commission = require('../models/Commission');
const Student = require('../models/Student');
const { logAudit } = require('../utils/auditLogger');

// Create payment for service
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { serviceId, amount } = req.body;
    
    const student = await Student.findOne({ userId: req.user.userId });
    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const application = await ServiceApplication.findOne({
      studentId: student.studentId,
      serviceId
    });

    if (!application) {
      return res.status(404).json({ error: 'Service application not found' });
    }

    const payment = new Payment({
      paymentId: uuidv4(),
      studentId: student.studentId,
      serviceId,
      applicationId: application.applicationId,
      amount,
      status: 'pending'
    });

    await payment.save();

    await logAudit(
      req.user.userId,
      'payment_initiated',
      'payment',
      payment.paymentId,
      { amount, serviceId },
      req
    );

    res.status(201).json({ 
      message: 'Payment created', 
      payment 
    });
  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// Get student payments
router.get('/my-payments', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user.userId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const payments = await Payment.find({ studentId: student.studentId })
      .sort({ createdAt: -1 });

    res.json({ payments });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Complete payment (for testing - in production use Stripe webhooks)
router.post('/:paymentId/complete', authMiddleware, async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    const payment = await Payment.findOne({ paymentId });
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    payment.status = 'completed';
    payment.paidAt = new Date();
    await payment.save();

    // Auto-create commission for agent if assigned
    const application = await ServiceApplication.findOne({ 
      applicationId: payment.applicationId 
    });
    
    if (application && application.assignedAgent) {
      const student = await Student.findOne({ studentId: payment.studentId });
      const commissionPercentage = student.commissionPercentage || 10;
      const commissionAmount = (payment.amount * commissionPercentage) / 100;

      const commission = new Commission({
        commissionId: uuidv4(),
        agentId: application.assignedAgent,
        studentId: payment.studentId,
        serviceId: payment.serviceId,
        amount: commissionAmount,
        percentage: commissionPercentage,
        status: 'pending'
      });

      await commission.save();
    }

    await logAudit(
      req.user.userId,
      'payment_completed',
      'payment',
      payment.paymentId,
      { amount: payment.amount },
      req
    );

    res.json({ message: 'Payment completed', payment });
  } catch (error) {
    console.error('Payment completion error:', error);
    res.status(500).json({ error: 'Failed to complete payment' });
  }
});

// Admin: Get all payments
router.get('/all', authMiddleware, roleMiddleware('super_admin'), async (req, res) => {
  try {
    const payments = await Payment.find().sort({ createdAt: -1 });
    
    const totalRevenue = payments
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0);

    res.json({ 
      payments,
      summary: {
        totalPayments: payments.length,
        totalRevenue,
        pendingPayments: payments.filter(p => p.status === 'pending').length
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

module.exports = router;