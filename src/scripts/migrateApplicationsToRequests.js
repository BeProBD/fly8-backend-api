/**
 * Migration Script: Convert ServiceApplications to ServiceRequests
 *
 * This script creates ServiceRequest entries for existing ServiceApplications
 * that were created before the integration was added.
 *
 * Usage:
 *   node scripts/migrateApplicationsToRequests.js --dry-run    # Preview changes
 *   node scripts/migrateApplicationsToRequests.js --execute    # Apply changes
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const ServiceApplication = require('../models/ServiceApplication');
const ServiceRequest = require('../models/ServiceRequest');
const Student = require('../models/Student');

// Mapping from ExploreServices service IDs to ServiceRequest service types
const SERVICE_ID_TO_TYPE = {
  'service-1': 'PROFILE_ASSESSMENT',
  'service-2': 'APPLICATION_ASSISTANCE',
  'service-3': 'UNIVERSITY_SHORTLISTING',
  'service-4': 'VISA_GUIDANCE',
  'service-5': 'PRE_DEPARTURE_ORIENTATION',
  'service-6': 'ACCOMMODATION_HELP',
  'service-7': 'LOAN_ASSISTANCE',
  'service-8': 'SCHOLARSHIP_SEARCH'
};

// Map ServiceApplication status to ServiceRequest status
const STATUS_MAP = {
  'not_started': 'PENDING_ADMIN_ASSIGNMENT',
  'in_progress': 'IN_PROGRESS',
  'completed': 'COMPLETED',
  'on_hold': 'ON_HOLD'
};

async function migrate(dryRun = true) {
  console.log(`\n${dryRun ? '=== DRY RUN ===' : '=== EXECUTING MIGRATION ==='}\n`);

  try {
    // Connect to MongoDB
    await mongoose.connect(`${process.env.MONGO_URL}/${process.env.DB_NAME}`);
    console.log('Connected to MongoDB\n');

    // Get all existing ServiceApplications
    const applications = await ServiceApplication.find({}).lean();
    console.log(`Found ${applications.length} ServiceApplications to process\n`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const app of applications) {
      const serviceType = SERVICE_ID_TO_TYPE[app.serviceId];

      if (!serviceType) {
        console.log(`  SKIP: Unknown serviceId '${app.serviceId}' for application ${app.applicationId}`);
        skipped++;
        continue;
      }

      // Check if ServiceRequest already exists
      const existingRequest = await ServiceRequest.findOne({
        studentId: app.studentId,
        serviceType
      });

      if (existingRequest) {
        console.log(`  SKIP: ServiceRequest already exists for student ${app.studentId}, service ${serviceType}`);
        skipped++;
        continue;
      }

      // Get student to find userId
      const student = await Student.findOne({ studentId: app.studentId });
      if (!student) {
        console.log(`  ERROR: Student not found for studentId ${app.studentId}`);
        errors++;
        continue;
      }

      // Map status
      const status = STATUS_MAP[app.status] || 'PENDING_ADMIN_ASSIGNMENT';

      const serviceRequestData = {
        serviceRequestId: uuidv4(),
        studentId: app.studentId,
        serviceType,
        status,
        assignedCounselor: app.assignedCounselor || null,
        assignedAgent: app.assignedAgent || null,
        notes: app.notes || [],
        documents: app.documents || [],
        metadata: {
          applicationId: app.applicationId,
          serviceId: app.serviceId,
          migratedAt: new Date()
        },
        appliedAt: app.appliedAt || app.createdAt,
        completedAt: app.completedAt || null,
        statusHistory: [{
          status,
          changedBy: student.userId,
          changedAt: app.appliedAt || app.createdAt,
          note: 'Migrated from ServiceApplication'
        }]
      };

      console.log(`  CREATE: ServiceRequest for student ${app.studentId}, service ${serviceType}, status ${status}`);

      if (!dryRun) {
        const serviceRequest = new ServiceRequest(serviceRequestData);
        await serviceRequest.save();
      }

      created++;
    }

    console.log('\n=== SUMMARY ===');
    console.log(`  Created: ${created}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors:  ${errors}`);
    console.log(`  Total:   ${applications.length}`);

    if (dryRun) {
      console.log('\nThis was a dry run. Run with --execute to apply changes.');
    } else {
      console.log('\nMigration completed successfully!');
    }

  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = !args.includes('--execute');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Migration Script: Convert ServiceApplications to ServiceRequests

Usage:
  node scripts/migrateApplicationsToRequests.js --dry-run    Preview changes (default)
  node scripts/migrateApplicationsToRequests.js --execute    Apply changes
  node scripts/migrateApplicationsToRequests.js --help       Show this help
`);
  process.exit(0);
}

migrate(dryRun);
