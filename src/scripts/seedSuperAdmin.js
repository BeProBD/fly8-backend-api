/**
 * Super Admin Seeding Script
 *
 * Creates the initial Super Admin account for system bootstrap.
 * Production-safe with environment-based credentials and idempotent execution.
 *
 * Usage:
 *   node scripts/seedSuperAdmin.js
 *
 * Environment Variables Required:
 *   SUPER_ADMIN_EMAIL - Super Admin email address
 *   SUPER_ADMIN_PASSWORD - Super Admin password (min 8 chars)
 *   SUPER_ADMIN_FIRST_NAME - First name (optional, defaults to "Super")
 *   SUPER_ADMIN_LAST_NAME - Last name (optional, defaults to "Admin")
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');

// Configuration with defaults
const SUPER_ADMIN_CONFIG = {
  email: process.env.SUPER_ADMIN_EMAIL || 'admin@fly8.global',
  password: process.env.SUPER_ADMIN_PASSWORD || 'Fly8Admin@2024',
  firstName: process.env.SUPER_ADMIN_FIRST_NAME || 'Super',
  lastName: process.env.SUPER_ADMIN_LAST_NAME || 'Admin'
};

/**
 * Validate configuration
 */
function validateConfig() {
  const errors = [];

  if (!SUPER_ADMIN_CONFIG.email || !SUPER_ADMIN_CONFIG.email.includes('@')) {
    errors.push('SUPER_ADMIN_EMAIL must be a valid email address');
  }

  if (!SUPER_ADMIN_CONFIG.password || SUPER_ADMIN_CONFIG.password.length < 8) {
    errors.push('SUPER_ADMIN_PASSWORD must be at least 8 characters');
  }

  if (errors.length > 0) {
    console.error('\n❌ Configuration Errors:');
    errors.forEach(err => console.error(`   - ${err}`));
    console.error('\nSet environment variables or update defaults in script.\n');
    return false;
  }

  return true;
}

/**
 * Seed Super Admin
 */
async function seedSuperAdmin() {
  console.log('\n' + '='.repeat(60));
  console.log('🔐 SUPER ADMIN SEEDING');
  console.log('='.repeat(60) + '\n');

  // Validate configuration
  if (!validateConfig()) {
    process.exit(1);
  }

  // Connect to MongoDB
  const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
  const DB_NAME = process.env.DB_NAME || 'fly8_dashboard';

  try {
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(`${MONGO_URL}/${DB_NAME}`);
    console.log('✅ Connected to MongoDB\n');

    // Check if Super Admin already exists
    const existingAdmin = await User.findOne({
      email: SUPER_ADMIN_CONFIG.email
    });

    if (existingAdmin) {
      console.log('ℹ️  Super Admin already exists:');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   UserId: ${existingAdmin.userId}`);
      console.log(`   Role: ${existingAdmin.role}`);
      console.log(`   Active: ${existingAdmin.isActive}`);
      console.log(`   Created: ${existingAdmin.createdAt}`);
      console.log('\n✅ Idempotent check passed - no changes needed.\n');
      return { exists: true, user: existingAdmin };
    }

    // Check if any super_admin exists
    const anySuperAdmin = await User.findOne({ role: 'super_admin' });
    if (anySuperAdmin) {
      console.log('⚠️  A different Super Admin already exists:');
      console.log(`   Email: ${anySuperAdmin.email}`);
      console.log(`   UserId: ${anySuperAdmin.userId}`);
      console.log('\n   Creating additional Super Admin...\n');
    }

    // Create Super Admin
    const userId = uuidv4();
    const superAdmin = new User({
      userId,
      email: SUPER_ADMIN_CONFIG.email,
      password: SUPER_ADMIN_CONFIG.password,
      firstName: SUPER_ADMIN_CONFIG.firstName,
      lastName: SUPER_ADMIN_CONFIG.lastName,
      role: 'super_admin',
      phone: '',
      country: '',
      avatar: `https://api.dicebear.com/5.x/initials/svg?seed=${SUPER_ADMIN_CONFIG.firstName} ${SUPER_ADMIN_CONFIG.lastName}`,
      isActive: true
    });

    await superAdmin.save();

    console.log('✅ Super Admin created successfully!\n');
    console.log('   Account Details:');
    console.log('   ─────────────────────────────────────');
    console.log(`   Email:     ${SUPER_ADMIN_CONFIG.email}`);
    console.log(`   Password:  ${'*'.repeat(SUPER_ADMIN_CONFIG.password.length)}`);
    console.log(`   UserId:    ${userId}`);
    console.log(`   Role:      super_admin`);
    console.log('   ─────────────────────────────────────\n');

    console.log('⚠️  SECURITY REMINDER:');
    console.log('   - Change the default password immediately in production');
    console.log('   - Use strong, unique passwords');
    console.log('   - Store credentials securely\n');

    return { created: true, user: superAdmin };

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('📡 Database connection closed.\n');
  }
}

/**
 * Bootstrap function for server startup integration
 * Can be called from server_express.js
 */
async function ensureSuperAdminExists() {
  try {
    const existingAdmin = await User.findOne({ role: 'super_admin' });

    if (!existingAdmin) {
      console.log('⚠️  No Super Admin found. Creating default...');

      const userId = uuidv4();
      const superAdmin = new User({
        userId,
        email: SUPER_ADMIN_CONFIG.email,
        password: SUPER_ADMIN_CONFIG.password,
        firstName: SUPER_ADMIN_CONFIG.firstName,
        lastName: SUPER_ADMIN_CONFIG.lastName,
        role: 'super_admin',
        avatar: `https://api.dicebear.com/5.x/initials/svg?seed=${SUPER_ADMIN_CONFIG.firstName} ${SUPER_ADMIN_CONFIG.lastName}`,
        isActive: true
      });

      await superAdmin.save();
      console.log(`✅ Default Super Admin created: ${SUPER_ADMIN_CONFIG.email}`);
      return superAdmin;
    }

    return existingAdmin;
  } catch (error) {
    console.error('❌ Failed to ensure Super Admin exists:', error.message);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedSuperAdmin()
    .then(() => {
      console.log('='.repeat(60) + '\n');
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { seedSuperAdmin, ensureSuperAdminExists, SUPER_ADMIN_CONFIG };
