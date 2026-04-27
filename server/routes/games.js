const express = require('express');
const db = require('../db');
const { sendError } = require('../utils/errors');

const router = express.Router();

/** GET /api/games — list all games. */
router.get('/', (_req, res, next) => {
  try {
    res.json(db.prepare('SELECT * FROM games ORDER BY name').all());
  } catch (err) { next(err); }
});

/** GET /api/games/:id/years — distinct years that have tournament data for a game. */
router.get('/:id/years', (req, res, next) => {
  try {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return sendError(res, 404, 'Game not found');

    const years = db.prepare(
      `SELECT DISTINCT strftime('%Y', date) AS year
       FROM tournaments
       WHERE game_id = ? AND date IS NOT NULL
       ORDER BY year DESC`
    ).all(req.params.id).map((r) => r.year);

    res.json({ game, years });
  } catch (err) { next(err); }
});

/**
 * GET /api/games/:id/standings?year=YYYY
 * Returns season leaderboard with standard competition ranking.
 * Tied players share the same rank; the next rank skips by the size of the tie.
 */
router.get('/:id/standings', (req, res, next) => {
  try {
    const { id } = req.params;
    const year = req.query.year || new Date().getFullYear().toString();

    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
    if (!game) return sendError(res, 404, 'Game not found');

    const rows = db.prepare(`
      SELECT
        s.player_name,
        SUM(s.points)                                AS total_points,
        COUNT(CASE WHEN s.placement = 1 THEN 1 END)  AS wins,
        COUNT(CASE WHEN s.placement <= 3 THEN 1 END) AS top3,
        COUNT(DISTINCT s.tournament_id)              AS tournaments_played
      FROM standings s
      JOIN tournaments t ON s.tournament_id = t.id
      WHERE t.game_id = ? AND strftime('%Y', t.date) = ?
      GROUP BY s.player_name
      ORDER BY total_points DESC, wins DESC, top3 DESC
    `).all(id, year);

    let rank = 1;
    const standings = rows.map((row, i) => {
      if (i > 0 && row.total_points !== rows[i - 1].total_points) rank = i + 1;
      return { ...row, rank };
    });

    res.json({ game, year, standings });
  } catch (err) { next(err); }
});

/** GET /api/games/:id/tournaments?year=YYYY — tournaments for a game in a given year. */
router.get('/:id/tournaments', (req, res, next) => {
  try {
    const { id } = req.params;
    const year = req.query.year || new Date().getFullYear().toString();

    const tournaments = db.prepare(`
      SELECT t.*, COUNT(s.id) AS player_count
      FROM tournaments t
      LEFT JOIN standings s ON s.tournament_id = t.id
      WHERE t.game_id = ? AND strftime('%Y', t.date) = ?
      GROUP BY t.id
      ORDER BY t.date DESC
    `).all(id, year);

    res.json(tournaments);
  } catch (err) { next(err); }
});

module.exports = router;
