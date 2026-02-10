const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const Student = require('../models/Student');
const ServiceApplication = require('../models/ServiceApplication');
const ServiceRequest = require('../models/ServiceRequest');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { logAudit } = require('../utils/auditLogger');
const { emitToAdmins, emitToUser } = require('../socket/socketManager');
const { uploadToCloudinary, deleteFromCloudinary, validateFile } = require('../utils/fileUpload');

// Valid document types for student profile
const VALID_DOCUMENT_TYPES = ['transcripts', 'testScores', 'sop', 'recommendation', 'resume', 'passport'];

// Document type labels for display
const DOCUMENT_TYPE_LABELS = {
  transcripts: 'Transcripts',
  testScores: 'Test Scores',
  sop: 'Statement of Purpose',
  recommendation: 'Recommendation Letters',
  resume: 'Resume/CV',
  passport: 'Passport'
};

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

// Complete student onboarding
router.post('/onboarding', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const { interestedCountries, selectedServices, phone, country } = req.body;

    // Update user profile
    await User.findOneAndUpdate(
      { userId: req.user.userId },
      { phone, country }
    );

    // Update existing student record (created during signup)
    const student = await Student.findOneAndUpdate(
      { userId: req.user.userId },
      {
        interestedCountries: interestedCountries || [],
        selectedServices: selectedServices || [],
        onboardingCompleted: true
      },
      { new: true }
    );

    if (!student) {
      return res.status(404).json({ error: 'Student record not found' });
    }

    const studentId = student.studentId;

    // Log audit
    await logAudit(
      req.user.userId,
      'student_onboarded',
      'student',
      studentId,
      { interestedCountries, selectedServices },
      req
    );

    // Notify super admin about new student
    const superAdmins = await User.find({ role: 'super_admin' });
    for (const admin of superAdmins) {
      const notification = new Notification({
        notificationId: uuidv4(),
        recipientId: admin.userId,
        type: 'GENERAL',
        title: 'New Student Registration',
        message: `${req.user.firstName} ${req.user.lastName} completed onboarding`,
        metadata: { studentId }
      });
      await notification.save();

      // Real-time notification
      emitToUser(admin.userId, 'new_notification', notification);
    }

    res.status(201).json({
      message: 'Onboarding completed',
      student
    });
  } catch (error) {
    console.error('Onboarding error:', error);
    res.status(500).json({ error: 'Onboarding failed' });
  }
});

// Get student profile with user details
router.get('/profile', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user.userId });
    const user = await User.findOne({ userId: req.user.userId }).select('-password');

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    // Combine student and user data for complete profile
    const profile = {
      // User basic info
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
      phone: user?.phone || '',
      country: user?.country || '',
      avatar: user?.avatar || '',
      // Student profile info
      studentId: student.studentId,
      userId: student.userId,
      interestedCountries: student.interestedCountries || [],
      selectedServices: student.selectedServices || [],
      onboardingCompleted: student.onboardingCompleted,
      // Education details
      age: student.age,
      currentEducationLevel: student.currentEducationLevel,
      fieldOfStudy: student.fieldOfStudy,
      gpa: student.gpa,
      graduationYear: student.graduationYear,
      institution: student.institution,
      // Test scores
      ielts: student.ielts,
      toefl: student.toefl,
      gre: student.gre,
      // Preferences
      preferredCountries: student.preferredCountries || [],
      preferredDegreeLevel: student.preferredDegreeLevel,
      budget: student.budget,
      careerGoals: student.careerGoals,
      industry: student.industry,
      workLocation: student.workLocation,
      // Documents (nested in model)
      documents: {
        transcripts: student.documents?.transcripts || null,
        testScores: student.documents?.testScores || null,
        sop: student.documents?.sop || null,
        recommendation: student.documents?.recommendation || null,
        resume: student.documents?.resume || null,
        passport: student.documents?.passport || null
      },
      createdAt: student.createdAt,
      updatedAt: student.updatedAt
    };

    res.json({ student: profile });
  } catch (error) {
    console.error('Failed to fetch profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update student profile
router.put('/profile', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      country,
      // Education details
      age,
      currentEducationLevel,
      fieldOfStudy,
      gpa,
      graduationYear,
      institution,
      // Test scores
      ielts,
      toefl,
      gre,
      // Preferences
      preferredCountries,
      preferredDegreeLevel,
      budget,
      careerGoals,
      industry,
      workLocation
    } = req.body;

    // Update user basic info
    const userUpdateData = {};
    if (firstName !== undefined) userUpdateData.firstName = firstName;
    if (lastName !== undefined) userUpdateData.lastName = lastName;
    if (phone !== undefined) userUpdateData.phone = phone;
    if (country !== undefined) userUpdateData.country = country;

    if (Object.keys(userUpdateData).length > 0) {
      await User.findOneAndUpdate(
        { userId: req.user.userId },
        userUpdateData
      );
    }

    // Update student profile
    const studentUpdateData = {};
    if (age !== undefined) studentUpdateData.age = age ? parseInt(age) : null;
    if (currentEducationLevel !== undefined) studentUpdateData.currentEducationLevel = currentEducationLevel;
    if (fieldOfStudy !== undefined) studentUpdateData.fieldOfStudy = fieldOfStudy;
    if (gpa !== undefined) studentUpdateData.gpa = gpa;
    if (graduationYear !== undefined) studentUpdateData.graduationYear = graduationYear ? parseInt(graduationYear) : null;
    if (institution !== undefined) studentUpdateData.institution = institution;
    if (ielts !== undefined) studentUpdateData.ielts = ielts;
    if (toefl !== undefined) studentUpdateData.toefl = toefl;
    if (gre !== undefined) studentUpdateData.gre = gre;
    if (preferredCountries !== undefined) studentUpdateData.preferredCountries = preferredCountries;
    if (preferredDegreeLevel !== undefined) studentUpdateData.preferredDegreeLevel = preferredDegreeLevel;
    if (budget !== undefined) studentUpdateData.budget = budget;
    if (careerGoals !== undefined) studentUpdateData.careerGoals = careerGoals;
    if (industry !== undefined) studentUpdateData.industry = industry;
    if (workLocation !== undefined) studentUpdateData.workLocation = workLocation;

    const student = await Student.findOneAndUpdate(
      { userId: req.user.userId },
      studentUpdateData,
      { new: true }
    );

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Log audit
    await logAudit(
      req.user.userId,
      'profile_updated',
      'student',
      student.studentId,
      { ...userUpdateData, ...studentUpdateData },
      req
    );

    // Fetch updated user data
    const user = await User.findOne({ userId: req.user.userId }).select('-password');

    // Return combined profile
    const profile = {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
      phone: user?.phone || '',
      country: user?.country || '',
      avatar: user?.avatar || '',
      studentId: student.studentId,
      userId: student.userId,
      interestedCountries: student.interestedCountries || [],
      selectedServices: student.selectedServices || [],
      onboardingCompleted: student.onboardingCompleted,
      age: student.age,
      currentEducationLevel: student.currentEducationLevel,
      fieldOfStudy: student.fieldOfStudy,
      gpa: student.gpa,
      graduationYear: student.graduationYear,
      institution: student.institution,
      ielts: student.ielts,
      toefl: student.toefl,
      gre: student.gre,
      preferredCountries: student.preferredCountries || [],
      preferredDegreeLevel: student.preferredDegreeLevel,
      budget: student.budget,
      careerGoals: student.careerGoals,
      industry: student.industry,
      workLocation: student.workLocation,
      documents: {
        transcripts: student.documents?.transcripts || null,
        testScores: student.documents?.testScores || null,
        sop: student.documents?.sop || null,
        recommendation: student.documents?.recommendation || null,
        resume: student.documents?.resume || null,
        passport: student.documents?.passport || null
      },
      createdAt: student.createdAt,
      updatedAt: student.updatedAt
    };

    res.json({
      message: 'Profile updated successfully',
      student: profile
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Upload profile image/avatar
router.post('/upload-image', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const file = req.files.file;

    // Validate file type (images only)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        error: 'Only image files are allowed (JPEG, PNG, GIF, WEBP)'
      });
    }

    // Validate file size (5MB max for images)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return res.status(400).json({
        error: 'Image size exceeds 5MB limit'
      });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(file, {
      folder: `fly8/students/${req.user.userId}/profile`
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Upload failed' });
    }

    // Update user avatar
    await User.findOneAndUpdate(
      { userId: req.user.userId },
      { avatar: result.url }
    );

    // Log audit
    await logAudit(
      req.user.userId,
      'profile_image_uploaded',
      'user',
      req.user.userId,
      { imageUrl: result.url },
      req
    );

    res.json({
      message: 'Profile image uploaded successfully',
      imageUrl: result.url,
      file: {
        url: result.url,
        publicId: result.publicId,
        name: result.originalName,
        size: result.size
      }
    });
  } catch (error) {
    console.error('Profile image upload error:', error);
    res.status(500).json({ error: 'Failed to upload profile image' });
  }
});

// Upload document (transcripts, resume, etc.)
router.post('/upload-document', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const { documentType } = req.body;

    // Validate document type
    if (!VALID_DOCUMENT_TYPES.includes(documentType)) {
      return res.status(400).json({
        error: `Invalid document type. Valid types: ${VALID_DOCUMENT_TYPES.join(', ')}`
      });
    }

    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const file = req.files.file;

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(file, {
      folder: `fly8/students/${req.user.userId}/documents`
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Upload failed' });
    }

    // Update student document field (nested in documents object)
    const updateData = {};
    updateData[`documents.${documentType}`] = result.url;

    const student = await Student.findOneAndUpdate(
      { userId: req.user.userId },
      { $set: updateData },
      { new: true }
    );

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Log audit
    await logAudit(
      req.user.userId,
      'document_uploaded',
      'student',
      student.studentId,
      { documentType, fileUrl: result.url },
      req
    );

    res.json({
      message: `${DOCUMENT_TYPE_LABELS[documentType]} uploaded successfully`,
      documentType,
      file: {
        url: result.url,
        publicId: result.publicId,
        name: result.originalName,
        size: result.size,
        format: result.format
      }
    });
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Get all uploaded documents
router.get('/documents', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user.userId });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Build documents array with metadata
    const documents = [];
    const studentDocs = student.documents || {};
    for (const docType of VALID_DOCUMENT_TYPES) {
      if (studentDocs[docType]) {
        documents.push({
          type: docType,
          label: DOCUMENT_TYPE_LABELS[docType],
          url: studentDocs[docType],
          uploadedAt: student.updatedAt
        });
      }
    }

    res.json({
      documents,
      availableTypes: VALID_DOCUMENT_TYPES.map(type => ({
        type,
        label: DOCUMENT_TYPE_LABELS[type],
        uploaded: !!studentDocs[type]
      }))
    });
  } catch (error) {
    console.error('Failed to fetch documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Delete a document
router.delete('/documents/:documentType', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const { documentType } = req.params;

    // Validate document type
    if (!VALID_DOCUMENT_TYPES.includes(documentType)) {
      return res.status(400).json({
        error: `Invalid document type. Valid types: ${VALID_DOCUMENT_TYPES.join(', ')}`
      });
    }

    const student = await Student.findOne({ userId: req.user.userId });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Check if document exists
    const studentDocs = student.documents || {};
    if (!studentDocs[documentType]) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Remove document URL from student record (nested path)
    const updateData = {};
    updateData[`documents.${documentType}`] = null;

    await Student.findOneAndUpdate(
      { userId: req.user.userId },
      { $unset: updateData }
    );

    // Log audit
    await logAudit(
      req.user.userId,
      'document_deleted',
      'student',
      student.studentId,
      { documentType },
      req
    );

    res.json({
      message: `${DOCUMENT_TYPE_LABELS[documentType]} deleted successfully`,
      documentType
    });
  } catch (error) {
    console.error('Document delete error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Apply for services
router.post('/apply-services', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const { serviceIds } = req.body;

    const student = await Student.findOne({ userId: req.user.userId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const applications = [];
    const serviceRequests = [];

    for (const serviceId of serviceIds) {
      const existingApp = await ServiceApplication.findOne({
        studentId: student.studentId,
        serviceId
      });

      if (!existingApp) {
        // Create ServiceApplication (legacy)
        const application = new ServiceApplication({
          applicationId: uuidv4(),
          studentId: student.studentId,
          serviceId,
          status: 'not_started'
        });
        await application.save();
        applications.push(application);

        // Also create ServiceRequest for TrackServices page
        const serviceType = SERVICE_ID_TO_TYPE[serviceId];
        if (serviceType) {
          // Check if service request already exists for this service type
          const existingRequest = await ServiceRequest.findOne({
            studentId: student.studentId,
            serviceType,
            status: { $in: ['PENDING_ADMIN_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS'] }
          });

          if (!existingRequest) {
            const serviceRequestId = uuidv4();
            const serviceRequest = new ServiceRequest({
              serviceRequestId,
              studentId: student.studentId,
              serviceType,
              status: 'PENDING_ADMIN_ASSIGNMENT',
              metadata: { applicationId: application.applicationId, serviceId },
              appliedAt: new Date()
            });

            // Add initial status to history
            serviceRequest.statusHistory.push({
              status: 'PENDING_ADMIN_ASSIGNMENT',
              changedBy: req.user.userId,
              changedAt: new Date(),
              note: 'Service request created by student'
            });

            await serviceRequest.save();
            serviceRequests.push(serviceRequest);
          }
        }

        // Log audit and notify admins (non-blocking)
        try {
          await logAudit(
            req.user.userId,
            'service_applied',
            'application',
            application.applicationId,
            { serviceId },
            req
          );

          // Notify super admin with real-time update
          const superAdmins = await User.find({ role: 'super_admin' });
          for (const admin of superAdmins) {
            const notification = new Notification({
              notificationId: uuidv4(),
              recipientId: admin.userId,
              type: 'SERVICE_REQUEST_CREATED',
              title: 'New Service Application',
              message: `${req.user.firstName} ${req.user.lastName} applied for service`,
              metadata: { studentId: student.studentId, serviceId }
            });
            await notification.save();

            // Real-time notification
            emitToUser(admin.userId, 'new_notification', notification);
            emitToAdmins('service_application', {
              student: { firstName: req.user.firstName, lastName: req.user.lastName },
              serviceId,
              timestamp: new Date()
            });
          }
        } catch (notificationError) {
          console.error('Failed to send notification for service application:', notificationError);
          // Don't fail the request - notification is not critical
        }
      }
    }

    res.status(201).json({
      message: 'Services applied successfully',
      applications,
      serviceRequests
    });
  } catch (error) {
    console.error('Service application error:', error);
    res.status(500).json({ error: 'Failed to apply for services' });
  }
});

// Get student's service applications (timeline data)
router.get('/my-applications', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user.userId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const applications = await ServiceApplication.find({ studentId: student.studentId });

    res.json({ applications });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

module.exports = router;
