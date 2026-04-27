const express = require('express');
const db = require('../../db');
const { checkPermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { sendError } = require('../../utils/errors');
const { getPoints } = require('../../services/points');
const {
  getToken,
  extractTournamentSlug,
  extractOrganizerSlug,
  lookupTournament,
  fetchEventStandings,
  syncOrganizerTournaments,
} = require('../../services/startgg');
const { checkAndCompleteUpcomingTournaments } = require('../../services/completionChecker');

const router = express.Router();

const upsertSetting = (key, value) =>
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);

/**
 * POST /api/admin/startgg/lookup
 * Body: { url } — start.gg tournament URL
 * Returns the tournament metadata + events for the import wizard.
 */
router.post('/lookup', checkPermission('manage_tournaments'), asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) return sendError(res, 400, 'url required');

  const slug = extractTournamentSlug(url);
  if (!slug) return sendError(res, 400, 'Could not parse a tournament slug from that URL');

  const token = getToken();
  if (!token) return sendError(res, 400, 'No start.gg API token configured — set it in Settings');

  const tournament = await lookupTournament(slug, token);
  if (!tournament) return sendError(res, 404, 'Tournament not found on start.gg');
  res.json(tournament);
}));

/**
 * POST /api/admin/startgg/import
 * Body: { eventId, eventName, tournamentName, gameId, date }
 * Pulls the top-64 standings from a chosen start.gg event and inserts them.
 */
router.post('/import', checkPermission('manage_tournaments'), asyncHandler(async (req, res) => {
  const { eventId, eventName, tournamentName, gameId, date } = req.body;
  if (!eventId || !gameId) return sendError(res, 400, 'eventId and gameId are required');

  const token = getToken();
  if (!token) return sendError(res, 400, 'No start.gg API token configured');

  const nodes = await fetchEventStandings(eventId, token, 64);
  if (nodes.length === 0) return sendError(res, 400, 'No standings found for this event');

  const tResult = db.prepare(
    'INSERT INTO tournaments (startgg_id, name, event_name, game_id, date) VALUES (?, ?, ?, ?, ?)'
  ).run(String(eventId), tournamentName, eventName || null, gameId, date || null);

  const tournamentId = tResult.lastInsertRowid;
  const insertStanding = db.prepare(
    'INSERT INTO standings (tournament_id, player_name, placement, points) VALUES (?, ?, ?, ?)'
  );

  db.transaction(() => {
    for (const node of nodes) {
      insertStanding.run(tournamentId, node.entrant.name, node.placement, getPoints(node.placement));
    }
  })();

  res.status(201).json({
    tournament: db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId),
    count: nodes.length,
  });
}));

/**
 * POST /api/admin/startgg/sync-organizer
 * Body: { url } — start.gg user/org URL or bare slug
 * Pulls upcoming tournaments hosted by the organizer.
 */
router.post('/sync-organizer', checkPermission('manage_integrations'), asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) return sendError(res, 400, 'url is required');

  const slug = url.includes('start.gg') ? extractOrganizerSlug(url) : url;
  if (!slug) return sendError(res, 400, 'Could not parse organizer slug from URL');

  const token = getToken();
  if (!token) return sendError(res, 400, 'No start.gg API token configured — set it in Integrations');

  const result = await syncOrganizerTournaments(slug, token);
  const now = new Date().toISOString();
  upsertSetting('startgg_last_synced', now);
  upsertSetting('startgg_last_sync_result', JSON.stringify(result));

  // Take the opportunity to roll up any newly-completed events too
  try { await checkAndCompleteUpcomingTournaments(); } catch (_) { /* non-fatal */ }

  res.json({ ...result, synced_at: now });
}));

/** GET /api/admin/startgg/pending-games — unmatched games awaiting review. */
router.get('/pending-games', checkPermission('manage_games'), (_req, res, next) => {
  try {
    res.json(db.prepare('SELECT * FROM pending_games ORDER BY created_at DESC').all());
  } catch (err) { next(err); }
});

/**
 * POST /api/admin/startgg/pending-games/:id/approve
 * Promotes the named pending game into a real `games` row, then promotes
 * every other pending entry for the same game name into upcoming_tournaments.
 */
router.post('/pending-games/:id/approve', checkPermission('manage_games'), (req, res, next) => {
  try {
    const pending = db.prepare('SELECT * FROM pending_games WHERE id = ?').get(req.params.id);
    if (!pending) return sendError(res, 404, 'Pending game not found');

    const { game_name = pending.game_name, icon_emoji = '🎮' } = req.body;
    if (!game_name?.trim()) return sendError(res, 400, 'game_name is required');

    const gameResult = db.prepare(
      'INSERT INTO games (name, icon_emoji) VALUES (?, ?)'
    ).run(game_name.trim(), icon_emoji);
    const gameId = gameResult.lastInsertRowid;

    const siblings = db.prepare(
      'SELECT * FROM pending_games WHERE lower(game_name) = lower(?)'
    ).all(pending.game_name);

    let added = 0;
    for (const p of siblings) {
      const exists = p.startgg_tournament_url
        ? db.prepare('SELECT id FROM upcoming_tournaments WHERE startgg_url = ?').get(p.startgg_tournament_url)
        : db.prepare(
            'SELECT id FROM upcoming_tournaments WHERE name = ? AND event_date = ? AND game_id IS ?'
          ).get(p.tournament_name, p.event_date, gameId);
      if (!exists) {
        db.prepare(
          'INSERT INTO upcoming_tournaments (name, game_id, event_date, startgg_url) VALUES (?, ?, ?, ?)'
        ).run(p.tournament_name, gameId, p.event_date, p.startgg_tournament_url);
        added++;
      }
    }

    db.prepare('DELETE FROM pending_games WHERE lower(game_name) = lower(?)').run(pending.game_name);

    res.status(201).json({
      success: true,
      game: db.prepare('SELECT * FROM games WHERE id = ?').get(gameId),
      tournaments_added: added,
    });
  } catch (err) { next(err); }
});

/** DELETE /api/admin/startgg/pending-games/:id — dismiss without approving. */
router.delete('/pending-games/:id', checkPermission('manage_games'), (req, res, next) => {
  try {
    db.prepare('DELETE FROM pending_games WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
