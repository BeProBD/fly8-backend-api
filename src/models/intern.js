const mongoose = require('mongoose');

const internSchema = new mongoose.Schema(
  {
    fullName: String,
    whatsappNumber: String,
    email: String,
    gender: String,
    presentAddress: String,
    permanentAddress: String,
    idNumber: String,
    university: String,
    department: String,
    currentYear: String,
    academicSession: String,
    careerGoal: String,
    studyRegions: String,
    facebook: String,
    linkedin: String,
    instagram: String,
    twitter: String,
    tiktok: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Intern', internSchema);
