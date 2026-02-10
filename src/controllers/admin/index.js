/**
 * Admin Controllers Index
 * Exports all admin content management controllers (super_admin only)
 */

const universityController = require('./universityController');
const programController = require('./programController');
const countryController = require('./countryController');
const blogController = require('./blogController');
const eventController = require('./eventController');

module.exports = {
  universityController,
  programController,
  countryController,
  blogController,
  eventController,
};
