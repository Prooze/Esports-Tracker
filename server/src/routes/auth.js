const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

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
    { expiresIn: '24h' }
  );

  res.json({ token });
});

module.exports = router;
