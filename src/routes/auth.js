const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');
const { authMiddleware, JWT_SECRET, getDashboardUrl } = require('../middlewares/auth');

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fly8-refresh-secret-change-in-production';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',                         // '/' = sent to ALL routes on the backend domain
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

// clearCookie must NOT include maxAge (Express v4 deprecation + doesn't clear correctly)
const REFRESH_COOKIE_CLEAR_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
};
const { validate, authSchemas } = require('../middlewares/validation');
const { logAudit } = require('../utils/auditLogger');

// Signup
router.post('/signup', validate(authSchemas.register), async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, phone, country } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const userId = uuidv4();
    const userRole = role || 'student';

    const user = new User({
      userId,
      email,
      password,
      firstName,
      lastName,
      role: userRole,
      phone: phone || '',
      country: country || '',
      avatar: `https://api.dicebear.com/5.x/initials/svg?seed=${firstName} ${lastName}`
    });

    await user.save();

    // If student, create Student record
    if (userRole === 'student') {
      const studentId = uuidv4();
      const student = new Student({
        studentId,
        userId,
        interestedCountries: [],
        interestedServices: [],
        selectedServices: [],
        onboardingCompleted: false,
        status: 'active'
      });
      await student.save();
    }

    const token = jwt.sign({ userId: user.userId, role: user.role }, JWT_SECRET, {
      expiresIn: '15m'
    });

    const refreshToken = jwt.sign({ userId: user.userId }, JWT_REFRESH_SECRET, {
      expiresIn: '7d'
    });

    const dashboardUrl = getDashboardUrl(user.role);

    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

    res.status(201).json({
      message: 'User created successfully',
      token,
      dashboardUrl,
      user: {
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Login
router.post('/login', validate(authSchemas.login), async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    await user.save();

    // Audit log
    await logAudit(user.userId, 'user_login', 'user', user.userId, { email }, req);

    const token = jwt.sign({ userId: user.userId, role: user.role }, JWT_SECRET, {
      expiresIn: '15m'
    });

    const refreshToken = jwt.sign({ userId: user.userId }, JWT_REFRESH_SECRET, {
      expiresIn: '7d'
    });

    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

    const dashboardUrl = getDashboardUrl(user.role);

    // Get student data if user is a student
    let studentData = null;
    if (user.role === 'student') {
      const student = await Student.findOne({ userId: user.userId });
      if (student) {
        studentData = {
          studentId: student.studentId,
          onboardingCompleted: student.onboardingCompleted,
          interestedServices: student.interestedServices || [],
          selectedServices: student.selectedServices,
          interactionMode: student.interactionMode || 'student-counselor'
        };
      }
    }

    res.json({
      message: 'Login successful',
      token,
      dashboardUrl,
      user: {
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatar: user.avatar,
        phone: user.phone,
        country: user.country
      },
      student: studentData
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const dashboardUrl = getDashboardUrl(req.user.role);

    // Get student data if user is a student
    let studentData = null;
    if (req.user.role === 'student' && req.student) {
      studentData = {
        studentId: req.student.studentId,
        onboardingCompleted: req.student.onboardingCompleted,
        interestedServices: req.student.interestedServices || [],
        selectedServices: req.student.selectedServices,
        status: req.student.status,
        interactionMode: req.student.interactionMode || 'student-counselor'
      };
    }

    res.json({
      user: {
        userId: req.user.userId,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        role: req.user.role,
        phone: req.user.phone,
        country: req.user.country,
        avatar: req.user.avatar
      },
      dashboardUrl,
      student: studentData
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Refresh access token using HTTP-only refresh token cookie
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

    // Confirm user still exists and is active
    const user = await User.findOne({ userId: decoded.userId }).select('userId role isActive');
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    const newAccessToken = jwt.sign(
      { userId: user.userId, role: user.role },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.json({ token: newAccessToken });
  } catch {
    // Clear the invalid cookie so the browser doesn't retry it forever
    res.clearCookie('refreshToken', REFRESH_COOKIE_CLEAR_OPTIONS);
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// Logout — clears the refresh token cookie
router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken', REFRESH_COOKIE_CLEAR_OPTIONS);
  return res.json({ message: 'Logged out successfully' });
});

module.exports = router;
