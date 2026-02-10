/**
 * Admin Content Routes Index
 * Exports all admin content management routes (super_admin only)
 */

const universitiesRouter = require('./universities');
const programsRouter = require('./programs');
const countriesRouter = require('./countries');
const blogsRouter = require('./blogs');
const eventsRouter = require('./events');

module.exports = {
  universitiesRouter,
  programsRouter,
  countriesRouter,
  blogsRouter,
  eventsRouter,
};
