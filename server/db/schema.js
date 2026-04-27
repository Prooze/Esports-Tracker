/**
 * Initial CREATE TABLE statements. Idempotent — uses IF NOT EXISTS so it's safe
 * to run on every boot. Schema changes after the initial release should be added
 * as migrations in db/migrations.js, not here.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS admins (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login    DATETIME
  );

  CREATE TABLE IF NOT EXISTS games (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    icon_emoji TEXT DEFAULT '🎮',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tournaments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    startgg_id TEXT,
    name       TEXT NOT NULL,
    event_name TEXT,
    game_id    INTEGER REFERENCES games(id) ON DELETE CASCADE,
    date       TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS standings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    player_name   TEXT NOT NULL,
    placement     INTEGER NOT NULL,
    points        INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
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

  CREATE INDEX IF NOT EXISTS idx_tournaments_game_date ON tournaments(game_id, date);
  CREATE INDEX IF NOT EXISTS idx_standings_tournament  ON standings(tournament_id);
  CREATE INDEX IF NOT EXISTS idx_upcoming_event_date   ON upcoming_tournaments(event_date);
`;

const BRANDING_DEFAULTS = [
  ['site_name',           'Esports Standings'],
  ['site_tagline',        'Local Circuit'],
  ['primary_color',       '#7c6fff'],
  ['accent_color',        '#7c6fff'],
  ['footer_links',        '[]'],
  ['social_links',        '[]'],
  ['announcement_text',   ''],
  ['announcement_active', 'false'],
];

/**
 * Applies the base schema and seeds default branding settings.
 * Safe to call repeatedly — all statements are idempotent.
 * @param {import('better-sqlite3').Database} db
 */
function applySchema(db) {
  db.exec(SCHEMA);

  const seed = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of BRANDING_DEFAULTS) seed.run(key, value);
}

module.exports = { applySchema };
