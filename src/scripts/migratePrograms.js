/**
 * Migration Script: Link Programs to University documents
 *
 * This script sets `universityId` on every existing Program that can be
 * matched to a University document by universityName (case-insensitive).
 *
 * Run once after deploying the new Program model:
 *   node src/scripts/migratePrograms.js
 *
 * Safe to re-run — already-linked programs (universityId already set) are
 * skipped automatically.
 */

'use strict';

const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const University = require('../models/University');
const Program = require('../models/Program');

const MONGO_URL = process.env.MONGO_URL || process.env.DASHBOARD_MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'fly8_production';

async function migrate() {
  await mongoose.connect(`${MONGO_URL}/${DB_NAME}`);
  console.log(`✅ Connected to ${DB_NAME}`);

  // Load all universities once; build a lowercase-name → doc map
  const universities = await University.find({}).select('_id universityName universitycode country');
  const uniMap = new Map();
  for (const u of universities) {
    uniMap.set(u.universityName.toLowerCase().trim(), u);
  }

  console.log(`📚 Found ${universities.length} universities`);

  // Only process programs that have no universityId yet
  const programs = await Program.find({ universityId: { $exists: false } });
  console.log(`📋 Found ${programs.length} unlinked programs to process`);

  let linked = 0;
  let unmatched = 0;

  for (const program of programs) {
    const key = (program.universityName || '').toLowerCase().trim();
    const university = uniMap.get(key);

    if (university) {
      program.universityId = university._id;
      // Keep stored string fields in sync
      program.universityName = university.universityName;
      program.universityCode = university.universitycode;
      await program.save();
      linked++;
    } else {
      console.warn(`  ⚠️  No match for: "${program.universityName}" (program _id: ${program._id})`);
      unmatched++;
    }
  }

  console.log(`\n✅ Migration complete`);
  console.log(`   Linked    : ${linked}`);
  console.log(`   Unmatched : ${unmatched} (these programs keep their string fields — no data lost)`);

  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
