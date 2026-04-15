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
`);

// Migrations — each wrapped in try/catch so they're skipped if the column exists
const migrations = [
  `ALTER TABLE games   ADD COLUMN icon_path    TEXT`,
  `ALTER TABLE admins  ADD COLUMN permissions  TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE admins  ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) {}
}

module.exports = db;
