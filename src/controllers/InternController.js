const Intern = require('../models/intern');
const ExcelJS = require('exceljs');

const submitInternApplication = async (req, res) => {
  try {
    const newApplication = new Intern(req.body);
    await newApplication.save();
    res.status(201).json({ message: 'Application submitted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

const getAllInternApplications = async (req, res) => {
  try {
    const applications = await Intern.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: applications, total: applications.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch applications.' });
  }
};

const exportInternApplicationsToExcel = async (req, res) => {
  try {
    const applications = await Intern.find().sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fly8';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Intern Applications');

    sheet.columns = [
      { header: 'Full Name', key: 'fullName', width: 25 },
      { header: 'Email', key: 'email', width: 32 },
      { header: 'WhatsApp Number', key: 'whatsappNumber', width: 20 },
      { header: 'Gender', key: 'gender', width: 12 },
      { header: 'Present Address', key: 'presentAddress', width: 36 },
      { header: 'Permanent Address', key: 'permanentAddress', width: 36 },
      { header: 'ID Number', key: 'idNumber', width: 22 },
      { header: 'University', key: 'university', width: 30 },
      { header: 'Department', key: 'department', width: 26 },
      { header: 'Current Year', key: 'currentYear', width: 15 },
      { header: 'Academic Session', key: 'academicSession', width: 18 },
      { header: 'Career Goal', key: 'careerGoal', width: 22 },
      { header: 'Study Regions', key: 'studyRegions', width: 26 },
      { header: 'Facebook', key: 'facebook', width: 32 },
      { header: 'LinkedIn', key: 'linkedin', width: 32 },
      { header: 'Instagram', key: 'instagram', width: 26 },
      { header: 'Twitter', key: 'twitter', width: 26 },
      { header: 'TikTok', key: 'tiktok', width: 26 },
      { header: 'Applied At', key: 'createdAt', width: 22 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF063D3F' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 22;

    applications.forEach((app) => {
      const row = sheet.addRow({
        fullName: app.fullName || '',
        email: app.email || '',
        whatsappNumber: app.whatsappNumber || '',
        gender: app.gender || '',
        presentAddress: app.presentAddress || '',
        permanentAddress: app.permanentAddress || '',
        idNumber: app.idNumber || '',
        university: app.university || '',
        department: app.department || '',
        currentYear: app.currentYear || '',
        academicSession: app.academicSession || '',
        careerGoal: app.careerGoal || '',
        studyRegions: app.studyRegions || '',
        facebook: app.facebook || '',
        linkedin: app.linkedin || '',
        instagram: app.instagram || '',
        twitter: app.twitter || '',
        tiktok: app.tiktok || '',
        createdAt: app.createdAt ? new Date(app.createdAt).toLocaleString('en-GB') : '',
      });
      row.alignment = { vertical: 'top', wrapText: true };
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="intern-applications-${Date.now()}.xlsx"`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to export applications.' });
    }
  }
};

module.exports = {
  submitInternApplication,
  getAllInternApplications,
  exportInternApplicationsToExcel,
};
