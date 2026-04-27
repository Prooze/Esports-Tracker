const express = require('express');
const db = require('../db');

const router = express.Router();

const SENSITIVE_KEYS = ['startgg_token', 'cloudinary_api_key', 'cloudinary_api_secret'];

const parseBool = (v) => v === 'true' || v === '1' || v === true;
const toPath = (v) => (v && v.trim()) ? v : null;
const safeParseJson = (v, fallback = []) => {
  try { return JSON.parse(v || JSON.stringify(fallback)); }
  catch { return fallback; }
};

/**
 * GET /api/settings/public
 * Public-safe subset of branding settings. Sensitive keys (tokens, API keys)
 * are stripped before responding.
 */
router.get('/settings/public', (_req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM settings').all();
    const raw = {};
    for (const { key, value } of rows) raw[key] = value;

    for (const key of SENSITIVE_KEYS) delete raw[key];

    res.json({
      site_name:           raw.site_name           || 'Esports Standings',
      site_tagline:        raw.site_tagline        || 'Local Circuit',
      site_logo:           toPath(raw.site_logo),
      site_favicon:        toPath(raw.site_favicon),
      hero_banner:         toPath(raw.hero_banner),
      primary_color:       raw.primary_color       || '#7c6fff',
      accent_color:        raw.accent_color        || '#7c6fff',
      announcement_text:   raw.announcement_text   || '',
      announcement_active: parseBool(raw.announcement_active),
      footer_links:        safeParseJson(raw.footer_links, []),
      social_links:        safeParseJson(raw.social_links, []),
      stream_url:          raw.stream_url          || null,
      stream_active:       parseBool(raw.stream_active),
    });
  } catch (err) { next(err); }
});

const upcomingForPublicSql = `
  SELECT u.*, g.name AS game_name, g.icon_emoji, g.icon_path
  FROM upcoming_tournaments u
  LEFT JOIN games g ON u.game_id = g.id
  WHERE u.event_date >= ?
    AND u.status = 'upcoming'
    AND (u.registration_closes_at IS NULL OR u.registration_closes_at > ?)
`;

/** GET /api/upcoming — all upcoming tournaments still open for registration. */
router.get('/upcoming', (_req, res, next) => {
  try {
    const today  = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();
    const rows = db.prepare(`${upcomingForPublicSql} ORDER BY u.event_date ASC`).all(today, nowIso);
    res.json(rows);
  } catch (err) { next(err); }
});

/** GET /api/upcoming/game/:gameId — upcoming tournaments scoped to one game. */
router.get('/upcoming/game/:gameId', (req, res, next) => {
  try {
    const today  = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();
    const rows = db.prepare(
      `${upcomingForPublicSql} AND u.game_id = ? ORDER BY u.event_date ASC`
    ).all(today, nowIso, req.params.gameId);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
