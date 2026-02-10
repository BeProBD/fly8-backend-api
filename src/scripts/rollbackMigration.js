/**
 * Rollback Migration Script
 * Removes all migrated users and students from new database
 * USE WITH CAUTION - This deletes data!
 *
 * Usage:
 *   node scripts/rollbackMigration.js --execute
 */

const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Student = require('../models/Student');

async function rollback() {
  try {
    console.log('\n⚠️  ROLLBACK MIGRATION\n');

    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database\n');

    // Count before deletion
    const userCount = await User.countDocuments({ role: 'student' });
    const Student = mongoose.model('Student');
    const studentCount = await Student.countDocuments({});

    console.log(`📊 Current counts:`);
    console.log(`   Users (role=student): ${userCount}`);
    console.log(`   Students: ${studentCount}\n`);

    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('⚠️  Delete all migrated students? This cannot be undone! (yes/no): ', async (answer) => {
      readline.close();

      if (answer.toLowerCase() === 'yes') {
        console.log('\n🗑️  Deleting migrated data...');

        const userResult = await User.deleteMany({ role: 'student', migratedAt: { $exists: false } });
        console.log(`✅ Deleted ${userCount} users`);

        const Student = require('../models/Student');
        const studentResult = await Student.deleteMany({ migratedAt: { $exists: true } });
        console.log(`✅ Deleted ${studentCount} students`);

        console.log('\n✅ Rollback complete\n');
      } else {
        console.log('❌ Rollback cancelled');
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    } finally {
      await mongoose.connection.close();
    }
  }
}
