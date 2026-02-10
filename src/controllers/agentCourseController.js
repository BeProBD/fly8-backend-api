/**
 * Agent Course Controller
 * Program search, filtering, detail, and shortlist management for agents
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Program = require('../models/Program');
const University = require('../models/University');
const Shortlist = require('../models/Shortlist');
const Student = require('../models/Student');

/**
 * Search programs with advanced filters + pagination
 * GET /api/v1/agents/courses/search
 */
exports.searchPrograms = async (req, res) => {
  try {
    const {
      search,
      country,
      universityName,
      programLevel,
      majors,
      intake,
      tuitionMin,
      tuitionMax,
      duration,
      ieltsMin,
      toeflMin,
      scholarship,
      applicationFeeMax,
      programMode,
      page,
      limit,
      sort
    } = req.query;

    const filter = { isActive: { $ne: false } };

    // Global text search
    if (search) {
      filter.$or = [
        { programName: { $regex: search, $options: 'i' } },
        { majors: { $regex: search, $options: 'i' } },
        { universityName: { $regex: search, $options: 'i' } },
        { country: { $regex: search, $options: 'i' } }
      ];
    }

    if (country) {
      filter.country = { $regex: new RegExp(`^${country}$`, 'i') };
    }
    if (universityName) {
      filter.universityName = { $regex: new RegExp(universityName, 'i') };
    }
    if (programLevel) {
      filter.programLevel = programLevel;
    }
    if (majors) {
      filter.majors = { $regex: new RegExp(majors, 'i') };
    }
    if (intake) {
      filter.intake = { $regex: new RegExp(intake, 'i') };
    }
    if (programMode) {
      filter.programMode = programMode;
    }
    if (duration) {
      filter.duration = { $regex: new RegExp(duration, 'i') };
    }

    // Scholarship availability filter
    if (scholarship === 'true') {
      filter.scholarship = { $exists: true, $nin: ['', null] };
    }

    // Tuition fee range (string field - extract numeric for comparison via aggregation)
    // Since tuitionFee is a String, we use regex to match numeric patterns
    // For precise range filtering, we use aggregation pipeline
    let usePipeline = false;
    const pipelineStages = [];

    if (tuitionMin || tuitionMax || applicationFeeMax || ieltsMin || toeflMin) {
      usePipeline = true;

      // Match stage with base filters
      pipelineStages.push({ $match: filter });

      // Add computed numeric fields for range filtering
      const addFieldsStage = { $addFields: {} };

      if (tuitionMin || tuitionMax) {
        addFieldsStage.$addFields.tuitionNumeric = {
          $toDouble: {
            $ifNull: [
              {
                $arrayElemAt: [
                  {
                    $regexFindAll: {
                      input: { $ifNull: ['$tuitionFee', '0'] },
                      regex: /[\d,]+\.?\d*/
                    }
                  },
                  0
                ]
              },
              { match: '0' }
            ]
          }
        };
        // Simpler approach: extract first number from string
        addFieldsStage.$addFields.tuitionNumeric = {
          $convert: {
            input: {
              $replaceAll: {
                input: {
                  $getField: {
                    field: 'match',
                    input: {
                      $first: {
                        $regexFindAll: {
                          input: {
                            $replaceAll: {
                              input: { $ifNull: ['$tuitionFee', '0'] },
                              find: ',',
                              replacement: ''
                            }
                          },
                          regex: /[\d]+\.?\d*/
                        }
                      }
                    }
                  }
                },
                find: ',',
                replacement: ''
              }
            },
            to: 'double',
            onError: 0,
            onNull: 0
          }
        };
      }

      if (applicationFeeMax) {
        addFieldsStage.$addFields.appFeeNumeric = {
          $convert: {
            input: {
              $getField: {
                field: 'match',
                input: {
                  $first: {
                    $regexFindAll: {
                      input: {
                        $replaceAll: {
                          input: { $ifNull: ['$applicationFee', '0'] },
                          find: ',',
                          replacement: ''
                        }
                      },
                      regex: /[\d]+\.?\d*/
                    }
                  }
                }
              }
            },
            to: 'double',
            onError: 0,
            onNull: 0
          }
        };
      }

      if (ieltsMin) {
        addFieldsStage.$addFields.ieltsNumeric = {
          $convert: {
            input: '$languageRequirement.ielts',
            to: 'double',
            onError: 0,
            onNull: 0
          }
        };
      }

      if (toeflMin) {
        addFieldsStage.$addFields.toeflNumeric = {
          $convert: {
            input: '$languageRequirement.toefl',
            to: 'double',
            onError: 0,
            onNull: 0
          }
        };
      }

      pipelineStages.push(addFieldsStage);

      // Range match stage
      const rangeMatch = {};
      if (tuitionMin) rangeMatch.tuitionNumeric = { ...rangeMatch.tuitionNumeric, $gte: parseFloat(tuitionMin) };
      if (tuitionMax) rangeMatch.tuitionNumeric = { ...rangeMatch.tuitionNumeric, $lte: parseFloat(tuitionMax) };
      if (applicationFeeMax) rangeMatch.appFeeNumeric = { $lte: parseFloat(applicationFeeMax) };
      if (ieltsMin) rangeMatch.ieltsNumeric = { $gte: parseFloat(ieltsMin) };
      if (toeflMin) rangeMatch.toeflNumeric = { $gte: parseFloat(toeflMin) };

      if (Object.keys(rangeMatch).length > 0) {
        pipelineStages.push({ $match: rangeMatch });
      }

      // Remove computed fields from output
      pipelineStages.push({
        $project: {
          tuitionNumeric: 0,
          appFeeNumeric: 0,
          ieltsNumeric: 0,
          toeflNumeric: 0
        }
      });
    }

    const pageNumber = parseInt(page) || 1;
    const limitNumber = Math.min(parseInt(limit) || 20, 100);
    const skip = (pageNumber - 1) * limitNumber;

    let sortObj = { createdAt: -1 };
    if (sort === 'name') sortObj = { programName: 1 };
    else if (sort === 'university') sortObj = { universityName: 1 };
    else if (sort === 'country') sortObj = { country: 1 };
    else if (sort === 'level') sortObj = { programLevel: 1 };

    let programs, total;

    if (usePipeline) {
      // Count total with same pipeline (minus skip/limit)
      const countPipeline = [...pipelineStages, { $count: 'total' }];
      const countResult = await Program.aggregate(countPipeline);
      total = countResult.length > 0 ? countResult[0].total : 0;

      // Get paginated results
      pipelineStages.push({ $sort: sortObj });
      pipelineStages.push({ $skip: skip });
      pipelineStages.push({ $limit: limitNumber });
      programs = await Program.aggregate(pipelineStages);
    } else {
      [programs, total] = await Promise.all([
        Program.find(filter).sort(sortObj).skip(skip).limit(limitNumber).lean(),
        Program.countDocuments(filter)
      ]);
    }

    return res.status(200).json({
      success: true,
      data: programs,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber)
      }
    });
  } catch (error) {
    console.error('Agent course search error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to search programs',
      error: error.message
    });
  }
};

/**
 * Get distinct filter options for dropdowns
 * GET /api/v1/agents/courses/filters
 */
exports.getFilterOptions = async (req, res) => {
  try {
    const activeFilter = { isActive: { $ne: false } };

    const [countries, levels, intakes, universities, durations, modes] = await Promise.all([
      Program.distinct('country', activeFilter),
      Program.distinct('programLevel', activeFilter),
      Program.distinct('intake', activeFilter),
      Program.distinct('universityName', activeFilter),
      Program.distinct('duration', activeFilter),
      Program.distinct('programMode', activeFilter)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        countries: countries.filter(Boolean).sort(),
        levels: levels.filter(Boolean).sort(),
        intakes: intakes.filter(Boolean).sort(),
        universities: universities.filter(Boolean).sort(),
        durations: durations.filter(Boolean).sort(),
        modes: modes.filter(Boolean).sort()
      }
    });
  } catch (error) {
    console.error('Get filter options error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch filter options',
      error: error.message
    });
  }
};

/**
 * Get full program detail with university info
 * GET /api/v1/agents/courses/:id
 */
exports.getProgramDetail = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid program ID' });
    }

    const program = await Program.findById(id).lean();
    if (!program) {
      return res.status(404).json({ success: false, message: 'Program not found' });
    }

    // Look up university data for enrichment
    let university = null;
    if (program.universityCode) {
      university = await University.findOne({ universitycode: program.universityCode }).lean();
    }
    if (!university && program.universityName) {
      university = await University.findOne({
        universityName: { $regex: new RegExp(`^${program.universityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      }).lean();
    }

    return res.status(200).json({
      success: true,
      data: {
        program,
        university: university
          ? {
              universitycode: university.universitycode,
              universityName: university.universityName,
              country: university.country,
              location: university.location,
              imageUrl: university.imageUrl || university.logo,
              website: university.website,
              ranking: university.ranking,
              applicationFee: university.applicationFee,
              scholarships: university.scholarships,
              tuitionData: university.tuitionData,
              generalRequirements: university.generalRequirements,
              undergraduate: university.undergraduate,
              graduate: university.graduate,
              conditionalAdmission: university.conditionalAdmission
            }
          : null
      }
    });
  } catch (error) {
    console.error('Get program detail error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch program details',
      error: error.message
    });
  }
};

/**
 * Add program to shortlist for a student
 * POST /api/v1/agents/courses/shortlist
 */
exports.addToShortlist = async (req, res) => {
  try {
    const { studentId, programId, notes } = req.body;
    const agentUserId = req.user.userId;

    if (!studentId || !programId) {
      return res.status(400).json({ success: false, message: 'studentId and programId are required' });
    }

    // Verify student belongs to agent
    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (student.assignedAgent !== agentUserId && student.referredBy !== agentUserId) {
      return res.status(403).json({ success: false, message: 'You can only shortlist for your own students' });
    }

    // Verify program exists
    if (!mongoose.Types.ObjectId.isValid(programId)) {
      return res.status(400).json({ success: false, message: 'Invalid program ID' });
    }
    const program = await Program.findById(programId);
    if (!program) {
      return res.status(404).json({ success: false, message: 'Program not found' });
    }

    // Upsert to handle duplicates gracefully
    const shortlist = await Shortlist.findOneAndUpdate(
      { agentId: agentUserId, studentId, programId },
      {
        $setOnInsert: { shortlistId: uuidv4() },
        $set: { notes: notes || '' }
      },
      { upsert: true, new: true }
    );

    return res.status(201).json({
      success: true,
      message: 'Program shortlisted successfully',
      data: shortlist
    });
  } catch (error) {
    console.error('Add to shortlist error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add to shortlist',
      error: error.message
    });
  }
};

/**
 * Remove program from shortlist
 * DELETE /api/v1/agents/courses/shortlist/:shortlistId
 */
exports.removeFromShortlist = async (req, res) => {
  try {
    const { shortlistId } = req.params;
    const agentUserId = req.user.userId;

    const entry = await Shortlist.findOne({ shortlistId });
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Shortlist entry not found' });
    }
    if (entry.agentId !== agentUserId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await Shortlist.deleteOne({ shortlistId });

    return res.status(200).json({
      success: true,
      message: 'Removed from shortlist'
    });
  } catch (error) {
    console.error('Remove from shortlist error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove from shortlist',
      error: error.message
    });
  }
};

/**
 * Get agent's shortlisted programs (optionally filtered by student)
 * GET /api/v1/agents/courses/shortlists
 */
exports.getShortlists = async (req, res) => {
  try {
    const { studentId, page, limit } = req.query;
    const agentUserId = req.user.userId;

    const filter = { agentId: agentUserId };
    if (studentId) filter.studentId = studentId;

    const pageNumber = parseInt(page) || 1;
    const limitNumber = Math.min(parseInt(limit) || 20, 100);
    const skip = (pageNumber - 1) * limitNumber;

    const [entries, total] = await Promise.all([
      Shortlist.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNumber).lean(),
      Shortlist.countDocuments(filter)
    ]);

    // Enrich with program data
    const programIds = entries.map(e => e.programId).filter(Boolean);
    const programs = await Program.find({ _id: { $in: programIds } }).lean();
    const programMap = {};
    programs.forEach(p => { programMap[p._id.toString()] = p; });

    // Enrich with student names
    const studentIds = [...new Set(entries.map(e => e.studentId))];
    const students = await Student.find({ studentId: { $in: studentIds } }).lean();
    const User = require('../models/User');
    const studentUserIds = students.map(s => s.userId);
    const users = await User.find({ userId: { $in: studentUserIds } }).select('userId firstName lastName').lean();
    const userMap = {};
    users.forEach(u => { userMap[u.userId] = u; });
    const studentMap = {};
    students.forEach(s => {
      const u = userMap[s.userId];
      studentMap[s.studentId] = {
        studentId: s.studentId,
        firstName: u ? u.firstName : '',
        lastName: u ? u.lastName : ''
      };
    });

    const data = entries.map(entry => ({
      ...entry,
      program: programMap[entry.programId?.toString()] || null,
      student: studentMap[entry.studentId] || null
    }));

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber)
      }
    });
  } catch (error) {
    console.error('Get shortlists error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch shortlists',
      error: error.message
    });
  }
};
