const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || '/app/data/database.sqlite';
const dataDir = path.dirname(DB_PATH);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login   DATETIME
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon_emoji TEXT DEFAULT '🎮',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    startgg_id TEXT,
    name TEXT NOT NULL,
    event_name TEXT,
    game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
    date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS standings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    player_name TEXT NOT NULL,
    placement INTEGER NOT NULL,
    points INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS upcoming_tournaments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    game_id     INTEGER REFERENCES games(id) ON DELETE SET NULL,
    event_date  TEXT NOT NULL,
    location    TEXT,
    startgg_url TEXT,
    description TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrations — each wrapped in try/catch so they're skipped if already done
const migrations = [
  `ALTER TABLE games   ADD COLUMN icon_path    TEXT`,
  `ALTER TABLE admins  ADD COLUMN permissions  TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE admins  ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS pending_games (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    game_name             TEXT NOT NULL,
    tournament_name       TEXT NOT NULL,
    startgg_tournament_url TEXT,
    event_date            TEXT,
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `ALTER TABLE upcoming_tournaments ADD COLUMN status TEXT NOT NULL DEFAULT 'upcoming'`,
  `ALTER TABLE upcoming_tournaments ADD COLUMN last_checked_at TEXT`,
  `ALTER TABLE upcoming_tournaments ADD COLUMN linked_tournament_id INTEGER REFERENCES tournaments(id)`,
  `ALTER TABLE tournaments ADD COLUMN auto_imported INTEGER NOT NULL DEFAULT 0`,
  // Remove duplicate upcoming_tournaments rows, keeping the oldest (MIN id) per startgg_url
  `DELETE FROM upcoming_tournaments
   WHERE startgg_url IS NOT NULL
     AND id NOT IN (
       SELECT MIN(id) FROM upcoming_tournaments
       WHERE startgg_url IS NOT NULL
       GROUP BY startgg_url
     )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_upcoming_startgg_url
   ON upcoming_tournaments(startgg_url)
   WHERE startgg_url IS NOT NULL`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) {}
}

// Fix malformed start.gg tournament URLs (tournament/ prefix duplication, missing www, missing /register)
try {
  const rows = db.prepare('SELECT id, startgg_url FROM upcoming_tournaments WHERE startgg_url IS NOT NULL').all();
  const update = db.prepare('UPDATE upcoming_tournaments SET startgg_url = ? WHERE id = ?');
  for (const row of rows) {
    const m = row.startgg_url.match(/start\.gg\/tournament\/(?:tournament\/)?([^/?#]+)/);
    if (m) {
      const fixed = `https://www.start.gg/tournament/${m[1]}/register`;
      if (fixed !== row.startgg_url) update.run(fixed, row.id);
    }
  }
  const pgRows = db.prepare('SELECT id, startgg_tournament_url FROM pending_games WHERE startgg_tournament_url IS NOT NULL').all();
  const pgUpdate = db.prepare('UPDATE pending_games SET startgg_tournament_url = ? WHERE id = ?');
  for (const row of pgRows) {
    const m = row.startgg_tournament_url.match(/start\.gg\/tournament\/(?:tournament\/)?([^/?#]+)/);
    if (m) {
      const fixed = `https://www.start.gg/tournament/${m[1]}/register`;
      if (fixed !== row.startgg_tournament_url) pgUpdate.run(fixed, row.id);
    }
  }
} catch (_) {}

// Seed default branding settings (INSERT OR IGNORE so they're never overwritten)
const brandingDefaults = [
  ['site_name',           'Esports Standings'],
  ['site_tagline',        'Local Circuit'],
  ['primary_color',       '#7c6fff'],
  ['accent_color',        '#7c6fff'],
  ['footer_links',        '[]'],
  ['social_links',        '[]'],
  ['announcement_text',   ''],
  ['announcement_active', 'false'],
];
const seedSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of brandingDefaults) {
  seedSetting.run(key, value);
}

module.exports = db;
