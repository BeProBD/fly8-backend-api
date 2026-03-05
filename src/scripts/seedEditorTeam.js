/**
 * Seed Editor Team Accounts
 * Creates editor accounts for the Fly8 content team.
 *
 * Usage:
 *   node src/scripts/seedEditorTeam.js
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME   = process.env.DB_NAME   || 'fly8_production';

// Password rule: firstName + "TeamEditor@fly8"
const EDITORS = [
  { email: 'deba5080@gmail.com',               firstName: 'Deba'      },
  { email: 'pronotiroy4@gmail.com',             firstName: 'Pronoti'   },
  { email: 'rahmanbushra59@gmail.com',          firstName: 'Bushra'    },
  { email: 'fairuz.fly8@gmail.com',             firstName: 'Fairuz'    },
  { email: 'rituparnadebnath1@gmail.com',       firstName: 'Rituparna' },
  { email: 'amit.fullstack.webdev@gmail.com',   firstName: 'Amit'      },
];

function makePassword(firstName) {
  return `${firstName}TeamEditor@fly8`;
}

async function seedEditorTeam() {
  try {
    await mongoose.connect(`${MONGO_URL}/${DB_NAME}`);
    console.log('✅ Connected to MongoDB\n');

    const results = [];

    for (const editor of EDITORS) {
      const password = makePassword(editor.firstName);
      const existing = await User.findOne({ email: editor.email });

      if (existing) {
        // Always update role AND reset password so credentials are consistent
        existing.role     = 'editor';
        existing.password = password; // pre-save hook will bcrypt this
        existing.isActive = true;
        await existing.save();
        results.push({ email: editor.email, password, status: 'UPDATED' });
      } else {
        const user = new User({
          userId:    uuidv4(),
          email:     editor.email,
          password,
          firstName: editor.firstName,
          lastName:  'Editor',
          role:      'editor',
          isActive:  true,
          avatar:    `https://api.dicebear.com/5.x/initials/svg?seed=${editor.firstName}`,
        });
        await user.save();
        results.push({ email: editor.email, password, status: 'CREATED' });
      }
    }

    // Print summary table
    console.log('┌─────────────────────────────────────────────────────────────────────────────────┐');
    console.log('│                        EDITOR ACCOUNTS — CREDENTIALS                           │');
    console.log('├────────────────────────────────────────┬──────────────────────────┬────────────┤');
    console.log('│ Email                                  │ Password                 │ Status     │');
    console.log('├────────────────────────────────────────┼──────────────────────────┼────────────┤');
    for (const r of results) {
      const email = r.email.padEnd(38);
      const pass  = r.password.padEnd(24);
      const stat  = r.status.padEnd(10);
      console.log(`│ ${email} │ ${pass} │ ${stat} │`);
    }
    console.log('└────────────────────────────────────────┴──────────────────────────┴────────────┘');
    console.log('\n🔗 Login URL: http://localhost:5173/editor/login\n');

  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

seedEditorTeam();
