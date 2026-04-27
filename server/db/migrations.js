/**
 * Schema migrations. Each statement is wrapped in try/catch so it's a no-op
 * when already applied (e.g. duplicate column names). Append new migrations
 * to the bottom of the array — never edit existing entries.
 */
const MIGRATIONS = [
  `ALTER TABLE games   ADD COLUMN icon_path     TEXT`,
  `ALTER TABLE admins  ADD COLUMN permissions   TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE admins  ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS pending_games (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    game_name              TEXT NOT NULL,
    tournament_name        TEXT NOT NULL,
    startgg_tournament_url TEXT,
    event_date             TEXT,
    created_at             DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `ALTER TABLE upcoming_tournaments ADD COLUMN status                 TEXT NOT NULL DEFAULT 'upcoming'`,
  `ALTER TABLE upcoming_tournaments ADD COLUMN last_checked_at        TEXT`,
  `ALTER TABLE upcoming_tournaments ADD COLUMN linked_tournament_id   INTEGER REFERENCES tournaments(id)`,
  `ALTER TABLE tournaments          ADD COLUMN auto_imported          INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tournaments          ADD COLUMN recording_url          TEXT`,
  `ALTER TABLE upcoming_tournaments ADD COLUMN recording_url          TEXT`,
  `ALTER TABLE upcoming_tournaments ADD COLUMN registration_closes_at TEXT`,
  // Remove duplicate upcoming_tournaments rows, keeping the oldest per startgg_url
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
  // Index on status — column is added earlier in this list, so this is safe to run after
  `CREATE INDEX IF NOT EXISTS idx_upcoming_status ON upcoming_tournaments(status)`,
];

/**
 * Heals malformed start.gg URLs that may have slipped in from older code paths
 * (duplicated `tournament/` prefix, missing protocol, missing `/register` suffix).
 * @param {import('better-sqlite3').Database} db
 */
function fixStartggUrls(db) {
  const fix = (raw) => {
    const m = raw && raw.match(/start\.gg\/tournament\/(?:tournament\/)?([^/?#]+)/);
    return m ? `https://www.start.gg/tournament/${m[1]}/register` : null;
  };

  const heal = (selectSql, updateSql, urlField) => {
    const rows = db.prepare(selectSql).all();
    const update = db.prepare(updateSql);
    for (const row of rows) {
      const fixed = fix(row[urlField]);
      if (fixed && fixed !== row[urlField]) update.run(fixed, row.id);
    }
  };

  try {
    heal(
      'SELECT id, startgg_url FROM upcoming_tournaments WHERE startgg_url IS NOT NULL',
      'UPDATE upcoming_tournaments SET startgg_url = ? WHERE id = ?',
      'startgg_url'
    );
    heal(
      'SELECT id, startgg_tournament_url FROM pending_games WHERE startgg_tournament_url IS NOT NULL',
      'UPDATE pending_games SET startgg_tournament_url = ? WHERE id = ?',
      'startgg_tournament_url'
    );
  } catch (_) {
    // Tables may not yet exist on first run
  }
}

/**
 * Run all pending migrations. Existing migrations are no-ops.
 * @param {import('better-sqlite3').Database} db
 */
function runMigrations(db) {
  for (const sql of MIGRATIONS) {
    try { db.exec(sql); } catch (_) { /* already applied */ }
  }
  fixStartggUrls(db);
}

module.exports = { runMigrations };
