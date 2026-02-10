const express = require('express');
const router = express.Router();
const Service = require('../models/Service');

// Get all services (supports search, category filter, pagination)
router.get('/', async (req, res) => {
  try {
    const { search, category, page = 1, limit = 20 } = req.query;

    const query = { isActive: true };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Service.countDocuments(query);

    const services = await Service.find(query)
      .sort({ order: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get distinct categories for filter options
    const categories = await Service.distinct('category', { isActive: true });

    res.json({
      services,
      categories: categories.filter(Boolean),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Initialize services (for first-time setup)
router.post('/init', async (req, res) => {
  try {
    const services = [
      { serviceId: 'service-1', name: 'Profile Assessment', description: 'Complete profile evaluation and career counseling', icon: 'UserCircle', color: '#3B82F6', category: 'Assessment', serviceType: 'PROFILE_ASSESSMENT', order: 1 },
      { serviceId: 'service-2', name: 'Pre-application Support', description: 'Documentation and application preparation', icon: 'FileText', color: '#8B5CF6', category: 'Support', serviceType: 'UNIVERSITY_SHORTLISTING', order: 2 },
      { serviceId: 'service-3', name: 'Apply University', description: 'University selection and application submission', icon: 'School', color: '#A855F7', category: 'Education', serviceType: 'APPLICATION_ASSISTANCE', order: 3 },
      { serviceId: 'service-4', name: 'Visa & Interview Support', description: 'Visa processing and interview preparation', icon: 'Stamp', color: '#EC4899', category: 'Visa', serviceType: 'VISA_GUIDANCE', order: 4 },
      { serviceId: 'service-5', name: 'Ticket & Travel Support', description: 'Flight booking and travel arrangements', icon: 'Plane', color: '#F97316', category: 'Travel', serviceType: 'SCHOLARSHIP_SEARCH', order: 5 },
      { serviceId: 'service-6', name: 'Find Accommodation', description: 'Student housing and accommodation search', icon: 'Home', color: '#F59E0B', category: 'Housing', serviceType: 'ACCOMMODATION_HELP', order: 6 },
      { serviceId: 'service-7', name: 'Education Loan', description: 'Financial aid and loan assistance', icon: 'Banknote', color: '#10B981', category: 'Finance', serviceType: 'LOAN_ASSISTANCE', order: 7 },
      { serviceId: 'service-8', name: 'Find Jobs Abroad', description: 'Job search and career placement', icon: 'Briefcase', color: '#14B8A6', category: 'Career', serviceType: 'PRE_DEPARTURE_ORIENTATION', order: 8 }
    ];

    for (const service of services) {
      await Service.findOneAndUpdate(
        { serviceId: service.serviceId },
        service,
        { upsert: true, new: true }
      );
    }

    res.json({ message: 'Services initialized', count: services.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to initialize services' });
  }
});

module.exports = router;
