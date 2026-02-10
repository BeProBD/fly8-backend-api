/**
 * Admin Event Controller
 * Manages German Course and GSTU registrations (super_admin only)
 */

const GermanCourseRegistration = require('../../models/GermanCourseRegistration');
const GstuRegistration = require('../../models/GstuRegistration');

// =============================================================================
// GERMAN COURSE ADMIN
// =============================================================================

/**
 * Get all German Course registrations
 * GET /api/v1/admin/events/german-course
 */
exports.getGermanCourseRegistrations = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;

    const query = search
      ? {
          $or: [
            { fullName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { registrationNumber: { $regex: search, $options: 'i' } },
            { whatsappNumber: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const registrations = await GermanCourseRegistration.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    const totalCount = await GermanCourseRegistration.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: registrations,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / limitNumber),
        totalRegistrations: totalCount,
        limit: limitNumber,
      },
    });
  } catch (error) {
    console.error('Get registrations error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching registrations',
      error: error.message,
    });
  }
};

/**
 * Get German Course statistics
 * GET /api/v1/admin/events/german-course/stats
 */
exports.getGermanCourseStats = async (req, res) => {
  try {
    const totalRegistrations = await GermanCourseRegistration.countDocuments();

    const academicLevelStats = await GermanCourseRegistration.aggregate([
      { $group: { _id: '$academicLevel', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const previousCourseStats = await GermanCourseRegistration.aggregate([
      { $group: { _id: '$previousFly8Course', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const fly8RelationStats = await GermanCourseRegistration.aggregate([
      { $group: { _id: '$fly8Relation', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyRegistrations = await GermanCourseRegistration.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalRegistrations,
        academicLevelStats,
        previousCourseStats,
        fly8RelationStats,
        dailyRegistrations,
      },
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message,
    });
  }
};

/**
 * Delete German Course registration
 * DELETE /api/v1/admin/events/german-course/:id
 */
exports.deleteGermanCourseRegistration = async (req, res) => {
  try {
    const { id } = req.params;

    const registration = await GermanCourseRegistration.findByIdAndDelete(id);

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Registration not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Registration deleted successfully',
    });
  } catch (error) {
    console.error('Delete registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting registration',
      error: error.message,
    });
  }
};

// =============================================================================
// GSTU ADMIN
// =============================================================================

/**
 * Get all GSTU registrations
 * GET /api/v1/admin/events/gstu
 */
exports.getGstuRegistrations = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;

    const query = search
      ? {
          $or: [
            { fullName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { registrationNumber: { $regex: search, $options: 'i' } },
            { contactNumber: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const registrations = await GstuRegistration.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    const count = await GstuRegistration.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: registrations,
      totalPages: Math.ceil(count / limitNumber),
      currentPage: pageNumber,
      totalRegistrations: count,
    });
  } catch (error) {
    console.error('Get GSTU registrations error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching registrations',
      error: error.message,
    });
  }
};

/**
 * Get GSTU statistics
 * GET /api/v1/admin/events/gstu/stats
 */
exports.getGstuStats = async (req, res) => {
  try {
    const totalRegistrations = await GstuRegistration.countDocuments();
    const ticketsCollected = await GstuRegistration.countDocuments({ ticketCollected: true });

    const destinationStats = await GstuRegistration.aggregate([
      { $unwind: '$studyDestinations' },
      { $group: { _id: '$studyDestinations', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const programLevelStats = await GstuRegistration.aggregate([
      { $group: { _id: '$programLevel', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const universityStats = await GstuRegistration.aggregate([
      { $group: { _id: '$universityName', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalRegistrations,
        ticketsCollected,
        ticketsPending: totalRegistrations - ticketsCollected,
        destinationStats,
        programLevelStats,
        topUniversities: universityStats,
      },
    });
  } catch (error) {
    console.error('Get GSTU statistics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message,
    });
  }
};

/**
 * Mark GSTU ticket as collected
 * PUT /api/v1/admin/events/gstu/:registrationNumber/ticket
 */
exports.collectGstuTicket = async (req, res) => {
  try {
    const { registrationNumber } = req.params;

    const registration = await GstuRegistration.findOneAndUpdate(
      { registrationNumber },
      {
        ticketCollected: true,
        ticketCollectionDate: new Date(),
      },
      { new: true }
    );

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Registration not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Ticket collection marked successfully',
      data: registration,
    });
  } catch (error) {
    console.error('Ticket collection error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating ticket collection',
      error: error.message,
    });
  }
};
