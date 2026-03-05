/**
 * Editor Account Seeding Script
 *
 * Creates an editor account for the marketing CMS.
 *
 * Usage:
 *   node src/scripts/seedEditor.js
 *
 * Or with custom credentials:
 *   EDITOR_EMAIL=me@fly8.global EDITOR_PASSWORD=Secret123 node src/scripts/seedEditor.js
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME   = process.env.DB_NAME   || 'fly8_production';

const CONFIG = {
  email:     process.env.EDITOR_EMAIL      || 'editor@fly8.global',
  password:  process.env.EDITOR_PASSWORD   || 'Editor@fly8_2024',
  firstName: process.env.EDITOR_FIRSTNAME  || 'Content',
  lastName:  process.env.EDITOR_LASTNAME   || 'Editor',
};

async function seedEditor() {
  try {
    await mongoose.connect(`${MONGO_URL}/${DB_NAME}`);
    console.log('✅ Connected to MongoDB');

    const existing = await User.findOne({ email: CONFIG.email });

    if (existing) {
      if (existing.role !== 'editor') {
        existing.role = 'editor';
        await existing.save();
        console.log(`✏️  Updated existing user "${CONFIG.email}" role → editor`);
      } else {
        console.log(`ℹ️  Editor "${CONFIG.email}" already exists. Nothing to do.`);
      }
      return;
    }

    const user = new User({
      userId:    uuidv4(),
      email:     CONFIG.email,
      password:  CONFIG.password,
      firstName: CONFIG.firstName,
      lastName:  CONFIG.lastName,
      role:      'editor',
      isActive:  true,
    });

    await user.save();
    console.log('');
    console.log('🎉 Editor account created successfully!');
    console.log('──────────────────────────────────────');
    console.log(`   Email    : ${CONFIG.email}`);
    console.log(`   Password : ${CONFIG.password}`);
    console.log(`   Role     : editor`);
    console.log('──────────────────────────────────────');
    console.log('   Login at : http://localhost:5173/editor/login');
    console.log('');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

seedEditor();
