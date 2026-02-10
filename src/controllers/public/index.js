/**
 * Public Controllers Index
 * Exports all public controllers for marketing website
 */

const universityController = require('./universityController');
const programController = require('./programController');
const countryController = require('./countryController');
const blogController = require('./blogController');
const eventController = require('./eventController');
const contactController = require('./contactController');

module.exports = {
  universityController,
  programController,
  countryController,
  blogController,
  eventController,
  contactController,
};
