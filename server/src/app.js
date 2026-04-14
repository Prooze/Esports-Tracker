require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('./db');

const authRoutes        = require('./routes/auth');
const gamesRoutes       = require('./routes/games');
const tournamentsRoutes = require('./routes/tournaments');
const adminRoutes       = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── First-boot superadmin provisioning ──────────────────────────────────────
async function provisionFirstAdmin() {
  const { FIRST_ADMIN_USER, FIRST_ADMIN_PASS } = process.env;
  if (!FIRST_ADMIN_USER || !FIRST_ADMIN_PASS) return;

  const { count } = db.prepare('SELECT COUNT(*) AS count FROM admins').get();
  if (count > 0) return;

  const hash = await bcrypt.hash(FIRST_ADMIN_PASS, 12);
  db.prepare(
    'INSERT INTO admins (username, password_hash, permissions, is_superadmin) VALUES (?, ?, ?, 1)'
  ).run(FIRST_ADMIN_USER.trim(), hash, '[]');

  console.log(`✓ First superadmin created: ${FIRST_ADMIN_USER.trim()}`);
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads/icons');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth',        authRoutes);
app.use('/api/games',       gamesRoutes);
app.use('/api/tournaments', tournamentsRoutes);
app.use('/api/admin',       adminRoutes);

provisionFirstAdmin().then(() => {
  app.listen(PORT, () => {
    console.log(`✓ Server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to provision first admin:', err);
  process.exit(1);
});
