const db = require('../db');
const { getPoints } = require('./points');
const {
  startggQuery,
  getToken,
  extractTournamentSlug,
  TOURNAMENT_STATUS_QUERY,
} = require('./startgg');

const LOG_RING_SIZE = 100;
const LOG_DISPLAY_LIMIT = 20;

/** In-memory ring buffer of recent log entries, exposed via API for admins. */
const completionLog = [];

function clog(level, msg) {
  const entry = { ts: new Date().toISOString(), level, msg };
  if (level === 'error') console.error(`[completion-check] ${msg}`);
  else console.log(`[completion-check] ${msg}`);
  completionLog.push(entry);
  if (completionLog.length > LOG_RING_SIZE) completionLog.shift();
}

/**
 * Return the most recent completion-checker log entries, newest first.
 * @returns {Array<{ts:string, level:string, msg:string}>} Up to 20 log entries.
 */
function getRecentLog() {
  return [...completionLog].reverse().slice(0, LOG_DISPLAY_LIMIT);
}

// start.gg uses numeric state codes — 2=ACTIVE, 3=COMPLETED — but older
// responses sometimes return string variants. Treat both as equivalent.
const stateNum = (s) => (typeof s === 'number' ? s : parseInt(s, 10));
const isStateCompleted = (s) => stateNum(s) === 3 || s === 'COMPLETED';
const isStateActive    = (s) => stateNum(s) === 2 || s === 'ACTIVE';

/**
 * An event is effectively complete if any of:
 *   1. event.state is COMPLETED, OR
 *   2. every phase is COMPLETED (and at least one phase exists), OR
 *   3. standings contain a placement=1 entry with ≥ 2 nodes (bracket resolved).
 *
 * The third clause catches edge cases where start.gg leaves an event in
 * "active" state long after the bracket has finished.
 */
function isEventEffectivelyComplete(event) {
  if (isStateCompleted(event.state)) return true;

  const phases = event.phases || [];
  if (phases.length > 0 && phases.every((p) => isStateCompleted(p.state))) return true;

  const nodes = event.standings?.nodes ?? [];
  if (nodes.length >= 2 && nodes.some((n) => n.placement === 1)) return true;

  return false;
}

/**
 * Pick the best matching event for an upcoming tournament. Prefers exact
 * videogame match, falls back to any complete event, then any active one.
 */
function pickEvent(upcoming, events) {
  if (!events || events.length === 0) return null;

  if (upcoming.game_name) {
    const exact = events.find(
      (e) => e.videogame?.name?.toLowerCase() === upcoming.game_name.toLowerCase()
    );
    if (exact) return exact;
  }

  const effectiveDone = events.find(isEventEffectivelyComplete);
  if (effectiveDone) return effectiveDone;

  const activeEvt = events.find((e) => isStateActive(e.state));
  if (activeEvt) return activeEvt;

  return events[0];
}

/**
 * Persist standings rows from a matched event into the `tournaments` and
 * `standings` tables. Wraps inserts in a single SQLite transaction.
 *
 * @returns {{tournamentId:number|null, count:number}}
 */
function insertStandingsForEvent(upcoming, tournamentName, matchedEvent) {
  const nodes = matchedEvent.standings?.nodes ?? [];
  if (nodes.length === 0) return { tournamentId: null, count: 0 };

  const tResult = db.prepare(
    `INSERT INTO tournaments (startgg_id, name, event_name, game_id, date, auto_imported)
     VALUES (?, ?, ?, ?, ?, 1)`
  ).run(
    String(matchedEvent.id),
    tournamentName,
    matchedEvent.name || null,
    upcoming.game_id,
    upcoming.event_date,
  );

  const tournamentId = tResult.lastInsertRowid;
  const ins = db.prepare(
    'INSERT INTO standings (tournament_id, player_name, placement, points) VALUES (?, ?, ?, ?)'
  );

  db.transaction(() => {
    for (const node of nodes) {
      const participants = node.entrant?.participants ?? [];
      const playerName = participants
        .map((p) => p.prefix ? `${p.prefix} | ${p.gamerTag}` : p.gamerTag)
        .join(' / ') || 'Unknown';
      ins.run(tournamentId, playerName, node.placement, getPoints(node.placement));
    }
  })();

  return { tournamentId, count: nodes.length };
}

/**
 * Force-import standings for a single upcoming tournament regardless of state.
 * Used by the admin "Import Standings" button when start.gg has stale state.
 *
 * @returns {Promise<{success:true, tournament_id:number, count:number, already_imported?:boolean}|{success:false, status:number, message:string}>}
 */
async function forceImportUpcoming(upcomingId) {
  const upcoming = db.prepare(`
    SELECT u.*, g.name AS game_name
    FROM upcoming_tournaments u
    LEFT JOIN games g ON u.game_id = g.id
    WHERE u.id = ?
  `).get(upcomingId);

  if (!upcoming) return { success: false, status: 404, message: 'Upcoming tournament not found' };
  if (!upcoming.startgg_url) return { success: false, status: 400, message: 'No start.gg URL set for this tournament' };

  const token = getToken();
  if (!token) return { success: false, status: 400, message: 'No start.gg API token configured' };

  const slug = extractTournamentSlug(upcoming.startgg_url);
  if (!slug) return { success: false, status: 400, message: `Could not parse tournament slug from "${upcoming.startgg_url}"` };

  clog('info', `[force-import] #${upcoming.id} "${upcoming.name}": querying slug="${slug}"`);
  const data = await startggQuery(TOURNAMENT_STATUS_QUERY, { slug }, token);
  const t = data.tournament;
  if (!t) return { success: false, status: 404, message: 'Tournament not found on start.gg' };

  const matchedEvent = pickEvent(upcoming, t.events || []);
  if (!matchedEvent) return { success: false, status: 400, message: 'No events found for this tournament on start.gg' };

  const nodes = matchedEvent.standings?.nodes ?? [];
  if (nodes.length === 0) {
    return {
      success: false,
      status: 400,
      message: `No standings available yet for "${matchedEvent.name}" (tournament state: ${t.state}, event state: ${matchedEvent.state}). The event may still be in progress.`,
    };
  }

  const alreadyImported = db.prepare('SELECT id FROM tournaments WHERE startgg_id = ?').get(String(matchedEvent.id));
  if (alreadyImported) {
    db.prepare('UPDATE upcoming_tournaments SET status = ?, linked_tournament_id = ? WHERE id = ?')
      .run('completed', alreadyImported.id, upcoming.id);
    clog('info', `[force-import] #${upcoming.id}: already imported as tournament #${alreadyImported.id}`);
    return { success: true, already_imported: true, tournament_id: alreadyImported.id, count: 0 };
  }

  const { tournamentId, count } = insertStandingsForEvent(upcoming, t.name, matchedEvent);
  db.prepare('UPDATE upcoming_tournaments SET status = ?, linked_tournament_id = ? WHERE id = ?')
    .run('completed', tournamentId, upcoming.id);

  clog('info', `[force-import] #${upcoming.id}: ✓ imported "${t.name}" — "${matchedEvent.name}" (${count} players)`);
  return { success: true, tournament_id: tournamentId, count };
}

/**
 * Sweep every overdue upcoming tournament with a start.gg URL, query the API
 * to see if it's complete, and auto-import its standings if so. Triggered
 * manually via the admin UI and on a schedule via the auto-sync interval.
 *
 * @returns {Promise<{checked:number, completed:number}>}
 */
async function checkAndCompleteUpcomingTournaments() {
  const token = getToken();
  if (!token) {
    clog('warn', 'No start.gg token configured — skipping completion check');
    return { checked: 0, completed: 0 };
  }

  const today = new Date().toISOString().split('T')[0];
  const candidates = db.prepare(`
    SELECT u.*, g.name AS game_name
    FROM upcoming_tournaments u
    LEFT JOIN games g ON u.game_id = g.id
    WHERE u.startgg_url IS NOT NULL
      AND u.startgg_url != ''
      AND u.event_date < ?
      AND u.status = 'upcoming'
  `).all(today);

  clog('info', `=== Completion check started — ${candidates.length} candidate(s) with event_date < ${today} ===`);

  let completed = 0;
  const now = new Date().toISOString();
  const updateChecked = db.prepare('UPDATE upcoming_tournaments SET last_checked_at = ? WHERE id = ?');

  for (const upcoming of candidates) {
    const slug = extractTournamentSlug(upcoming.startgg_url);
    if (!slug) {
      clog('error', `#${upcoming.id} "${upcoming.name}": cannot extract slug from URL "${upcoming.startgg_url}" — skipping`);
      updateChecked.run(now, upcoming.id);
      continue;
    }

    try {
      const data = await startggQuery(TOURNAMENT_STATUS_QUERY, { slug }, token);
      updateChecked.run(now, upcoming.id);

      const t = data.tournament;
      if (!t) {
        clog('error', `#${upcoming.id}: start.gg returned no tournament for slug="${slug}"`);
        continue;
      }

      const matchedEvent = pickEvent(upcoming, t.events || []);
      if (!matchedEvent) {
        clog('warn', `#${upcoming.id}: no events returned — cannot import`);
        continue;
      }

      const tournamentDone = isStateCompleted(t.state);
      const eventEffDone   = isEventEffectivelyComplete(matchedEvent);

      if (!tournamentDone && !eventEffDone) {
        clog('info', `#${upcoming.id}: not yet complete — skipping (tournament=${t.state}, event=${matchedEvent.state})`);
        continue;
      }

      const alreadyImported = db.prepare('SELECT id FROM tournaments WHERE startgg_id = ?').get(String(matchedEvent.id));
      if (alreadyImported) {
        clog('info', `#${upcoming.id}: event already imported as tournament #${alreadyImported.id} — marking completed`);
        db.prepare('UPDATE upcoming_tournaments SET status = ?, linked_tournament_id = ? WHERE id = ?')
          .run('completed', alreadyImported.id, upcoming.id);
        continue;
      }

      const nodes = matchedEvent.standings?.nodes ?? [];
      if (nodes.length === 0) {
        clog('warn', `#${upcoming.id}: event is completed but 0 standings nodes returned — leaving for retry`);
        continue;
      }

      const { tournamentId, count } = insertStandingsForEvent(upcoming, t.name, matchedEvent);
      db.prepare('UPDATE upcoming_tournaments SET status = ?, linked_tournament_id = ? WHERE id = ?')
        .run('completed', tournamentId, upcoming.id);

      completed++;
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('auto_import_last_at', now);
      clog('info', `#${upcoming.id}: ✓ imported "${t.name}" — "${matchedEvent.name}" (${count} players)`);
    } catch (err) {
      clog('error', `#${upcoming.id} "${upcoming.name}": API error — ${err.message}`);
    }
  }

  clog('info', `=== Completion check done — checked ${candidates.length}, imported ${completed} ===`);
  return { checked: candidates.length, completed };
}

module.exports = {
  checkAndCompleteUpcomingTournaments,
  forceImportUpcoming,
  insertStandingsForEvent,
  getRecentLog,
};
