/**
 * Dashboard Accounts Seeding Script
 *
 * Creates accounts for Super Admin, Counselor, and Agent dashboards.
 * Idempotent execution - safe to run multiple times.
 *
 * Usage:
 *   node scripts/seedDashboardAccounts.js
 *
 * Default Credentials:
 *   Super Admin: admin@fly8.global / Fly8Admin@2024
 *   Counselor:   counselor@fly8.global / Fly8Counselor@2024
 *   Agent:       agent@fly8.global / Fly8Agent@2024
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');

// Account configurations
const ACCOUNTS = [
  {
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@fly8.global',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Fly8Admin@2024',
    firstName: process.env.SUPER_ADMIN_FIRST_NAME || 'Super',
    lastName: process.env.SUPER_ADMIN_LAST_NAME || 'Admin',
    role: 'super_admin',
    dashboardUrl: '/admin'
  },
  {
    email: process.env.COUNSELOR_EMAIL || 'counselor@fly8.global',
    password: process.env.COUNSELOR_PASSWORD || 'Fly8Counselor@2024',
    firstName: process.env.COUNSELOR_FIRST_NAME || 'Demo',
    lastName: process.env.COUNSELOR_LAST_NAME || 'Counselor',
    role: 'counselor',
    dashboardUrl: '/counselor'
  },
  {
    email: process.env.AGENT_EMAIL || 'agent@fly8.global',
    password: process.env.AGENT_PASSWORD || 'Fly8Agent@2024',
    firstName: process.env.AGENT_FIRST_NAME || 'Demo',
    lastName: process.env.AGENT_LAST_NAME || 'Agent',
    role: 'agent',
    dashboardUrl: '/agent'
  }
];

/**
 * Create or update an account
 */
async function ensureAccount(config) {
  const existingUser = await User.findOne({ email: config.email });

  if (existingUser) {
    console.log(`  ✓ ${config.role.toUpperCase()} already exists: ${config.email}`);
    return { exists: true, user: existingUser };
  }

  const userId = uuidv4();
  const user = new User({
    userId,
    email: config.email,
    password: config.password,
    firstName: config.firstName,
    lastName: config.lastName,
    role: config.role,
    phone: '',
    country: '',
    avatar: `https://api.dicebear.com/5.x/initials/svg?seed=${config.firstName} ${config.lastName}`,
    isActive: true
  });

  await user.save();
  console.log(`  ✓ ${config.role.toUpperCase()} created: ${config.email}`);
  return { created: true, user };
}

/**
 * Main seeding function
 */
async function seedDashboardAccounts() {
  console.log('\n' + '='.repeat(70));
  console.log('  DASHBOARD ACCOUNTS SEEDING');
  console.log('='.repeat(70) + '\n');

  // Connect to MongoDB
  const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
  const DB_NAME = process.env.DB_NAME || 'fly8_dashboard';

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(`${MONGO_URL}/${DB_NAME}`);
    console.log('Connected to MongoDB\n');

    console.log('Creating/verifying accounts...\n');

    for (const config of ACCOUNTS) {
      await ensureAccount(config);
    }

    // Print credentials summary
    console.log('\n' + '='.repeat(70));
    console.log('  LOGIN CREDENTIALS');
    console.log('='.repeat(70) + '\n');

    console.log('  SUPER ADMIN DASHBOARD (/admin)');
    console.log('  ─────────────────────────────────────────────────────');
    console.log(`  Email:    ${ACCOUNTS[0].email}`);
    console.log(`  Password: ${ACCOUNTS[0].password}`);
    console.log();

    console.log('  COUNSELOR DASHBOARD (/counselor)');
    console.log('  ─────────────────────────────────────────────────────');
    console.log(`  Email:    ${ACCOUNTS[1].email}`);
    console.log(`  Password: ${ACCOUNTS[1].password}`);
    console.log();

    console.log('  AGENT DASHBOARD (/agent)');
    console.log('  ─────────────────────────────────────────────────────');
    console.log(`  Email:    ${ACCOUNTS[2].email}`);
    console.log(`  Password: ${ACCOUNTS[2].password}`);
    console.log();

    console.log('='.repeat(70));
    console.log('  SECURITY REMINDER: Change these passwords in production!');
    console.log('='.repeat(70) + '\n');

    return ACCOUNTS;

  } catch (error) {
    console.error('Seeding failed:', error.message);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.\n');
  }
}

// Run if called directly
if (require.main === module) {
  seedDashboardAccounts()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { seedDashboardAccounts, ACCOUNTS };
