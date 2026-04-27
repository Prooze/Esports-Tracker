const express = require('express');
const db = require('../../db');
const { checkPermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { sendError } = require('../../utils/errors');
const { makeUpload, destroyIfCloudinary } = require('../../services/cloudinary');

const router = express.Router();

const BRANDING_UPLOAD_SIZE_MB = 5;
const BRANDING_TEXT_KEYS = [
  'site_name', 'site_tagline', 'primary_color', 'accent_color',
  'footer_links', 'social_links', 'announcement_text', 'announcement_active',
];

const brandingUpload = makeUpload(
  'esports-tracker/branding',
  (req) => `${req.params.type}-${Date.now()}`,
  BRANDING_UPLOAD_SIZE_MB,
);

const upsertSetting = (key, value) =>
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);

const settingKeyForUpload = (type) =>
  type === 'banner' ? 'hero_banner' : `site_${type}`;

/**
 * PUT /api/admin/settings/branding
 * Persists the text/JSON branding settings (site_name, colors, social_links, etc.).
 */
router.put('/', checkPermission('manage_branding'), (req, res) => {
  for (const key of BRANDING_TEXT_KEYS) {
    if (req.body[key] === undefined) continue;
    const raw = req.body[key];
    const value = Array.isArray(raw) ? JSON.stringify(raw) : String(raw);
    upsertSetting(key, value);
  }
  res.json({ success: true });
});

/**
 * POST /api/admin/settings/:type — upload a logo/favicon/banner.
 * `:type` is constrained to a fixed allowlist via the route regex.
 */
router.post(
  '/:type(logo|favicon|banner)',
  checkPermission('manage_branding'),
  (req, res) => {
    brandingUpload.single('file')(req, res, async (err) => {
      if (err) return sendError(res, 400, err.message);
      if (!req.file) return sendError(res, 400, 'No file uploaded');

      const settingKey = settingKeyForUpload(req.params.type);
      const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(settingKey);
      if (existing?.value) await destroyIfCloudinary(existing.value);

      upsertSetting(settingKey, req.file.path);
      res.json({ path: req.file.path });
    });
  }
);

/** DELETE /api/admin/settings/:type — clears a branding image. */
router.delete(
  '/:type(logo|favicon|banner)',
  checkPermission('manage_branding'),
  asyncHandler(async (req, res) => {
    const settingKey = settingKeyForUpload(req.params.type);
    const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(settingKey);
    if (existing?.value) await destroyIfCloudinary(existing.value);
    upsertSetting(settingKey, '');
    res.json({ success: true });
  })
);

/** PUT /api/admin/settings/stream — live stream URL + on/off toggle. */
router.put('/stream', checkPermission('manage_branding'), (req, res) => {
  const { stream_url, stream_active } = req.body;
  upsertSetting('stream_url', stream_url || '');
  upsertSetting('stream_active', String(!!stream_active));
  res.json({ success: true });
});

module.exports = router;
