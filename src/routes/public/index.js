/**
 * Public Routes Index
 * Exports all public routes for marketing website
 */

const universitiesRouter = require('./universities');
const programsRouter = require('./programs');
const countriesRouter = require('./countries');
const blogsRouter = require('./blogs');
const eventsRouter = require('./events');
const contactRouter = require('./contact');

module.exports = {
  universitiesRouter,
  programsRouter,
  countriesRouter,
  blogsRouter,
  eventsRouter,
  contactRouter,
};
