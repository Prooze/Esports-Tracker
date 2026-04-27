const { sendError } = require('../utils/errors');

/**
 * Catch-all Express error handler. Mounted last so any thrown error or
 * `next(err)` call falls through here and produces a consistent JSON shape.
 */
function errorHandler(err, _req, res, _next) {
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  if (res.headersSent) return;
  sendError(res, err.status || 500, err.message || 'Internal server error');
}

/**
 * Wraps an async route handler so any rejection bubbles into errorHandler
 * instead of leaving the request hanging.
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncHandler };
