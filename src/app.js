/**
 * Fly8 Unified Backend API
 *
 * Consolidated backend serving both:
 * - Marketing Website (fly8.com) - Public endpoints
 * - Dashboard Application (app.fly8.com) - Protected endpoints
 *
 * @version 2.0.0
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const fileUpload = require('express-fileupload');
const { cloudinaryConnect } = require('./config/cloudinary');
const { ensureSuperAdminExists } = require('./scripts/seedSuperAdmin');

const IS_VERCEL = process.env.VERCEL === '1';

// Load environment variables (skip on Vercel - env vars are injected via dashboard)
if (!IS_VERCEL) {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
}

const app = express();
const PORT = process.env.PORT || 8001;

// Only create HTTP server and Socket.io in non-serverless environments
// Vercel is stateless — WebSockets/Socket.io cannot work there
let server;
if (!IS_VERCEL) {
  const { initSocket } = require('./socket/socketManager');
  server = http.createServer(app);
  initSocket(server);
}

// Initialize Cloudinary
cloudinaryConnect();

// =============================================================================
// CORS CONFIGURATION - Cross-subdomain support for fly8.com
// =============================================================================
const allowedOrigins = [
  // Production domains
  'https://fly8.com',
  'https://www.fly8.com',
  'https://app.fly8.com',
  'https://api.fly8.com',
  'https://dashboards.fly8.global',
  'https://fly8.global',
  'https://www.fly8.global',
  // Vercel deployments
  'https://fly8-client.vercel.app',
  'https://fly8-dashboard-client.vercel.app',
  'https://fly8-marketing.vercel.app',
  // Development
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  // Custom origins from environment
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Cookie',
    'X-Requested-With',
  ],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400, // 24 hours preflight cache
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// =============================================================================
// RATE LIMITING
// =============================================================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window for auth routes
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute for general API
  message: {
    success: false,
    error: 'Too many requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // Higher limit for public/marketing endpoints
  message: {
    success: false,
    error: 'Too many requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// =============================================================================
// MIDDLEWARE
// =============================================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// File upload middleware - conditional for blog routes (they use multer)
app.use((req, res, next) => {
  // Skip for blog routes that use multer
  if (
    req.path.startsWith('/api/v1/public/blogs') ||
    req.path.startsWith('/api/v1/admin/blogs')
  ) {
    return next();
  }

  fileUpload({
    useTempFiles: !IS_VERCEL,
    tempFileDir: IS_VERCEL ? undefined : '/tmp/',
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    abortOnLimit: true,
    createParentPath: true,
    parseNested: true,
  })(req, res, next);
});

// Apply rate limiting
app.use('/api/v1/auth', authLimiter);
app.use('/api/v1/public', publicLimiter);
app.use('/api', apiLimiter);

// =============================================================================
// DATABASE CONNECTION (SINGLE UNIFIED DATABASE)
// =============================================================================
const MONGO_URL =
  process.env.MONGO_URL ||
  process.env.DASHBOARD_MONGODB_URI ||
  'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'fly8_production';

mongoose
  .connect(`${MONGO_URL}/${DB_NAME}`)
  .then(async () => {
    console.log('✅ MongoDB Connected Successfully');
    console.log(`   Database: ${DB_NAME}`);

    // Bootstrap Super Admin on startup
    try {
      await ensureSuperAdminExists();
    } catch (error) {
      console.error('⚠️  Super Admin bootstrap warning:', error.message);
    }
  })
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// =============================================================================
// IMPORT ROUTES (from src/ structure)
// =============================================================================

// Dashboard Routes (Protected - Auth Required)
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const serviceRoutes = require('./routes/services');
const serviceRequestRoutes = require('./routes/serviceRequests');
const taskRoutes = require('./routes/tasks');
const counselorRoutes = require('./routes/counselors');
const agentRoutes = require('./routes/agents');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');
const paymentRoutes = require('./routes/payments');
const auditRoutes = require('./routes/audit');
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');
const reportsRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const universitiesRoutes = require('./routes/universities');
const dashboardRoutes = require('./routes/dashboard');
const admissionsRoutes = require('./routes/admissions');

// Marketing Routes (Public - No Auth Required)
const publicUniversityRoutes = require('./routes/public/universities');
const publicProgramRoutes = require('./routes/public/programs');
const publicCountryRoutes = require('./routes/public/countries');
const publicBlogRoutes = require('./routes/public/blogs');
const publicEventRoutes = require('./routes/public/events');
const publicContactRoutes = require('./routes/public/contact');

// Admin Content Management Routes
const adminUniversityRoutes = require('./routes/admin/universities');
const adminProgramRoutes = require('./routes/admin/programs');
const adminCountryRoutes = require('./routes/admin/countries');
const adminBlogRoutes = require('./routes/admin/blogs');
const adminEventRoutes = require('./routes/admin/events');

// =============================================================================
// ROOT ROUTE
// =============================================================================
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Fly8 Unified API Server',
    version: '2.0.0',
    status: 'active',
    endpoints: {
      public: '/api/v1/public/*',
      auth: '/api/v1/auth/*',
      dashboard: '/api/v1/*',
      admin: '/api/v1/admin/*',
    },
    documentation: 'https://docs.fly8.com/api',
  });
});

// =============================================================================
// PUBLIC API ROUTES (Marketing Website - No Authentication)
// =============================================================================
app.use('/api/v1/public/universities', publicUniversityRoutes);
app.use('/api/v1/public/programs', publicProgramRoutes);
app.use('/api/v1/public/countries', publicCountryRoutes);
app.use('/api/v1/public/blogs', publicBlogRoutes);
app.use('/api/v1/public/events', publicEventRoutes);
app.use('/api/v1/public/contact', publicContactRoutes);

// =============================================================================
// AUTHENTICATION ROUTES
// =============================================================================
app.use('/api/v1/auth', authRoutes);

// =============================================================================
// PROTECTED API ROUTES (Dashboard - Authentication Required)
// =============================================================================
app.use('/api/v1/students', studentRoutes);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/service-requests', serviceRequestRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/counselors', counselorRoutes);
app.use('/api/v1/agents', agentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/admissions', admissionsRoutes);
app.use('/api/v1/universities', universitiesRoutes);

// =============================================================================
// ADMIN ROUTES (Super Admin Only)
// =============================================================================
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin/universities', adminUniversityRoutes);
app.use('/api/v1/admin/programs', adminProgramRoutes);
app.use('/api/v1/admin/countries', adminCountryRoutes);
app.use('/api/v1/admin/blogs', adminBlogRoutes);
app.use('/api/v1/admin/events', adminEventRoutes);
app.use('/api/v1/admin/reports', reportsRoutes);
app.use('/api/v1/admin/settings', settingsRoutes);
app.use('/api/v1/admin/dashboard', dashboardRoutes);

// =============================================================================
// LEGACY ROUTE SUPPORT (Backward Compatibility for Marketing Frontend)
// =============================================================================
app.use('/api/v1/country', publicCountryRoutes);
app.use('/api/v1/blog', publicBlogRoutes);
app.use('/api/v1/german-course', publicEventRoutes);
app.use('/api/v1/gstu', publicEventRoutes);
app.use('/api/v1/reach', publicContactRoutes);

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================
app.get('/health', async (req, res) => {
  const dbStatus =
    mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

  res.json({
    success: true,
    status: dbStatus === 'connected' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      heapTotal:
        Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
    },
    environment: process.env.NODE_ENV || 'development',
    database: dbStatus,
    version: '2.0.0',
  });
});

app.get('/ready', async (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;

  if (dbConnected) {
    res.json({ ready: true });
  } else {
    res.status(503).json({ ready: false, reason: 'Database not connected' });
  }
});

app.get('/live', (req, res) => {
  res.json({ live: true });
});

// =============================================================================
// ERROR HANDLERS
// =============================================================================

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Handle CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: 'CORS policy violation',
    });
  }

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: err.message,
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expired',
      code: 'TOKEN_EXPIRED',
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      error: 'Duplicate entry',
      details: err.message,
    });
  }

  // Generic error response
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================
if (require.main === module && server) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Fly8 Unified API Server running on port ${PORT}`);
    console.log(`📡 API Base URL: http://localhost:${PORT}/api/v1`);
    console.log(`🌐 Public Endpoints: /api/v1/public/*`);
    console.log(`🔒 Protected Endpoints: /api/v1/*`);
    console.log(`👑 Admin Endpoints: /api/v1/admin/*`);
    console.log(`🔌 Socket.io enabled for real-time notifications`);
    console.log(`📁 File uploads enabled (Cloudinary)`);
    console.log(`🔒 Rate limiting active\n`);
  });
}

// Export for Vercel serverless
module.exports = app;
