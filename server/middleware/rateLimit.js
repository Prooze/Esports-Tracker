const { sendError } = require('../utils/errors');

/**
 * Lightweight in-memory rate limiter. We avoid pulling in `express-rate-limit`
 * to keep the dependency footprint small — this app runs as a single process
 * on a single host (Railway), so a Map keyed by IP is sufficient.
 *
 * @param {object} opts
 * @param {number} opts.windowMs Sliding window length in milliseconds
 * @param {number} opts.max Max attempts per IP per window
 * @param {string} [opts.message] Response message when blocked
 */
function rateLimit({ windowMs, max, message = 'Too many attempts. Please try again later.' }) {
  const buckets = new Map();

  return (req, res, next) => {
    const key = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();

    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count++;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return sendError(res, 429, message);
    }

    next();
  };
}

/** 5 login attempts per IP per 15 minutes — protects bcrypt from brute-force. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.',
});

module.exports = { rateLimit, loginLimiter };
