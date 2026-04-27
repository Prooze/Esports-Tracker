const express = require('express');
const db = require('../../db');
const { checkPermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { sendError } = require('../../utils/errors');
const { makeUpload, destroyIfCloudinary } = require('../../services/cloudinary');

const router = express.Router();

const ICON_SIZE_LIMIT_MB = 2;
const iconUpload = makeUpload(
  'esports-tracker/games',
  (req) => `game-${req.params.id}-${Date.now()}`,
  ICON_SIZE_LIMIT_MB,
);

/** GET /api/admin/games — list all games (open to any authenticated admin). */
router.get('/', (_req, res, next) => {
  try {
    res.json(db.prepare('SELECT * FROM games ORDER BY name').all());
  } catch (err) { next(err); }
});

/** POST /api/admin/games — create a game. Requires manage_games. */
router.post('/', checkPermission('manage_games'), (req, res, next) => {
  try {
    const { name, icon_emoji = '🎮' } = req.body;
    if (!name) return sendError(res, 400, 'Name required');

    const result = db.prepare(
      'INSERT INTO games (name, icon_emoji) VALUES (?, ?)'
    ).run(name.trim(), icon_emoji);

    res.status(201).json(db.prepare('SELECT * FROM games WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { next(err); }
});

/** PUT /api/admin/games/:id — rename a game. */
router.put('/:id', checkPermission('manage_games'), (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name?.trim()) return sendError(res, 400, 'Name is required');

    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
    if (!game) return sendError(res, 404, 'Game not found');

    const taken = db.prepare(
      'SELECT id FROM games WHERE lower(name) = lower(?) AND id != ?'
    ).get(name.trim(), id);
    if (taken) return sendError(res, 409, 'A game with that name already exists');

    db.prepare('UPDATE games SET name = ? WHERE id = ?').run(name.trim(), id);
    res.json(db.prepare('SELECT * FROM games WHERE id = ?').get(id));
  } catch (err) { next(err); }
});

/** DELETE /api/admin/games/:id — also deletes its tournaments via FK cascade. */
router.delete('/:id', checkPermission('manage_games'), asyncHandler(async (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (game?.icon_path) await destroyIfCloudinary(game.icon_path);
  db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
  res.json({ success: true });
}));

/** POST /api/admin/games/:id/icon — upload an icon image. */
router.post(
  '/:id/icon',
  checkPermission('manage_games'),
  iconUpload.single('icon'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!req.file) return sendError(res, 400, 'No file uploaded');

    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
    if (!game) return sendError(res, 404, 'Game not found');

    if (game.icon_path) await destroyIfCloudinary(game.icon_path);
    db.prepare('UPDATE games SET icon_path = ? WHERE id = ?').run(req.file.path, id);
    res.json(db.prepare('SELECT * FROM games WHERE id = ?').get(id));
  })
);

/** DELETE /api/admin/games/:id/icon — remove a game's icon. */
router.delete('/:id/icon', checkPermission('manage_games'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!game) return sendError(res, 404, 'Game not found');

  if (game.icon_path) await destroyIfCloudinary(game.icon_path);
  db.prepare('UPDATE games SET icon_path = NULL WHERE id = ?').run(id);
  res.json(db.prepare('SELECT * FROM games WHERE id = ?').get(id));
}));

module.exports = router;
