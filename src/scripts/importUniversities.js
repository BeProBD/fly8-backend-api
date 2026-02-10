/**
 * Import Universities from CSV
 * Run: node src/scripts/importUniversities.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGO_URL = process.env.MONGO_URL;

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(MONGO_URL);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Parse CSV line handling quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Reconstruct nested object from flattened CSV
function reconstructUniversity(headers, values) {
  const uni = {
    stats: [],
    overviewData: [],
    generalRequirements: [],
    undergraduate: { englishTests: [], otherTests: [], additionalRequirements: [] },
    graduate: { englishTests: [], additionalRequirements: [] },
    conditionalAdmission: { benefits: [] },
    tuitionData: [],
    additionalFees: [],
    livingCosts: [],
    scholarships: [],
    visaSteps: [],
    workOpportunities: [],
    campusImages: [],
    campusFeatures: [],
  };

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const value = values[i];

    if (!value || value === '') continue;

    // Skip MongoDB internal IDs from CSV
    if (header.endsWith('._id') || header === '_id' || header === '__v') continue;

    // Handle array fields
    const arrayMatch = header.match(/^(\w+)\[(\d+)\]$/);
    const nestedArrayMatch = header.match(/^(\w+)\[(\d+)\]\.(\w+)$/);
    const deepNestedMatch = header.match(/^(\w+)\.(\w+)\[(\d+)\]\.(\w+)$/);
    const deepNestedSimple = header.match(/^(\w+)\.(\w+)\[(\d+)\]$/);

    if (deepNestedMatch) {
      // e.g., undergraduate.englishTests[0].name
      const [, parent, arrayName, index, field] = deepNestedMatch;
      const idx = parseInt(index);
      if (!uni[parent]) uni[parent] = {};
      if (!uni[parent][arrayName]) uni[parent][arrayName] = [];
      if (!uni[parent][arrayName][idx]) uni[parent][arrayName][idx] = {};
      uni[parent][arrayName][idx][field] = value;
    } else if (deepNestedSimple) {
      // e.g., undergraduate.otherTests[0]
      const [, parent, arrayName, index] = deepNestedSimple;
      const idx = parseInt(index);
      if (!uni[parent]) uni[parent] = {};
      if (!uni[parent][arrayName]) uni[parent][arrayName] = [];
      uni[parent][arrayName][idx] = value;
    } else if (nestedArrayMatch) {
      // e.g., overviewData[0].label
      const [, arrayName, index, field] = nestedArrayMatch;
      const idx = parseInt(index);
      if (!uni[arrayName]) uni[arrayName] = [];
      if (!uni[arrayName][idx]) uni[arrayName][idx] = {};
      uni[arrayName][idx][field] = value;
    } else if (arrayMatch) {
      // e.g., stats[0]
      const [, arrayName, index] = arrayMatch;
      const idx = parseInt(index);
      if (!uni[arrayName]) uni[arrayName] = [];
      uni[arrayName][idx] = value;
    } else if (header.includes('.')) {
      // e.g., conditionalAdmission.available
      const parts = header.split('.');
      if (parts.length === 2) {
        const [parent, field] = parts;
        if (!uni[parent]) uni[parent] = {};
        // Handle boolean values
        if (value === 'true') uni[parent][field] = true;
        else if (value === 'false') uni[parent][field] = false;
        else uni[parent][field] = value;
      }
    } else {
      // Simple field
      // Handle numeric fields
      if (['applicationFee', 'financialRequirement', 'tuitionDeposit', 'processingFee', 'ranking'].includes(header)) {
        uni[header] = parseFloat(value) || 0;
      } else if (header === 'isActive') {
        uni[header] = value === 'true';
      } else {
        uni[header] = value;
      }
    }
  }

  // Clean up empty arrays and objects
  const cleanArray = (arr) => arr.filter(item => item !== undefined && item !== null && item !== '');

  uni.stats = cleanArray(uni.stats);
  uni.generalRequirements = cleanArray(uni.generalRequirements);
  uni.overviewData = cleanArray(uni.overviewData).filter(item => item.label || item.value);
  uni.undergraduate.englishTests = cleanArray(uni.undergraduate.englishTests).filter(item => item.name);
  uni.undergraduate.otherTests = cleanArray(uni.undergraduate.otherTests);
  uni.undergraduate.additionalRequirements = cleanArray(uni.undergraduate.additionalRequirements);
  uni.graduate.englishTests = cleanArray(uni.graduate.englishTests).filter(item => item.name);
  uni.graduate.additionalRequirements = cleanArray(uni.graduate.additionalRequirements);
  uni.conditionalAdmission.benefits = cleanArray(uni.conditionalAdmission.benefits);
  uni.tuitionData = cleanArray(uni.tuitionData).filter(item => item.category);
  uni.additionalFees = cleanArray(uni.additionalFees).filter(item => item.name);
  uni.livingCosts = cleanArray(uni.livingCosts).filter(item => item.category);
  uni.scholarships = cleanArray(uni.scholarships).filter(item => item.name);
  uni.visaSteps = cleanArray(uni.visaSteps).filter(item => item.title);
  uni.workOpportunities = cleanArray(uni.workOpportunities).filter(item => item.type);
  uni.campusImages = cleanArray(uni.campusImages).filter(item => item.src);
  uni.campusFeatures = cleanArray(uni.campusFeatures).filter(item => item.title);

  return uni;
}

async function importUniversities() {
  await connectDB();

  const db = mongoose.connection.db;
  const collection = db.collection('universities');

  // Step 1: Drop problematic indexes
  console.log('\n📋 Checking indexes...');
  try {
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(i => i.name));

    // Drop universityId index if it exists and is unique
    const uniIdIndex = indexes.find(i => i.name === 'universityId_1');
    if (uniIdIndex) {
      console.log('Dropping universityId_1 index...');
      await collection.dropIndex('universityId_1');
      console.log('✅ Dropped universityId_1 index');
    }
  } catch (error) {
    console.log('Index check/drop error (might not exist):', error.message);
  }

  // Step 2: Read and parse CSV
  const csvPath = path.join(__dirname, '../data/Fly8.universities.csv');
  console.log(`\n📖 Reading CSV from: ${csvPath}`);

  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n').filter(line => line.trim());

  const headers = parseCSVLine(lines[0]);
  console.log(`Found ${headers.length} columns and ${lines.length - 1} data rows`);

  // Step 3: Parse all universities
  const universities = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 5) continue; // Skip incomplete rows

    const uni = reconstructUniversity(headers, values);
    if (uni.universitycode && uni.universityName) {
      // Ensure universityId is set
      uni.universityId = uni.universitycode;
      universities.push(uni);
    }
  }

  console.log(`\n📊 Parsed ${universities.length} universities`);

  // Step 4: Clear existing data and insert
  console.log('\n🗑️  Clearing existing universities...');
  await collection.deleteMany({});

  console.log('📥 Inserting universities...');
  const result = await collection.insertMany(universities);
  console.log(`✅ Successfully imported ${result.insertedCount} universities`);

  // Step 5: Recreate indexes
  console.log('\n📇 Creating indexes...');
  await collection.createIndex({ universitycode: 1 }, { unique: true });
  await collection.createIndex({ universityId: 1 }); // Non-unique this time
  await collection.createIndex({ country: 1 });
  await collection.createIndex({ isActive: 1 });
  console.log('✅ Indexes created');

  // Show sample
  const sample = await collection.findOne({});
  console.log('\n📄 Sample imported university:');
  console.log('  Code:', sample.universitycode);
  console.log('  Name:', sample.universityName);
  console.log('  Country:', sample.country);
  console.log('  Stats:', sample.stats?.length, 'items');
  console.log('  Scholarships:', sample.scholarships?.length, 'items');

  console.log('\n✅ Import completed!');
  process.exit(0);
}

importUniversities().catch(err => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
