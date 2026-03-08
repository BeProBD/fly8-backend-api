/**
 * Data Reset Script
 *
 * Deletes ALL University and Program documents from the database so you can
 * start fresh with the new University → Programs relational structure.
 *
 * ⚠️  THIS IS IRREVERSIBLE.  Run only when you are sure you want a clean slate.
 *
 * Usage:
 *   node src/scripts/resetUniversitiesAndPrograms.js
 *
 * The script will ask for a confirmation prompt before deleting anything.
 * Pass --confirm to skip the prompt (e.g. in CI):
 *   node src/scripts/resetUniversitiesAndPrograms.js --confirm
 */

'use strict';

const path      = require('path');
const readline  = require('readline');
const mongoose  = require('mongoose');
const dotenv    = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const University = require('../models/University');
const Program    = require('../models/Program');

const MONGO_URL = process.env.MONGO_URL || process.env.DASHBOARD_MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME   = process.env.DB_NAME   || 'fly8_production';

async function confirm() {
  if (process.argv.includes('--confirm')) return true;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(
      `\n⚠️  This will permanently delete ALL universities and programs in "${DB_NAME}".\nType "yes" to proceed: `,
      answer => { rl.close(); resolve(answer.trim().toLowerCase() === 'yes'); }
    );
  });
}

async function reset() {
  const ok = await confirm();
  if (!ok) {
    console.log('Aborted — no data was deleted.');
    process.exit(0);
  }

  await mongoose.connect(`${MONGO_URL}/${DB_NAME}`);
  console.log(`\n✅ Connected to ${DB_NAME}`);

  const { deletedCount: programs  } = await Program.deleteMany({});
  const { deletedCount: universities } = await University.deleteMany({});

  console.log(`🗑  Deleted ${programs}    program(s)`);
  console.log(`🗑  Deleted ${universities} university/universities`);
  console.log(`\n✅ Database is now clean. You can start adding universities and programs fresh.\n`);

  await mongoose.disconnect();
}

reset().catch(err => {
  console.error('❌ Reset failed:', err);
  process.exit(1);
});
