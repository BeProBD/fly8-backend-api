/**
 * Marketing to Dashboard Database Migration Script
 *
 * This script migrates all data from the marketing MongoDB database
 * into the unified dashboard/production MongoDB database.
 *
 * Collections migrated:
 * - universities
 * - programs
 * - countries
 * - blogs
 * - germancourseregistrations
 * - gsturegistrations (registrations)
 *
 * Usage:
 *   MARKETING_MONGO_URL="mongodb+srv://..." MONGO_URL="mongodb+srv://..." node scripts/migrateMarketingData.js
 *
 * Options:
 *   --dry-run    Preview migration without making changes
 *   --force      Skip confirmation prompts
 */

const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config();

// Configuration
const MARKETING_DB_URL = process.env.MARKETING_MONGO_URL;
const PRODUCTION_DB_URL = process.env.MONGO_URL;
const PRODUCTION_DB_NAME = process.env.DB_NAME || 'fly8_production';

// Collections to migrate
const COLLECTIONS_TO_MIGRATE = [
  {
    name: 'universities',
    uniqueField: 'universitycode',
    mergeStrategy: 'upsert', // Update existing, insert new
  },
  {
    name: 'programs',
    uniqueField: null,
    mergeStrategy: 'insert', // Insert all (check for exact duplicates)
  },
  {
    name: 'countries',
    uniqueField: 'code',
    mergeStrategy: 'upsert',
  },
  {
    name: 'blogs',
    uniqueField: null,
    mergeStrategy: 'insert',
  },
  {
    name: 'germancourseregistrations',
    uniqueField: 'registrationNumber',
    mergeStrategy: 'skip', // Skip if exists
  },
  {
    name: 'registrations', // GSTU registrations - source collection name
    targetName: 'gsturegistrations',
    uniqueField: 'registrationNumber',
    mergeStrategy: 'skip',
  },
];

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function prompt(question) {
  if (FORCE) return true;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function migrate() {
  console.log('\n');
  log('═══════════════════════════════════════════════════════════════════', 'cyan');
  log('  FLY8 DATA MIGRATION: Marketing → Production Database', 'cyan');
  log('═══════════════════════════════════════════════════════════════════', 'cyan');

  if (DRY_RUN) {
    log('\n  🔍 DRY RUN MODE - No changes will be made\n', 'yellow');
  }

  // Validate environment variables
  if (!MARKETING_DB_URL) {
    log('\n❌ Error: MARKETING_MONGO_URL environment variable is not set', 'red');
    log('   Set it to your marketing database connection string', 'red');
    process.exit(1);
  }

  if (!PRODUCTION_DB_URL) {
    log('\n❌ Error: MONGO_URL environment variable is not set', 'red');
    log('   Set it to your production database connection string', 'red');
    process.exit(1);
  }

  log(`\n📁 Marketing DB: ${MARKETING_DB_URL.substring(0, 30)}...`, 'blue');
  log(`📁 Production DB: ${PRODUCTION_DB_URL.substring(0, 30)}.../${PRODUCTION_DB_NAME}`, 'blue');

  // Confirm before proceeding
  if (!DRY_RUN && !FORCE) {
    const confirmed = await prompt('\n⚠️  This will migrate data to production. Continue? (y/n): ');
    if (!confirmed) {
      log('\n❌ Migration cancelled', 'red');
      process.exit(0);
    }
  }

  // Connect to both databases
  let marketingConn, productionConn;

  try {
    log('\n🔌 Connecting to databases...', 'blue');

    marketingConn = await mongoose.createConnection(MARKETING_DB_URL).asPromise();
    log('   ✓ Connected to Marketing database', 'green');

    productionConn = await mongoose.createConnection(`${PRODUCTION_DB_URL}/${PRODUCTION_DB_NAME}`).asPromise();
    log('   ✓ Connected to Production database', 'green');
  } catch (error) {
    log(`\n❌ Database connection failed: ${error.message}`, 'red');
    process.exit(1);
  }

  // Migration results
  const results = {
    success: [],
    failed: [],
    skipped: [],
  };

  // Migrate each collection
  for (const collectionConfig of COLLECTIONS_TO_MIGRATE) {
    const sourceName = collectionConfig.name;
    const targetName = collectionConfig.targetName || sourceName;

    console.log('\n');
    log(`─────────────────────────────────────────────────────────────────`, 'cyan');
    log(`  Migrating: ${sourceName} → ${targetName}`, 'cyan');
    log(`─────────────────────────────────────────────────────────────────`, 'cyan');

    try {
      const sourceCollection = marketingConn.collection(sourceName);
      const targetCollection = productionConn.collection(targetName);

      // Get counts
      const sourceCount = await sourceCollection.countDocuments();
      const existingCount = await targetCollection.countDocuments();

      log(`   📊 Source documents: ${sourceCount}`, 'blue');
      log(`   📊 Existing in target: ${existingCount}`, 'blue');
      log(`   📋 Strategy: ${collectionConfig.mergeStrategy}`, 'blue');

      if (sourceCount === 0) {
        log(`   ⚠️  Skipping - no documents to migrate`, 'yellow');
        results.skipped.push({ collection: sourceName, reason: 'empty' });
        continue;
      }

      // Get source documents
      const documents = await sourceCollection.find({}).toArray();

      let inserted = 0;
      let updated = 0;
      let skipped = 0;

      for (const doc of documents) {
        // Remove _id to let MongoDB generate new one (unless merging)
        const docWithoutId = { ...doc };
        delete docWithoutId._id;

        if (collectionConfig.uniqueField) {
          const uniqueValue = doc[collectionConfig.uniqueField];
          const existing = await targetCollection.findOne({
            [collectionConfig.uniqueField]: uniqueValue,
          });

          if (existing) {
            if (collectionConfig.mergeStrategy === 'upsert') {
              if (!DRY_RUN) {
                await targetCollection.updateOne(
                  { [collectionConfig.uniqueField]: uniqueValue },
                  { $set: docWithoutId }
                );
              }
              updated++;
            } else {
              skipped++;
            }
          } else {
            if (!DRY_RUN) {
              await targetCollection.insertOne(doc);
            }
            inserted++;
          }
        } else {
          // No unique field - check for exact duplicate by comparing key fields
          const existingExact = await targetCollection.findOne({
            ...docWithoutId,
          });

          if (!existingExact) {
            if (!DRY_RUN) {
              await targetCollection.insertOne(doc);
            }
            inserted++;
          } else {
            skipped++;
          }
        }
      }

      // Results
      log(`   ✓ Inserted: ${inserted}`, 'green');
      if (updated > 0) log(`   ✓ Updated: ${updated}`, 'green');
      if (skipped > 0) log(`   ⚠️  Skipped: ${skipped}`, 'yellow');

      // Verify final count
      const newCount = await targetCollection.countDocuments();
      log(`   📊 Final target count: ${newCount}`, 'blue');

      results.success.push({
        collection: targetName,
        source: sourceName,
        inserted,
        updated,
        skipped,
        total: newCount,
      });
    } catch (error) {
      log(`   ❌ Error: ${error.message}`, 'red');
      results.failed.push({
        collection: sourceName,
        error: error.message,
      });
    }
  }

  // Print summary
  console.log('\n');
  log('═══════════════════════════════════════════════════════════════════', 'cyan');
  log('  MIGRATION SUMMARY', 'cyan');
  log('═══════════════════════════════════════════════════════════════════', 'cyan');

  if (DRY_RUN) {
    log('\n  🔍 DRY RUN - No changes were made\n', 'yellow');
  }

  if (results.success.length > 0) {
    log('\n✅ Successful:', 'green');
    for (const s of results.success) {
      log(`   ${s.collection}: +${s.inserted} inserted, ${s.updated || 0} updated, ${s.skipped} skipped (total: ${s.total})`, 'green');
    }
  }

  if (results.skipped.length > 0) {
    log('\n⚠️  Skipped (empty collections):', 'yellow');
    for (const s of results.skipped) {
      log(`   ${s.collection}: ${s.reason}`, 'yellow');
    }
  }

  if (results.failed.length > 0) {
    log('\n❌ Failed:', 'red');
    for (const f of results.failed) {
      log(`   ${f.collection}: ${f.error}`, 'red');
    }
  }

  // Close connections
  await marketingConn.close();
  await productionConn.close();

  console.log('\n');
  log('═══════════════════════════════════════════════════════════════════', 'cyan');
  log('  Migration Complete!', 'green');
  log('═══════════════════════════════════════════════════════════════════', 'cyan');
  console.log('\n');

  // Exit with error code if any failures
  if (results.failed.length > 0) {
    process.exit(1);
  }
}

// Run migration
migrate().catch(error => {
  log(`\n❌ Migration failed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
