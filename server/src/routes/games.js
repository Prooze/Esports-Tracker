const express = require('express');
const db = require('../db');

const router = express.Router();

// List all games
router.get('/', (req, res) => {
  const games = db.prepare('SELECT * FROM games ORDER BY name').all();
  res.json(games);
});

// Years that have tournament data for a game
router.get('/:id/years', (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const years = db
    .prepare(
      `SELECT DISTINCT strftime('%Y', date) AS year
       FROM tournaments
       WHERE game_id = ? AND date IS NOT NULL
       ORDER BY year DESC`
    )
    .all(req.params.id)
    .map((r) => r.year);

  res.json({ game, years });
});

// Season standings leaderboard for a game
router.get('/:id/standings', (req, res) => {
  const { id } = req.params;
  const year = req.query.year || new Date().getFullYear().toString();

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const rows = db.prepare(`
    SELECT
      s.player_name,
      SUM(s.points)                                        AS total_points,
      COUNT(CASE WHEN s.placement = 1 THEN 1 END)         AS wins,
      COUNT(CASE WHEN s.placement <= 3 THEN 1 END)        AS top3,
      COUNT(DISTINCT s.tournament_id)                      AS tournaments_played
    FROM standings s
    JOIN tournaments t ON s.tournament_id = t.id
    WHERE t.game_id = ? AND strftime('%Y', t.date) = ?
    GROUP BY s.player_name
    ORDER BY total_points DESC, wins DESC, top3 DESC
  `).all(id, year);

  // Standard competition ranking (1, 1, 3, 4, 4, 6…)
  // Players with equal total_points share the same rank; the next rank skips
  // a number of positions equal to the size of the tied group.
  let rank = 1;
  const standings = rows.map((row, i) => {
    if (i > 0 && row.total_points !== rows[i - 1].total_points) rank = i + 1;
    return { ...row, rank };
  });

  res.json({ game, year, standings });
});

// Tournaments for a game in a given year
router.get('/:id/tournaments', (req, res) => {
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
});

module.exports = router;
