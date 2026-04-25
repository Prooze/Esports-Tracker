const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { checkPermission } = require('../middleware/auth');
const { makeUpload, destroyIfCloudinary } = require('../lib/cloudinary');

const router = express.Router();
router.use(requireAuth);

// ─── Multer/Cloudinary config for icon uploads ────────────────────────────────
const iconUpload = makeUpload(
  'esports-tracker/games',
  (req) => `game-${req.params.id}-${Date.now()}`,
  2
);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const VALID_PERMISSIONS = [
  'manage_games',
  'manage_tournaments',
  'manage_upcoming',
  'manage_branding',
  'manage_integrations',
  'manage_accounts',
];

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

router.put('/games/:id', checkPermission('manage_games'), (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const taken = db.prepare('SELECT id FROM games WHERE lower(name) = lower(?) AND id != ?').get(name.trim(), id);
  if (taken) return res.status(409).json({ error: 'A game with that name already exists' });

  db.prepare('UPDATE games SET name = ? WHERE id = ?').run(name.trim(), id);
  res.json(db.prepare('SELECT * FROM games WHERE id = ?').get(id));
});

router.delete('/games/:id', checkPermission('manage_games'), async (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (game?.icon_path) await destroyIfCloudinary(game.icon_path);
  db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/games/:id/icon', checkPermission('manage_games'), iconUpload.single('icon'), async (req, res) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  if (game.icon_path) await destroyIfCloudinary(game.icon_path);

  // req.file.path is the full Cloudinary URL when using CloudinaryStorage
  db.prepare('UPDATE games SET icon_path = ? WHERE id = ?').run(req.file.path, id);
  res.json(db.prepare('SELECT * FROM games WHERE id = ?').get(id));
});

router.delete('/games/:id/icon', checkPermission('manage_games'), async (req, res) => {
  const { id } = req.params;
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  if (game.icon_path) await destroyIfCloudinary(game.icon_path);
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
  const { name, event_name, game_id, date, recording_url } = req.body;
  const { id } = req.params;

  db.prepare(
    'UPDATE tournaments SET name = ?, event_name = ?, game_id = ?, date = ?, recording_url = ? WHERE id = ?'
  ).run(name, event_name || null, game_id, date || null, recording_url || null, id);

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
  return extractTournamentSlug(url);
}

function extractOrganizerSlug(url) {
  const m = url.match(/start\.gg\/(?:user|org)\/([^/?#]+)/);
  return m ? m[1] : null;
}

async function performOrganizerSync(slug, token) {
  const data = await startggQuery(
    `query OrganizerTournaments($slug: String!) {
      user(slug: $slug) {
        tournaments(query: {
          filter: {
            upcoming: true
            tournamentView: "admin"
          }
        }) {
          nodes {
            id
            name
            slug
            startAt
            registrationClosesAt
            events {
              id
              name
              videogame {
                id
                name
              }
            }
          }
        }
      }
    }`,
    { slug },
    token
  );

  const tournaments = data.user?.tournaments?.nodes ?? [];
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  let gamesMatched = 0;
  let upcomingAdded = 0;
  let pendingCreated = 0;

  for (const tournament of tournaments) {
    // tournament.slug from the API is "tournament/slug-name" — strip the prefix
    const pureSlug = tournament.slug.replace(/^tournament\//, '');
    const tournamentUrl = `https://www.start.gg/tournament/${pureSlug}/register`;
    const eventDate = tournament.startAt
      ? new Date(tournament.startAt * 1000).toISOString().split('T')[0]
      : null;
    const registrationClosesAt = tournament.registrationClosesAt
      ? new Date(tournament.registrationClosesAt * 1000).toISOString()
      : null;

    const seenGames = new Set();

    for (const event of (tournament.events || [])) {
      const gameName = event.videogame?.name;
      if (!gameName || seenGames.has(gameName.toLowerCase())) continue;
      seenGames.add(gameName.toLowerCase());

      const game = db.prepare('SELECT * FROM games WHERE lower(name) = lower(?)').get(gameName);

      if (game) {
        gamesMatched++;
        const alreadyExists = db.prepare(
          'SELECT id FROM upcoming_tournaments WHERE startgg_url = ?'
        ).get(tournamentUrl);
        if (!alreadyExists) {
          db.prepare(
            'INSERT INTO upcoming_tournaments (name, game_id, event_date, startgg_url, registration_closes_at) VALUES (?, ?, ?, ?, ?)'
          ).run(tournament.name, game.id, eventDate, tournamentUrl, registrationClosesAt);
          upcomingAdded++;
        } else {
          // Update registration close time if it changed
          if (registrationClosesAt) {
            db.prepare(
              'UPDATE upcoming_tournaments SET registration_closes_at = ? WHERE startgg_url = ? AND registration_closes_at IS NULL'
            ).run(registrationClosesAt, tournamentUrl);
          }
        }
      } else {
        const alreadyPending = db.prepare(
          'SELECT id FROM pending_games WHERE lower(game_name) = lower(?) AND tournament_name = ?'
        ).get(gameName, tournament.name);
        if (!alreadyPending) {
          db.prepare(
            'INSERT INTO pending_games (game_name, tournament_name, startgg_tournament_url, event_date) VALUES (?, ?, ?, ?)'
          ).run(gameName, tournament.name, tournamentUrl, eventDate);
          pendingCreated++;
        }
      }
    }
  }

  return {
    tournaments_found: tournaments.length,
    games_matched:     gamesMatched,
    upcoming_added:    upcomingAdded,
    pending_games:     pendingCreated,
  };
}

// ─── Completion detection ─────────────────────────────────────────────────────

// In-memory ring buffer for completion-check log (last 100 entries)
const completionLog = [];
function clog(level, msg) {
  const entry = { ts: new Date().toISOString(), level, msg };
  if (level === 'error') console.error(`[completion-check] ${msg}`);
  else console.log(`[completion-check] ${msg}`);
  completionLog.push(entry);
  if (completionLog.length > 100) completionLog.shift();
}

// Numeric 2=ACTIVE, 3=COMPLETED — also accept string variants
function stateNum(s) { return typeof s === 'number' ? s : parseInt(s, 10); }
function isStateCompleted(s) { return stateNum(s) === 3 || s === 'COMPLETED'; }
function isStateActive(s)    { return stateNum(s) === 2 || s === 'ACTIVE'; }

// Extract the bare tournament slug from any start.gg URL variant.
// https://www.start.gg/tournament/my-slug/register  → my-slug
// https://www.start.gg/tournament/my-slug/event/foo → my-slug
// https://start.gg/tournament/my-slug               → my-slug
function extractTournamentSlug(url) {
  if (!url) return null;
  const m = url.match(/start\.gg\/tournament\/([^/?#]+)/i);
  return m ? m[1] : null;
}

const TOURNAMENT_STATUS_QUERY = `query TournamentStatus($slug: String!) {
  tournament(slug: $slug) {
    id
    name
    state
    events {
      id
      name
      state
      videogame { id name }
      standings(query: { page: 1, perPage: 64 }) {
        nodes {
          placement
          entrant {
            participants {
              gamerTag
              prefix
            }
          }
        }
      }
    }
  }
}`;

// Persist standings rows for a matched event into the DB.
// Returns { tournamentId, count } on success or throws.
function insertStandingsForEvent(upcoming, tournamentName, matchedEvent) {
  const nodes = matchedEvent.standings?.nodes ?? [];
  if (nodes.length === 0) return { tournamentId: null, count: 0 };

  const tResult = db.prepare(
    'INSERT INTO tournaments (startgg_id, name, event_name, game_id, date, auto_imported) VALUES (?, ?, ?, ?, ?, 1)'
  ).run(String(matchedEvent.id), tournamentName, matchedEvent.name || null, upcoming.game_id, upcoming.event_date);

  const tournamentId = tResult.lastInsertRowid;
  const ins = db.prepare('INSERT INTO standings (tournament_id, player_name, placement, points) VALUES (?, ?, ?, ?)');

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

// Pick the best matching event from a tournament's event list given an upcoming record.
function pickEvent(upcoming, events) {
  if (!events || events.length === 0) return null;
  // 1. Exact videogame name match
  if (upcoming.game_name) {
    const exact = events.find(
      (e) => e.videogame?.name?.toLowerCase() === upcoming.game_name.toLowerCase()
    );
    if (exact) return exact;
  }
  // 2. Completed event
  const completedEvt = events.find((e) => isStateCompleted(e.state));
  if (completedEvt) return completedEvt;
  // 3. Active event
  const activeEvt = events.find((e) => isStateActive(e.state));
  if (activeEvt) return activeEvt;
  // 4. First event
  return events[0];
}

async function checkAndCompleteUpcomingTournaments() {
  const token = db.prepare("SELECT value FROM settings WHERE key = 'startgg_token'").get()?.value;
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
  for (const c of candidates) {
    clog('info', `  Candidate #${c.id} "${c.name}" | date=${c.event_date} | game=${c.game_name || '(none)'} | url=${c.startgg_url}`);
  }

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

    clog('info', `#${upcoming.id} "${upcoming.name}": querying start.gg slug="${slug}"`);
    clog('info', `  Query: TournamentStatus with $slug="${slug}"`);

    try {
      const data = await startggQuery(TOURNAMENT_STATUS_QUERY, { slug }, token);
      updateChecked.run(now, upcoming.id);

      const t = data.tournament;
      if (!t) {
        clog('error', `#${upcoming.id}: start.gg returned no tournament for slug="${slug}"`);
        continue;
      }

      const eventSummary = (t.events || [])
        .map((e) => `"${e.name}" state=${e.state} standings=${e.standings?.nodes?.length ?? '?'} game=${e.videogame?.name || '?'}`)
        .join(' | ');
      clog('info', `#${upcoming.id} "${upcoming.name}": API response → tournament state=${JSON.stringify(t.state)}, events=[${eventSummary}]`);

      const matchedEvent = pickEvent(upcoming, t.events || []);

      if (!matchedEvent) {
        clog('warn', `#${upcoming.id}: no events returned — cannot import`);
        continue;
      }

      clog('info', `#${upcoming.id}: matched event="${matchedEvent.name}" state=${matchedEvent.state} game=${matchedEvent.videogame?.name || '?'} nodes=${matchedEvent.standings?.nodes?.length ?? 0}`);

      // Gate: require tournament OR matched event to be completed (state 3)
      const tournamentDone = isStateCompleted(t.state);
      const eventDone      = isStateCompleted(matchedEvent.state);

      if (!tournamentDone && !eventDone) {
        clog('info', `#${upcoming.id}: neither tournament (state=${t.state}) nor matched event (state=${matchedEvent.state}) is completed — skipping`);
        continue;
      }

      clog('info', `#${upcoming.id}: completed! tournament_state=${t.state} event_state=${matchedEvent.state} — attempting import`);

      // Check for duplicate
      const alreadyImported = db.prepare('SELECT id FROM tournaments WHERE startgg_id = ?').get(String(matchedEvent.id));
      if (alreadyImported) {
        clog('info', `#${upcoming.id}: event already imported as tournament #${alreadyImported.id} — marking completed`);
        db.prepare('UPDATE upcoming_tournaments SET status = ?, linked_tournament_id = ? WHERE id = ?')
          .run('completed', alreadyImported.id, upcoming.id);
        continue;
      }

      const nodes = matchedEvent.standings?.nodes ?? [];
      if (nodes.length === 0) {
        clog('warn', `#${upcoming.id}: event is completed but 0 standings nodes returned — leaving in queue for retry`);
        // Don't mark as completed yet; leave it so the next check retries
        continue;
      }

      const { tournamentId, count } = insertStandingsForEvent(upcoming, t.name, matchedEvent);
      db.prepare('UPDATE upcoming_tournaments SET status = ?, linked_tournament_id = ? WHERE id = ?')
        .run('completed', tournamentId, upcoming.id);

      completed++;
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('auto_import_last_at', now);
      clog('info', `#${upcoming.id}: ✓ imported "${t.name}" — "${matchedEvent.name}" (${count} players, game_id=${upcoming.game_id})`);

    } catch (err) {
      clog('error', `#${upcoming.id} "${upcoming.name}": API error — ${err.message}`);
    }
  }

  clog('info', `=== Completion check done — checked ${candidates.length}, imported ${completed} ===`);
  return { checked: candidates.length, completed };
}

router.post('/tournaments/check-completions', checkPermission('manage_tournaments'), async (req, res) => {
  try {
    const result = await checkAndCompleteUpcomingTournaments();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tournaments/completion-log', checkPermission('manage_tournaments'), (req, res) => {
  res.json([...completionLog].reverse().slice(0, 20));
});

// Force-import standings for a specific upcoming tournament
router.post('/upcoming/:id/import-standings', checkPermission('manage_tournaments'), async (req, res) => {
  const upcoming = db.prepare(`
    SELECT u.*, g.name AS game_name
    FROM upcoming_tournaments u
    LEFT JOIN games g ON u.game_id = g.id
    WHERE u.id = ?
  `).get(req.params.id);

  if (!upcoming) return res.status(404).json({ error: 'Upcoming tournament not found' });
  if (!upcoming.startgg_url) return res.status(400).json({ error: 'No start.gg URL set for this tournament' });

  const token = db.prepare("SELECT value FROM settings WHERE key = 'startgg_token'").get()?.value;
  if (!token) return res.status(400).json({ error: 'No start.gg API token configured' });

  const slug = extractTournamentSlug(upcoming.startgg_url);
  if (!slug) return res.status(400).json({ error: `Could not parse tournament slug from "${upcoming.startgg_url}"` });

  try {
    clog('info', `[force-import] #${upcoming.id} "${upcoming.name}": querying slug="${slug}"`);
    const data = await startggQuery(TOURNAMENT_STATUS_QUERY, { slug }, token);
    const t = data.tournament;
    if (!t) return res.status(404).json({ error: 'Tournament not found on start.gg' });

    const eventSummary = (t.events || [])
      .map((e) => `"${e.name}" state=${e.state} nodes=${e.standings?.nodes?.length ?? '?'} game=${e.videogame?.name || '?'}`)
      .join(' | ');
    clog('info', `[force-import] #${upcoming.id}: state=${t.state} events=[${eventSummary}]`);

    const matchedEvent = pickEvent(upcoming, t.events || []);
    if (!matchedEvent) return res.status(400).json({ error: 'No events found for this tournament on start.gg' });

    clog('info', `[force-import] #${upcoming.id}: matched event="${matchedEvent.name}" state=${matchedEvent.state} nodes=${matchedEvent.standings?.nodes?.length ?? 0}`);

    const nodes = matchedEvent.standings?.nodes ?? [];
    if (nodes.length === 0) {
      return res.status(400).json({
        error: `No standings available yet for "${matchedEvent.name}" (tournament state: ${t.state}, event state: ${matchedEvent.state}). The event may still be in progress.`,
      });
    }

    const alreadyImported = db.prepare('SELECT id FROM tournaments WHERE startgg_id = ?').get(String(matchedEvent.id));
    if (alreadyImported) {
      db.prepare('UPDATE upcoming_tournaments SET status = ?, linked_tournament_id = ? WHERE id = ?')
        .run('completed', alreadyImported.id, upcoming.id);
      clog('info', `[force-import] #${upcoming.id}: already imported as tournament #${alreadyImported.id}`);
      return res.json({ success: true, already_imported: true, tournament_id: alreadyImported.id, count: 0 });
    }

    const { tournamentId, count } = insertStandingsForEvent(upcoming, t.name, matchedEvent);
    db.prepare('UPDATE upcoming_tournaments SET status = ?, linked_tournament_id = ? WHERE id = ?')
      .run('completed', tournamentId, upcoming.id);

    clog('info', `[force-import] #${upcoming.id}: ✓ imported "${t.name}" — "${matchedEvent.name}" (${count} players)`);
    res.json({ success: true, tournament_id: tournamentId, count });
  } catch (err) {
    clog('error', `[force-import] #${upcoming.id}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

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

// ─── Organizer sync ───────────────────────────────────────────────────────────
router.post('/startgg/sync-organizer', checkPermission('manage_integrations'), async (req, res) => {
  let { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const slug = url.includes('start.gg') ? extractOrganizerSlug(url) : url;
  if (!slug) return res.status(400).json({ error: 'Could not parse organizer slug from URL' });

  const tokenRow = db.prepare("SELECT value FROM settings WHERE key = 'startgg_token'").get();
  if (!tokenRow?.value) {
    return res.status(400).json({ error: 'No start.gg API token configured — set it in Integrations' });
  }

  try {
    const result = await performOrganizerSync(slug, tokenRow.value);
    const now = new Date().toISOString();
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    upsert.run('startgg_last_synced', now);
    upsert.run('startgg_last_sync_result', JSON.stringify(result));
    res.json({ ...result, synced_at: now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/startgg/pending-games', checkPermission('manage_games'), (req, res) => {
  const rows = db.prepare('SELECT * FROM pending_games ORDER BY created_at DESC').all();
  res.json(rows);
});

router.post('/startgg/pending-games/:id/approve', checkPermission('manage_games'), async (req, res) => {
  const pending = db.prepare('SELECT * FROM pending_games WHERE id = ?').get(req.params.id);
  if (!pending) return res.status(404).json({ error: 'Pending game not found' });

  const { game_name = pending.game_name, icon_emoji = '🎮' } = req.body;
  if (!game_name?.trim()) return res.status(400).json({ error: 'game_name is required' });

  // Create the game
  const gameResult = db.prepare(
    'INSERT INTO games (name, icon_emoji) VALUES (?, ?)'
  ).run(game_name.trim(), icon_emoji);
  const gameId = gameResult.lastInsertRowid;

  // Approve ALL pending entries for the same game name (case-insensitive)
  const siblings = db.prepare(
    'SELECT * FROM pending_games WHERE lower(game_name) = lower(?)'
  ).all(pending.game_name);

  let added = 0;
  for (const p of siblings) {
    const exists = p.startgg_tournament_url
      ? db.prepare('SELECT id FROM upcoming_tournaments WHERE startgg_url = ?').get(p.startgg_tournament_url)
      : db.prepare('SELECT id FROM upcoming_tournaments WHERE name = ? AND event_date = ? AND game_id IS ?').get(p.tournament_name, p.event_date, gameId);
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
});

router.delete('/startgg/pending-games/:id', checkPermission('manage_games'), (req, res) => {
  db.prepare('DELETE FROM pending_games WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Upcoming tournaments ─────────────────────────────────────────────────────
router.get('/upcoming', (req, res) => {
  const rows = db.prepare(`
    SELECT u.*, g.name AS game_name, g.icon_emoji
    FROM upcoming_tournaments u
    LEFT JOIN games g ON u.game_id = g.id
    ORDER BY u.event_date ASC
  `).all();
  res.json(rows);
});

router.post('/upcoming', checkPermission('manage_upcoming'), (req, res) => {
  const { name, game_id, event_date, location, startgg_url, description, registration_closes_at } = req.body;
  if (!name || !event_date) return res.status(400).json({ error: 'name and event_date are required' });

  if (startgg_url) {
    const dup = db.prepare('SELECT id FROM upcoming_tournaments WHERE startgg_url = ?').get(startgg_url);
    if (dup) return res.status(409).json({ error: 'An upcoming tournament with that start.gg URL already exists' });
  } else {
    const dup = db.prepare(
      'SELECT id FROM upcoming_tournaments WHERE name = ? AND event_date = ? AND game_id IS ?'
    ).get(name.trim(), event_date, game_id || null);
    if (dup) return res.status(409).json({ error: 'An upcoming tournament with the same name, date, and game already exists' });
  }

  const result = db.prepare(
    'INSERT INTO upcoming_tournaments (name, game_id, event_date, location, startgg_url, description, registration_closes_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name.trim(), game_id || null, event_date, location || null, startgg_url || null, description || null, registration_closes_at || null);

  res.status(201).json(db.prepare('SELECT * FROM upcoming_tournaments WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/upcoming/:id', checkPermission('manage_upcoming'), (req, res) => {
  const { id } = req.params;
  const { name, game_id, event_date, location, startgg_url, description, registration_closes_at } = req.body;
  if (!name || !event_date) return res.status(400).json({ error: 'name and event_date are required' });

  db.prepare(
    'UPDATE upcoming_tournaments SET name = ?, game_id = ?, event_date = ?, location = ?, startgg_url = ?, description = ?, registration_closes_at = ? WHERE id = ?'
  ).run(name.trim(), game_id || null, event_date, location || null, startgg_url || null, description || null, registration_closes_at || null, id);

  res.json(db.prepare('SELECT * FROM upcoming_tournaments WHERE id = ?').get(id));
});

router.delete('/upcoming/:id', checkPermission('manage_upcoming'), (req, res) => {
  db.prepare('DELETE FROM upcoming_tournaments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/upcoming/:id/dismiss', checkPermission('manage_upcoming'), (req, res) => {
  const { id } = req.params;
  const row = db.prepare('SELECT id FROM upcoming_tournaments WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE upcoming_tournaments SET status = 'dismissed' WHERE id = ?").run(id);
  res.json({ success: true });
});

// ─── Settings ─────────────────────────────────────────────────────────────────
const SENSITIVE_SETTINGS = ['startgg_token', 'cloudinary_api_key', 'cloudinary_api_secret'];

router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const result = {};
  for (const { key, value } of rows) result[key] = value;
  // Strip all sensitive keys — accessible via /integrations instead
  for (const key of SENSITIVE_SETTINGS) delete result[key];
  res.json(result);
});

// General settings PUT kept for compatibility but integration fields moved to /integrations
router.put('/settings', (req, res) => {
  res.json({ success: true });
});

// ─── Integrations ─────────────────────────────────────────────────────────────
router.get('/integrations', checkPermission('manage_integrations'), (req, res) => {
  const keys = [
    'cloudinary_cloud_name', 'cloudinary_api_key', 'cloudinary_api_secret',
    'cloudinary_last_tested', 'cloudinary_test_ok', 'startgg_token',
    'startgg_organizer_url', 'startgg_sync_frequency',
    'startgg_last_synced', 'startgg_last_sync_result',
  ];
  const raw = {};
  for (const key of keys) {
    raw[key] = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || '';
  }

  let lastSyncResult = null;
  try { if (raw.startgg_last_sync_result) lastSyncResult = JSON.parse(raw.startgg_last_sync_result); } catch (_) {}

  res.json({
    cloudinary_cloud_name:     raw.cloudinary_cloud_name,
    cloudinary_api_key_set:    !!raw.cloudinary_api_key,
    cloudinary_api_secret_set: !!raw.cloudinary_api_secret,
    cloudinary_last_tested:    raw.cloudinary_last_tested,
    cloudinary_test_ok:        raw.cloudinary_test_ok,
    startgg_token_set:         !!raw.startgg_token,
    startgg_organizer_url:     raw.startgg_organizer_url,
    startgg_sync_frequency:    raw.startgg_sync_frequency || 'manual',
    startgg_last_synced:       raw.startgg_last_synced,
    startgg_last_sync_result:  lastSyncResult,
  });
});

router.put('/integrations', checkPermission('manage_integrations'), (req, res) => {
  const {
    cloudinary_cloud_name, cloudinary_api_key, cloudinary_api_secret, startgg_token,
    startgg_organizer_url, startgg_sync_frequency,
  } = req.body;
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  if (cloudinary_cloud_name !== undefined) upsert.run('cloudinary_cloud_name', cloudinary_cloud_name);
  if (cloudinary_api_key)    upsert.run('cloudinary_api_key',    cloudinary_api_key);
  if (cloudinary_api_secret) upsert.run('cloudinary_api_secret', cloudinary_api_secret);
  if (startgg_token)         upsert.run('startgg_token',         startgg_token);
  if (startgg_organizer_url  !== undefined) upsert.run('startgg_organizer_url',  startgg_organizer_url);
  if (startgg_sync_frequency !== undefined) upsert.run('startgg_sync_frequency', startgg_sync_frequency);

  res.json({ success: true });
});

router.post('/integrations/test-cloudinary', checkPermission('manage_integrations'), async (req, res) => {
  const { cloudinary: cld, getConfig, isConfigured } = require('../lib/cloudinary');

  const cfg = getConfig();
  if (!isConfigured(cfg)) {
    return res.status(400).json({ ok: false, error: 'Cloudinary credentials are not configured' });
  }

  const now = new Date().toISOString();
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  try {
    cld.config(cfg);
    await cld.api.ping();
    upsert.run('cloudinary_last_tested', now);
    upsert.run('cloudinary_test_ok', 'true');
    res.json({ ok: true, tested_at: now });
  } catch (err) {
    upsert.run('cloudinary_last_tested', now);
    upsert.run('cloudinary_test_ok', 'false');
    res.status(400).json({ ok: false, error: err.message, tested_at: now });
  }
});

// ─── Branding settings ────────────────────────────────────────────────────────
const brandingUpload = makeUpload(
  'esports-tracker/branding',
  (req) => `${req.params.type}-${Date.now()}`,
  5
);

const BRANDING_TEXT_KEYS = [
  'site_name', 'site_tagline', 'primary_color', 'accent_color',
  'footer_links', 'social_links', 'announcement_text', 'announcement_active',
];

router.put('/settings/branding', checkPermission('manage_branding'), (req, res) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  console.log('[branding PUT] received announcement_active:', JSON.stringify(req.body.announcement_active), typeof req.body.announcement_active);
  console.log('[branding PUT] received announcement_text:', JSON.stringify(req.body.announcement_text));

  for (const key of BRANDING_TEXT_KEYS) {
    if (req.body[key] === undefined) continue;
    const raw = req.body[key];
    // JSON-serialise arrays; stringify booleans/strings as-is
    const value = Array.isArray(raw) ? JSON.stringify(raw) : String(raw);
    console.log('[branding PUT] saving:', key, '→', JSON.stringify(value));
    upsert.run(key, value);
  }

  res.json({ success: true });
});

router.post('/settings/:type(logo|favicon|banner)', checkPermission('manage_branding'), (req, res) => {
  brandingUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const settingKey = req.params.type === 'banner' ? 'hero_banner' : `site_${req.params.type}`;
    const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(settingKey);
    if (existing?.value) await destroyIfCloudinary(existing.value);

    // req.file.path is the full Cloudinary URL
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(settingKey, req.file.path);

    res.json({ path: req.file.path });
  });
});

router.delete('/settings/:type(logo|favicon|banner)', checkPermission('manage_branding'), async (req, res) => {
  const settingKey = req.params.type === 'banner' ? 'hero_banner' : `site_${req.params.type}`;
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(settingKey);
  if (existing?.value) await destroyIfCloudinary(existing.value);
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(settingKey, '');
  res.json({ success: true });
});

router.put('/settings/stream', checkPermission('manage_branding'), (req, res) => {
  const { stream_url, stream_active } = req.body;
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  upsert.run('stream_url', stream_url || '');
  upsert.run('stream_active', String(!!stream_active));
  res.json({ success: true });
});

module.exports = router;
module.exports.performOrganizerSync = performOrganizerSync;
module.exports.extractOrganizerSlug = extractOrganizerSlug;
module.exports.checkAndCompleteUpcomingTournaments = checkAndCompleteUpcomingTournaments;
