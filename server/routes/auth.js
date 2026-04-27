const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { sendError } = require('../utils/errors');
const { asyncHandler } = require('../middleware/errorHandler');
const { loginLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const TOKEN_TTL = '24h';

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Returns: { token } on success.
 */
router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return sendError(res, 400, 'Username and password required');

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin) return sendError(res, 401, 'Invalid username or password');

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) return sendError(res, 401, 'Invalid username or password');

  db.prepare('UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(admin.id);

  const token = jwt.sign(
    {
      admin: true,
      id: admin.id,
      username: admin.username,
      permissions: JSON.parse(admin.permissions || '[]'),
      is_superadmin: admin.is_superadmin === 1,
    },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );

  res.json({ token });
}));

module.exports = router;
