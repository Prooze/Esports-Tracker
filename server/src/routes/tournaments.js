const express = require('express');
const db = require('../db');

const router = express.Router();

// Standings for a specific tournament
router.get('/:id/standings', (req, res) => {
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  const standings = db.prepare(
    'SELECT * FROM standings WHERE tournament_id = ? ORDER BY placement ASC'
  ).all(req.params.id);

  res.json({ tournament, standings });
});

module.exports = router;
