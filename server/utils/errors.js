/**
 * Send a standardised JSON error response.
 *
 * Shape: `{ error: true, message: "..." }`. The boolean `error` flag lets
 * clients distinguish error responses cheaply, and `message` is human-readable.
 *
 * @param {import('express').Response} res
 * @param {number} status HTTP status code
 * @param {string} message Description shown to the client
 */
function sendError(res, status, message) {
  return res.status(status).json({ error: true, message });
}

module.exports = { sendError };
