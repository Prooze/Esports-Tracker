const express = require('express');
const db = require('../../db');
const { checkPermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { sendError } = require('../../utils/errors');
const { forceImportUpcoming } = require('../../services/completionChecker');

const router = express.Router();

const REQUIRED_FIELDS = ['name', 'event_date'];

const validateBody = (body) => {
  for (const field of REQUIRED_FIELDS) {
    if (!body[field]) return `${field} is required`;
  }
  return null;
};

/** GET /api/admin/upcoming — list all upcoming tournaments (any status). */
router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT u.*, g.name AS game_name, g.icon_emoji
    FROM upcoming_tournaments u
    LEFT JOIN games g ON u.game_id = g.id
    ORDER BY u.event_date ASC
  `).all();
  res.json(rows);
});

/** POST /api/admin/upcoming — create one. Rejects duplicate start.gg URLs. */
router.post('/', checkPermission('manage_upcoming'), (req, res) => {
  const err = validateBody(req.body);
  if (err) return sendError(res, 400, err);

  const { name, game_id, event_date, location, startgg_url, description, registration_closes_at } = req.body;

  if (startgg_url) {
    const dup = db.prepare('SELECT id FROM upcoming_tournaments WHERE startgg_url = ?').get(startgg_url);
    if (dup) return sendError(res, 409, 'An upcoming tournament with that start.gg URL already exists');
  } else {
    const dup = db.prepare(
      'SELECT id FROM upcoming_tournaments WHERE name = ? AND event_date = ? AND game_id IS ?'
    ).get(name.trim(), event_date, game_id || null);
    if (dup) return sendError(res, 409, 'An upcoming tournament with the same name, date, and game already exists');
  }

  const result = db.prepare(
    `INSERT INTO upcoming_tournaments
     (name, game_id, event_date, location, startgg_url, description, registration_closes_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name.trim(),
    game_id || null,
    event_date,
    location || null,
    startgg_url || null,
    description || null,
    registration_closes_at || null,
  );

  res.status(201).json(
    db.prepare('SELECT * FROM upcoming_tournaments WHERE id = ?').get(result.lastInsertRowid)
  );
});

/** PUT /api/admin/upcoming/:id — full update. */
router.put('/:id', checkPermission('manage_upcoming'), (req, res) => {
  const err = validateBody(req.body);
  if (err) return sendError(res, 400, err);

  const { id } = req.params;
  const { name, game_id, event_date, location, startgg_url, description, registration_closes_at } = req.body;

  db.prepare(
    `UPDATE upcoming_tournaments
     SET name = ?, game_id = ?, event_date = ?, location = ?, startgg_url = ?,
         description = ?, registration_closes_at = ?
     WHERE id = ?`
  ).run(
    name.trim(),
    game_id || null,
    event_date,
    location || null,
    startgg_url || null,
    description || null,
    registration_closes_at || null,
    id,
  );

  res.json(db.prepare('SELECT * FROM upcoming_tournaments WHERE id = ?').get(id));
});

/** DELETE /api/admin/upcoming/:id */
router.delete('/:id', checkPermission('manage_upcoming'), (req, res) => {
  db.prepare('DELETE FROM upcoming_tournaments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

/** POST /api/admin/upcoming/:id/dismiss — soft hide overdue entries. */
router.post('/:id/dismiss', checkPermission('manage_upcoming'), (req, res) => {
  const row = db.prepare('SELECT id FROM upcoming_tournaments WHERE id = ?').get(req.params.id);
  if (!row) return sendError(res, 404, 'Not found');
  db.prepare("UPDATE upcoming_tournaments SET status = 'dismissed' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

/** POST /api/admin/upcoming/:id/import-standings — force-import bypass. */
router.post(
  '/:id/import-standings',
  checkPermission('manage_tournaments'),
  asyncHandler(async (req, res) => {
    const result = await forceImportUpcoming(req.params.id);
    if (!result.success) return sendError(res, result.status, result.message);
    res.json(result);
  })
);

module.exports = router;
