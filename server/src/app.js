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

// Keep /uploads static serving for any legacy local images (no-op if dir absent)
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

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

// ─── Public settings endpoint (no auth) ──────────────────────────────────────
app.get('/api/settings/public', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const raw = {};
  for (const { key, value } of rows) raw[key] = value;

  // Strip sensitive keys
  delete raw.startgg_token;
  delete raw.cloudinary_api_key;
  delete raw.cloudinary_api_secret;

  // Parse JSON fields
  let footer_links = [];
  let social_links = [];
  try { footer_links = JSON.parse(raw.footer_links || '[]'); } catch (_) {}
  try { social_links = JSON.parse(raw.social_links || '[]'); } catch (_) {}

  const toPath = (v) => (v && v.trim()) ? v : null;

  // SQLite stores values as text; accept 'true', '1', or boolean true
  const activeRaw = raw.announcement_active;
  const announcementActive = activeRaw === 'true' || activeRaw === '1' || activeRaw === true;

  console.log('[settings/public] announcement_active raw:', JSON.stringify(activeRaw), '→', announcementActive);
  console.log('[settings/public] announcement_text:', JSON.stringify(raw.announcement_text));

  res.json({
    site_name:           raw.site_name           || 'Esports Standings',
    site_tagline:        raw.site_tagline         || 'Local Circuit',
    site_logo:           toPath(raw.site_logo),
    site_favicon:        toPath(raw.site_favicon),
    hero_banner:         toPath(raw.hero_banner),
    primary_color:       raw.primary_color        || '#7c6fff',
    accent_color:        raw.accent_color         || '#7c6fff',
    announcement_text:   raw.announcement_text    || '',
    announcement_active: announcementActive,
    footer_links,
    social_links,
  });
});

// ─── Public upcoming tournaments (no auth) ───────────────────────────────────
app.get('/api/upcoming', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const rows = db.prepare(`
    SELECT u.*, g.name AS game_name, g.icon_emoji, g.icon_path
    FROM upcoming_tournaments u
    LEFT JOIN games g ON u.game_id = g.id
    WHERE u.event_date >= ?
    ORDER BY u.event_date ASC
  `).all(today);
  res.json(rows);
});

// Upcoming tournaments for a specific game (no auth)
app.get('/api/upcoming/game/:gameId', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const rows = db.prepare(`
    SELECT u.*, g.name AS game_name, g.icon_emoji, g.icon_path
    FROM upcoming_tournaments u
    LEFT JOIN games g ON u.game_id = g.id
    WHERE u.game_id = ? AND u.event_date >= ?
    ORDER BY u.event_date ASC
  `).all(req.params.gameId, today);
  res.json(rows);
});

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
