/**
 * Fly8 Student Migration Script
 *
 * Migrates ~1,824 students from old database to new User + Student architecture
 * Preserves bcrypt password hashes without re-hashing
 *
 * Usage:
 *   DRY RUN:  node scripts/migrateStudents.js --dry-run
 *   EXECUTE:  node scripts/migrateStudents.js --execute
 *   VALIDATE: node scripts/migrateStudents.js --validate
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Database URLs
const OLD_MONGO_URL = 'mongodb+srv://Shopno:Shopno24@cluster1.npnsgne.mongodb.net/Fly8?retryWrites=true&w=majority&appName=Cluster1';
const NEW_MONGO_URL = process.env.MONGO_URL;

// Connection instances
let oldConnection;
let newConnection;

// Import new models (will use newConnection)
const User = require('../models/User');
const Student = require('../models/Student');

// Define old schemas (read-only)
const oldStudentSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  password: String,
  phone: String,
  country: String,
  referral: String,
  active: Boolean,
  approved: Boolean,
  additionalDetails: mongoose.Schema.Types.ObjectId,
  token: String,
  resetPasswordExpires: Number,
  image: String,
  createdAt: Date,
  updatedAt: Date
}, { collection: 'students' });

const oldProfileSchema = new mongoose.Schema({
  student: mongoose.Schema.Types.ObjectId,
  age: Number,
  currentEducationLevel: String,
  fieldOfStudy: String,
  gpa: String,
  graduationYear: Number,
  institution: String,
  ielts: String,
  toefl: String,
  gre: String,
  preferredCountries: [String],
  preferredDegreeLevel: String,
  budget: String,
  careerGoals: String,
  industry: String,
  workLocation: String,
  transcripts: String,
  testScores: String,
  sop: String,
  recommendation: String,
  resume: String,
  passport: String,
  createdAt: Date,
  updatedAt: Date
}, { collection: 'profiles' });

// Migration statistics
const stats = {
  totalStudents: 0,
  studentsWithProfiles: 0,
  studentsWithoutProfiles: 0,
  usersCreated: 0,
  studentsCreated: 0,
  errors: [],
  skipped: [],
  processed: []
};

/**
 * Connect to both databases
 */
async function connectDatabases() {
  try {
    console.log('📡 Connecting to OLD database...');
    oldConnection = await mongoose.createConnection(OLD_MONGO_URL).asPromise();
    console.log('✅ Connected to OLD database');

    console.log('📡 Connecting to NEW database...');
    newConnection = await mongoose.createConnection(NEW_MONGO_URL).asPromise();
    console.log('✅ Connected to NEW database');

    return { oldConnection, newConnection };
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    throw error;
  }
}

/**
 * Load old data
 */
async function loadOldData() {
  try {
    const OldStudent = oldConnection.model('student', oldStudentSchema);
    const OldProfile = oldConnection.model('Profile', oldProfileSchema);

    console.log('\n📊 Loading data from OLD database...');
    const students = await OldStudent.find({}).lean();
    const profiles = await OldProfile.find({}).lean();

    // Create profile lookup map
    const profileMap = new Map();
    profiles.forEach(profile => {
      if (profile._id) {
        profileMap.set(profile._id.toString(), profile);
      }
    });

    stats.totalStudents = students.length;
    console.log(`✅ Loaded ${students.length} students`);
    console.log(`✅ Loaded ${profiles.length} profiles`);

    return { students, profileMap };
  } catch (error) {
    console.error('❌ Error loading old data:', error.message);
    throw error;
  }
}

/**
 * Migrate a single student
 */
async function migrateStudent(oldStudent, profileMap, dryRun = true) {
  try {
    // Check if already migrated (by email)
    const NewUser = newConnection.model('User', User.schema);
    const existingUser = await NewUser.findOne({ email: oldStudent.email });

    if (existingUser) {
      stats.skipped.push({
        email: oldStudent.email,
        reason: 'Already migrated'
      });
      return { skipped: true };
    }

    // Generate new IDs
    const userId = uuidv4();
    const studentId = uuidv4();

    // Get profile data if exists
    const profile = profileMap.get(oldStudent.additionalDetails?.toString());
    const hasProfile = !!profile;

    if (hasProfile) {
      stats.studentsWithProfiles++;
    } else {
      stats.studentsWithoutProfiles++;
    }

    // Prepare User data
    const userData = {
      userId,
      email: oldStudent.email,
      password: oldStudent.password, // Will be preserved with _skipPasswordHash
      firstName: oldStudent.firstName,
      lastName: oldStudent.lastName,
      role: 'student',
      phone: oldStudent.phone || '',
      country: oldStudent.country || '',
      avatar: oldStudent.image || `https://api.dicebear.com/5.x/initials/svg?seed=${oldStudent.firstName} ${oldStudent.lastName}`,
      isActive: oldStudent.active !== false, // Default to true if undefined
      createdAt: oldStudent.createdAt || new Date(),
      lastLogin: null
    };

    // Prepare Student data with embedded profile
    const studentData = {
      studentId,
      userId,
      interestedCountries: profile?.preferredCountries || [],
      selectedServices: [],
      onboardingCompleted: !!hasProfile,
      assignedCounselor: null,
      assignedAgent: null,
      commissionPercentage: 0,
      intake: null,
      preferredDestination: profile?.preferredCountries?.[0] || null,
      status: oldStudent.active ? 'active' : 'inactive',

      // Academic Profile from old Profile collection
      age: profile?.age || null,
      currentEducationLevel: profile?.currentEducationLevel || null,
      fieldOfStudy: profile?.fieldOfStudy || null,
      gpa: profile?.gpa || null,
      graduationYear: profile?.graduationYear || null,
      institution: profile?.institution || null,

      // Test Scores
      ielts: profile?.ielts || null,
      toefl: profile?.toefl || null,
      gre: profile?.gre || null,

      // Preferences
      preferredCountries: profile?.preferredCountries || [],
      preferredDegreeLevel: profile?.preferredDegreeLevel || null,
      budget: profile?.budget || null,

      // Career Information
      careerGoals: profile?.careerGoals || null,
      industry: profile?.industry || null,
      workLocation: profile?.workLocation || null,

      // Documents
      documents: {
        transcripts: profile?.transcripts || null,
        testScores: profile?.testScores || null,
        sop: profile?.sop || null,
        recommendation: profile?.recommendation || null,
        resume: profile?.resume || null,
        passport: profile?.passport || null
      },

      // Migration Tracking
      oldStudentId: oldStudent._id.toString(),
      oldProfileId: oldStudent.additionalDetails?.toString() || null,
      migratedAt: new Date(),

      createdAt: oldStudent.createdAt || new Date(),
      updatedAt: oldStudent.updatedAt || new Date()
    };

    // DRY RUN: Just log what would be created
    if (dryRun) {
      stats.processed.push({
        email: oldStudent.email,
        hasProfile,
        userId,
        studentId
      });
      return { success: true, dryRun: true };
    }

    // EXECUTE: Create records in new database
    const newUser = new NewUser(userData);
    newUser._skipPasswordHash = true; // Preserve existing bcrypt hash
    await newUser.save();
    stats.usersCreated++;

    const NewStudent = newConnection.model('Student', Student.schema);
    const newStudent = new NewStudent(studentData);
    await newStudent.save();
    stats.studentsCreated++;

    stats.processed.push({
      email: oldStudent.email,
      hasProfile,
      userId,
      studentId,
      migrated: true
    });

    return { success: true, userId, studentId };

  } catch (error) {
    stats.errors.push({
      email: oldStudent.email,
      error: error.message
    });
    return { error: error.message };
  }
}

/**
 * Execute migration
 */
async function executeMigration(dryRun = true) {
  try {
    console.log('\n' + '='.repeat(60));
    console.log(`🚀 ${dryRun ? 'DRY RUN' : 'EXECUTING'} MIGRATION`);
    console.log('='.repeat(60) + '\n');

    await connectDatabases();
    const { students, profileMap } = await loadOldData();

    console.log(`\n📦 Processing ${students.length} students...`);
    console.log(dryRun ? '⚠️  DRY RUN MODE - No data will be written\n' : '✍️  EXECUTE MODE - Writing to database\n');

    // Process students in batches
    const batchSize = 50;
    for (let i = 0; i < students.length; i += batchSize) {
      const batch = students.slice(i, i + batchSize);

      await Promise.all(
        batch.map(student => migrateStudent(student, profileMap, dryRun))
      );

      const progress = Math.min(i + batchSize, students.length);
      console.log(`⏳ Progress: ${progress}/${students.length} (${Math.round(progress / students.length * 100)}%)`);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Students:           ${stats.totalStudents}`);
    console.log(`Students with Profiles:   ${stats.studentsWithProfiles}`);
    console.log(`Students without Profiles: ${stats.studentsWithoutProfiles}`);
    console.log(`Successfully Processed:   ${stats.processed.length}`);
    console.log(`Skipped (Already Exists): ${stats.skipped.length}`);
    console.log(`Errors:                   ${stats.errors.length}`);

    if (!dryRun) {
      console.log(`\n✅ Users Created:         ${stats.usersCreated}`);
      console.log(`✅ Students Created:      ${stats.studentsCreated}`);
    }

    if (stats.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      stats.errors.slice(0, 10).forEach(err => {
        console.log(`  - ${err.email}: ${err.error}`);
      });
      if (stats.errors.length > 10) {
        console.log(`  ... and ${stats.errors.length - 10} more errors`);
      }
    }

    if (stats.skipped.length > 0 && dryRun) {
      console.log(`\n⏭️  ${stats.skipped.length} students already migrated (will be skipped)`);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    return stats;

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    if (oldConnection) await oldConnection.close();
    if (newConnection) await newConnection.close();
  }
}

/**
 * Validate migration
 */
async function validateMigration() {
  try {
    console.log('\n🔍 VALIDATING MIGRATION...\n');

    await connectDatabases();

    const NewUser = newConnection.model('User', User.schema);
    const NewStudent = newConnection.model('Student', Student.schema);

    const userCount = await NewUser.countDocuments({ role: 'student' });
    const studentCount = await NewStudent.countDocuments({});

    console.log(`✅ Users (role=student):  ${userCount}`);
    console.log(`✅ Students:              ${studentCount}`);

    if (userCount === studentCount) {
      console.log('\n✅ VALIDATION PASSED: User and Student counts match\n');
    } else {
      console.log('\n⚠️  WARNING: User and Student counts do NOT match\n');
    }

    // Test password comparison with sample user
    const sampleUser = await NewUser.findOne({ role: 'student' });
    if (sampleUser) {
      console.log(`\n🔐 Testing password preservation for: ${sampleUser.email}`);
      console.log(`   Password hash format: ${sampleUser.password.substring(0, 20)}...`);
      console.log(`   Expected format: $2b$10$...`);

      if (sampleUser.password.startsWith('$2b$10$')) {
        console.log('   ✅ Password hash format is correct (bcrypt)\n');
      } else {
        console.log('   ❌ WARNING: Password hash format unexpected\n');
      }
    }

    return { userCount, studentCount };

  } catch (error) {
    console.error('❌ Validation error:', error.message);
    throw error;
  } finally {
    if (oldConnection) await oldConnection.close();
    if (newConnection) await newConnection.close();
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  try {
    if (mode === '--dry-run') {
      await executeMigration(true);
    } else if (mode === '--execute') {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      readline.question('⚠️  This will write data to the NEW database. Continue? (yes/no): ', async (answer) => {
        readline.close();

        if (answer.toLowerCase() === 'yes') {
          await executeMigration(false);
        } else {
          console.log('❌ Migration cancelled');
        }
      });
    } else if (mode === '--validate') {
      await validateMigration();
    } else {
      console.log('\n📖 USAGE:');
      console.log('  DRY RUN:   node scripts/migrateStudents.js --dry-run');
      console.log('  EXECUTE:   node scripts/migrateStudents.js --execute');
      console.log('  VALIDATE:  node scripts/migrateStudents.js --validate\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { executeMigration, validateMigration };
