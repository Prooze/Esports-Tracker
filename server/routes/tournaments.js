const express = require('express');
const db = require('../db');
const { sendError } = require('../utils/errors');

const router = express.Router();

/** GET /api/tournaments/:id/standings — full standings list for a single tournament. */
router.get('/:id/standings', (req, res, next) => {
  try {
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
    if (!tournament) return sendError(res, 404, 'Tournament not found');

    const standings = db.prepare(
      'SELECT * FROM standings WHERE tournament_id = ? ORDER BY placement ASC'
    ).all(req.params.id);

    res.json({ tournament, standings });
  } catch (err) { next(err); }
});

module.exports = router;
