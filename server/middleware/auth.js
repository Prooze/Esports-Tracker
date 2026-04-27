const jwt = require('jsonwebtoken');
const { sendError } = require('../utils/errors');

/**
 * Verify the bearer JWT and attach the decoded payload to req.admin.
 * Returns 401 if the token is missing, 403 if invalid or expired.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return sendError(res, 401, 'Authentication required');

  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return sendError(res, 403, 'Invalid or expired token');
  }
}

/**
 * Returns middleware that ensures the logged-in admin holds `permission`.
 * Superadmins always pass. Must be used after `requireAuth`.
 */
function checkPermission(permission) {
  return (req, res, next) => {
    if (req.admin?.is_superadmin) return next();
    const perms = Array.isArray(req.admin?.permissions) ? req.admin.permissions : [];
    if (perms.includes(permission)) return next();
    return sendError(res, 403, "You don't have permission to perform this action.");
  };
}

module.exports = { requireAuth, checkPermission };
