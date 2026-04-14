const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Returns middleware that checks the decoded JWT for a specific permission.
// Superadmins always pass. Must be used after requireAuth.
function checkPermission(permission) {
  return (req, res, next) => {
    if (req.admin?.is_superadmin) return next();
    const perms = Array.isArray(req.admin?.permissions) ? req.admin.permissions : [];
    if (perms.includes(permission)) return next();
    return res.status(403).json({ error: "You don't have permission to perform this action." });
  };
}

module.exports = requireAuth;
module.exports.checkPermission = checkPermission;
