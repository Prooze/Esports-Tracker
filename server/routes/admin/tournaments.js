const express = require('express');
const db = require('../../db');
const { checkPermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { sendError } = require('../../utils/errors');
const {
  checkAndCompleteUpcomingTournaments,
  getRecentLog,
} = require('../../services/completionChecker');

const router = express.Router();

/** GET /api/admin/tournaments — full list with player counts, sorted newest first. */
router.get('/', (_req, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT t.*, g.name AS game_name, g.icon_emoji, COUNT(s.id) AS player_count
      FROM tournaments t
      LEFT JOIN games g ON t.game_id = g.id
      LEFT JOIN standings s ON s.tournament_id = t.id
      GROUP BY t.id
      ORDER BY t.date DESC, t.created_at DESC
    `).all();
    res.json(rows);
  } catch (err) { next(err); }
});

/** POST /api/admin/tournaments — manual creation. */
router.post('/', checkPermission('manage_tournaments'), (req, res, next) => {
  try {
    const { name, event_name, game_id, date, startgg_id } = req.body;
    if (!name || !game_id) return sendError(res, 400, 'name and game_id are required');

    const result = db.prepare(
      'INSERT INTO tournaments (startgg_id, name, event_name, game_id, date) VALUES (?, ?, ?, ?, ?)'
    ).run(startgg_id || null, name.trim(), event_name || null, game_id, date || null);

    res.status(201).json(db.prepare('SELECT * FROM tournaments WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { next(err); }
});

/** PUT /api/admin/tournaments/:id — update tournament metadata + recording URL. */
router.put('/:id', checkPermission('manage_tournaments'), (req, res, next) => {
  try {
    const { name, event_name, game_id, date, recording_url } = req.body;
    const { id } = req.params;

    if (!name?.trim()) return sendError(res, 400, 'name is required');

    const exists = db.prepare('SELECT id FROM tournaments WHERE id = ?').get(id);
    if (!exists) return sendError(res, 404, 'Tournament not found');

    db.prepare(
      `UPDATE tournaments SET name = ?, event_name = ?, game_id = ?, date = ?, recording_url = ?
       WHERE id = ?`
    ).run(name.trim(), event_name || null, game_id, date || null, recording_url || null, id);

    res.json(db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id));
  } catch (err) { next(err); }
});

/** DELETE /api/admin/tournaments/:id — also cascades to standings. */
router.delete('/:id', checkPermission('manage_tournaments'), (req, res, next) => {
  try {
    const exists = db.prepare('SELECT id FROM tournaments WHERE id = ?').get(req.params.id);
    if (!exists) return sendError(res, 404, 'Tournament not found');

    db.prepare('DELETE FROM tournaments WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/** POST /api/admin/tournaments/check-completions — manually trigger completion sweep. */
router.post('/check-completions', checkPermission('manage_tournaments'), asyncHandler(async (_req, res) => {
  const result = await checkAndCompleteUpcomingTournaments();
  res.json(result);
}));

/** GET /api/admin/tournaments/completion-log — recent log entries (newest first). */
router.get('/completion-log', checkPermission('manage_tournaments'), (_req, res, next) => {
  try {
    res.json(getRecentLog());
  } catch (err) { next(err); }
});

module.exports = router;
