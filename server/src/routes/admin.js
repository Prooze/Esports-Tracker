const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { checkPermission } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ─── Multer config for icon uploads ──────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../../uploads/icons');

const iconStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `game-${req.params.id}-${Date.now()}${ext}`);
  },
});

const iconUpload = multer({
  storage: iconStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

function deleteIconFile(iconPath) {
  if (!iconPath) return;
  const filePath = path.join(uploadsDir, path.basename(iconPath));
  try { fs.unlinkSync(filePath); } catch (_) {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const VALID_PERMISSIONS = ['manage_games', 'manage_tournaments', 'manage_accounts'];

function formatAccount(row) {
  return {
    ...row,
    permissions: JSON.parse(row.permissions || '[]'),
    is_superadmin: row.is_superadmin === 1,
  };
}

function getAccount(id) {
  return db.prepare(
    'SELECT id, username, permissions, is_superadmin, created_at, last_login FROM admins WHERE id = ?'
  ).get(id);
}

// ─── Points calculation ───────────────────────────────────────────────────────
function getPoints(placement) {
  if (placement === 1)  return 100;
  if (placement === 2)  return 80;
  if (placement === 3)  return 65;
  if (placement === 4)  return 50;
  if (placement <= 6)   return 40;
  if (placement <= 8)   return 32;
  if (placement <= 12)  return 25;
  if (placement <= 16)  return 18;
  if (placement <= 24)  return 12;
  if (placement <= 32)  return 8;
  return 5;
}

// ─── Games ────────────────────────────────────────────────────────────────────
// GET is open to all authenticated admins (needed for tournament dropdowns)
router.get('/games', (req, res) => {
  res.json(db.prepare('SELECT * FROM games ORDER BY name').all());
});

router.post('/games', checkPermission('manage_games'), (req, res) => {
  const { name, icon_emoji = '🎮' } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const result = db.prepare(
    'INSERT INTO games (name, icon_emoji) VALUES (?, ?)'
  ).run(name.trim(), icon_emoji);

  res.status(201).json(db.prepare('SELECT * FROM games WHERE id = ?').get(result.lastInsertRowid));
});

router.delete('/games/:id', checkPermission('manage_games'), (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (game?.icon_path) deleteIconFile(game.icon_path);
  db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/games/:id/icon', checkPermission('manage_games'), iconUpload.single('icon'), (req, res) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!game) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Game not found' });
  }

  if (game.icon_path) deleteIconFile(game.icon_path);

  const iconPath = `/uploads/icons/${req.file.filename}`;
  db.prepare('UPDATE games SET icon_path = ? WHERE id = ?').run(iconPath, id);
  res.json(db.prepare('SELECT * FROM games WHERE id = ?').get(id));
});

router.delete('/games/:id/icon', checkPermission('manage_games'), (req, res) => {
  const { id } = req.params;
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  if (game.icon_path) deleteIconFile(game.icon_path);
  db.prepare('UPDATE games SET icon_path = NULL WHERE id = ?').run(id);
  res.json(db.prepare('SELECT * FROM games WHERE id = ?').get(id));
});

// ─── Admin accounts ───────────────────────────────────────────────────────────
// GET is open to all authenticated admins
router.get('/accounts', (req, res) => {
  const rows = db.prepare(
    'SELECT id, username, permissions, is_superadmin, created_at, last_login FROM admins ORDER BY created_at ASC'
  ).all();
  res.json(rows.map(formatAccount));
});

router.post('/accounts', checkPermission('manage_accounts'), async (req, res) => {
  const { username, password, permissions = [] } = req.body;
  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const taken = db.prepare('SELECT id FROM admins WHERE username = ?').get(username.trim());
  if (taken) return res.status(409).json({ error: 'Username already taken' });

  // Non-superadmins can only grant permissions they themselves hold
  const grantable = req.admin.is_superadmin
    ? VALID_PERMISSIONS
    : (Array.isArray(req.admin.permissions) ? req.admin.permissions : []);
  const safePerms = Array.isArray(permissions)
    ? permissions.filter(p => VALID_PERMISSIONS.includes(p) && grantable.includes(p))
    : [];

  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare(
    'INSERT INTO admins (username, password_hash, permissions) VALUES (?, ?, ?)'
  ).run(username.trim(), hash, JSON.stringify(safePerms));

  res.status(201).json(formatAccount(getAccount(result.lastInsertRowid)));
});

router.put('/accounts/:id', async (req, res) => {
  const { id } = req.params;
  const isSelf = String(req.admin.id) === String(id);
  const hasManageAccounts = req.admin.is_superadmin ||
    (Array.isArray(req.admin.permissions) && req.admin.permissions.includes('manage_accounts'));

  // Must be editing self OR have manage_accounts
  if (!isSelf && !hasManageAccounts) {
    return res.status(403).json({ error: "You don't have permission to edit other accounts." });
  }

  const account = db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const { username, password, permissions } = req.body;

  // Without manage_accounts you can only change your own password
  if (!hasManageAccounts && (username !== undefined || permissions !== undefined)) {
    return res.status(403).json({ error: 'You can only change your own password.' });
  }

  if (hasManageAccounts && username !== undefined) {
    if (!username.trim()) return res.status(400).json({ error: 'Username cannot be empty' });
    const taken = db.prepare('SELECT id FROM admins WHERE username = ? AND id != ?')
      .get(username.trim(), id);
    if (taken) return res.status(409).json({ error: 'Username already taken' });
    db.prepare('UPDATE admins SET username = ? WHERE id = ?').run(username.trim(), id);
  }

  // Permissions can only be changed on non-superadmin accounts
  if (hasManageAccounts && permissions !== undefined && !account.is_superadmin) {
    const grantable = req.admin.is_superadmin
      ? VALID_PERMISSIONS
      : (Array.isArray(req.admin.permissions) ? req.admin.permissions : []);
    const safePerms = Array.isArray(permissions)
      ? permissions.filter(p => VALID_PERMISSIONS.includes(p) && grantable.includes(p))
      : [];
    db.prepare('UPDATE admins SET permissions = ? WHERE id = ?').run(JSON.stringify(safePerms), id);
  }

  if (password) {
    const hash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, id);
  }

  res.json(formatAccount(getAccount(id)));
});

router.delete('/accounts/:id', checkPermission('manage_accounts'), (req, res) => {
  const { id } = req.params;

  if (String(req.admin.id) === String(id)) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const { count } = db.prepare('SELECT COUNT(*) AS count FROM admins').get();
  if (count <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last admin account' });
  }

  db.prepare('DELETE FROM admins WHERE id = ?').run(id);
  res.json({ success: true });
});

// ─── Tournaments ──────────────────────────────────────────────────────────────
// GET open to all authenticated admins
router.get('/tournaments', (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, g.name AS game_name, g.icon_emoji, COUNT(s.id) AS player_count
    FROM tournaments t
    LEFT JOIN games g ON t.game_id = g.id
    LEFT JOIN standings s ON s.tournament_id = t.id
    GROUP BY t.id
    ORDER BY t.date DESC, t.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/tournaments', checkPermission('manage_tournaments'), (req, res) => {
  const { name, event_name, game_id, date, startgg_id } = req.body;
  if (!name || !game_id) return res.status(400).json({ error: 'name and game_id are required' });

  const result = db.prepare(
    'INSERT INTO tournaments (startgg_id, name, event_name, game_id, date) VALUES (?, ?, ?, ?, ?)'
  ).run(startgg_id || null, name.trim(), event_name || null, game_id, date || null);

  res.status(201).json(db.prepare('SELECT * FROM tournaments WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/tournaments/:id', checkPermission('manage_tournaments'), (req, res) => {
  const { name, event_name, game_id, date } = req.body;
  const { id } = req.params;

  db.prepare(
    'UPDATE tournaments SET name = ?, event_name = ?, game_id = ?, date = ? WHERE id = ?'
  ).run(name, event_name || null, game_id, date || null, id);

  res.json(db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id));
});

router.delete('/tournaments/:id', checkPermission('manage_tournaments'), (req, res) => {
  db.prepare('DELETE FROM tournaments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── start.gg helpers ─────────────────────────────────────────────────────────
async function startggQuery(query, variables, token) {
  const res = await fetch('https://api.start.gg/gql/alpha', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`start.gg responded with ${res.status}`);

  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

function extractSlug(url) {
  const m = url.match(/start\.gg\/tournament\/([^/?#]+)/);
  return m ? m[1] : null;
}

router.post('/startgg/lookup', checkPermission('manage_tournaments'), async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  const slug = extractSlug(url);
  if (!slug) return res.status(400).json({ error: 'Could not parse a tournament slug from that URL' });

  const row = db.prepare("SELECT value FROM settings WHERE key = 'startgg_token'").get();
  if (!row?.value) return res.status(400).json({ error: 'No start.gg API token configured — set it in Settings' });

  try {
    const data = await startggQuery(
      `query TournamentQuery($slug: String!) {
        tournament(slug: $slug) {
          id
          name
          startAt
          events {
            id
            name
            numEntrants
          }
        }
      }`,
      { slug },
      row.value
    );

    if (!data.tournament) return res.status(404).json({ error: 'Tournament not found on start.gg' });
    res.json(data.tournament);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/startgg/import', checkPermission('manage_tournaments'), async (req, res) => {
  const { eventId, eventName, tournamentName, gameId, date } = req.body;
  if (!eventId || !gameId) return res.status(400).json({ error: 'eventId and gameId are required' });

  const row = db.prepare("SELECT value FROM settings WHERE key = 'startgg_token'").get();
  if (!row?.value) return res.status(400).json({ error: 'No start.gg API token configured' });

  try {
    const data = await startggQuery(
      `query EventStandings($eventId: ID!, $page: Int!, $perPage: Int!) {
        event(id: $eventId) {
          id
          name
          standings(query: { page: $page, perPage: $perPage }) {
            nodes {
              placement
              entrant {
                name
              }
            }
          }
        }
      }`,
      { eventId: String(eventId), page: 1, perPage: 64 },
      row.value
    );

    const nodes = data.event?.standings?.nodes ?? [];
    if (nodes.length === 0) return res.status(400).json({ error: 'No standings found for this event' });

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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const result = {};
  for (const { key, value } of rows) result[key] = value;
  if (result.startgg_token) result.startgg_token_set = true;
  delete result.startgg_token;
  res.json(result);
});

router.put('/settings', (req, res) => {
  const { startgg_token } = req.body;
  if (startgg_token !== undefined) {
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('startgg_token', ?)"
    ).run(startgg_token);
  }
  res.json({ success: true });
});

module.exports = router;
