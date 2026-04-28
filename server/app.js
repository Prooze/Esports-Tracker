const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const db = require('./db');
const authRoutes        = require('./routes/auth');
const gamesRoutes       = require('./routes/games');
const tournamentsRoutes = require('./routes/tournaments');
const publicRoutes      = require('./routes/public');
const adminRoutes       = require('./routes/admin');

const { errorHandler } = require('./middleware/errorHandler');
const { checkAndCompleteUpcomingTournaments } = require('./services/completionChecker');
const {
  syncOrganizerTournaments,
  extractOrganizerSlug,
  getToken,
} = require('./services/startgg');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Add it to server/.env before starting.');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3001;
const BCRYPT_ROUNDS = 12;
const AUTO_SYNC_INTERVAL_MS  = 60 * 60 * 1000;
const SYNC_DAILY_THRESHOLD_H = 24;
const SYNC_WEEKLY_THRESHOLD_H = 24 * 7;

const app = express();

// ─── First-boot superadmin provisioning ──────────────────────────────────────
/**
 * If FIRST_ADMIN_USER and FIRST_ADMIN_PASS are set in the environment AND no
 * admin exists yet, create a superadmin from those credentials. Lets fresh
 * deployments bootstrap without running the script manually.
 */
async function provisionFirstAdmin() {
  const { FIRST_ADMIN_USER, FIRST_ADMIN_PASS } = process.env;
  if (!FIRST_ADMIN_USER || !FIRST_ADMIN_PASS) return;

  const { count } = db.prepare('SELECT COUNT(*) AS count FROM admins').get();
  if (count > 0) return;

  const hash = await bcrypt.hash(FIRST_ADMIN_PASS, BCRYPT_ROUNDS);
  db.prepare(
    'INSERT INTO admins (username, password_hash, permissions, is_superadmin) VALUES (?, ?, ?, 1)'
  ).run(FIRST_ADMIN_USER.trim(), hash, '[]');

  console.log(`✓ First superadmin created: ${FIRST_ADMIN_USER.trim()}`);
}

// ─── Static uploads (legacy local-storage fallback) ──────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLIENT_ORIGIN,
  // CLIENT_URL is the legacy name — kept as a fallback so existing deployments
  // are not broken; operators should migrate to CLIENT_ORIGIN.
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api', publicRoutes);
app.use('/api/auth',        authRoutes);
app.use('/api/games',       gamesRoutes);
app.use('/api/tournaments', tournamentsRoutes);
app.use('/api/admin',       adminRoutes);

// Catch-all error handler (must be last)
app.use(errorHandler);

// ─── Auto-sync scheduler ─────────────────────────────────────────────────────
/**
 * Periodic background sync: pulls fresh tournaments from a configured organizer
 * and rolls up any completed events. Respects the admin's sync frequency setting.
 */
async function runAutoSync() {
  try {
    const freq = db.prepare("SELECT value FROM settings WHERE key = 'startgg_sync_frequency'").get()?.value;
    if (!freq || freq === 'manual') return;

    const lastSynced = db.prepare("SELECT value FROM settings WHERE key = 'startgg_last_synced'").get()?.value;
    if (lastSynced) {
      const hoursSince = (Date.now() - new Date(lastSynced).getTime()) / 3_600_000;
      if (freq === 'daily'  && hoursSince < SYNC_DAILY_THRESHOLD_H)  return;
      if (freq === 'weekly' && hoursSince < SYNC_WEEKLY_THRESHOLD_H) return;
    }

    const orgUrl = db.prepare("SELECT value FROM settings WHERE key = 'startgg_organizer_url'").get()?.value;
    if (!orgUrl) return;
    const slug = orgUrl.includes('start.gg') ? extractOrganizerSlug(orgUrl) : orgUrl;
    if (!slug) return;

    const token = getToken();
    if (!token) return;

    const result = await syncOrganizerTournaments(slug, token);
    const now = new Date().toISOString();
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    upsert.run('startgg_last_synced', now);
    upsert.run('startgg_last_sync_result', JSON.stringify(result));
    console.log('[auto-sync] Organizer sync complete:', result);

    const completionResult = await checkAndCompleteUpcomingTournaments();
    if (completionResult.completed > 0) {
      console.log('[auto-sync] Completion check:', completionResult);
    }
  } catch (err) {
    console.error('[auto-sync] Error:', err.message);
  }
}

setInterval(runAutoSync, AUTO_SYNC_INTERVAL_MS);

// ─── Server start ────────────────────────────────────────────────────────────
provisionFirstAdmin().then(() => {
  app.listen(PORT, () => {
    console.log(`✓ Server running at http://localhost:${PORT}`);
    checkAndCompleteUpcomingTournaments()
      .then((r) => console.log(`[startup] Completion check done — checked ${r.checked}, imported ${r.completed}`))
      .catch((err) => console.error('[startup] Completion check error:', err.message));
  });
}).catch((err) => {
  console.error('Failed to provision first admin:', err);
  process.exit(1);
});

module.exports = app;
