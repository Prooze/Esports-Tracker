const express = require('express');
const db = require('../../db');
const { checkPermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { cloudinary, getConfig, isConfigured } = require('../../services/cloudinary');

const router = express.Router();

const upsertSetting = (key, value) =>
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);

const getSetting = (key) =>
  db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || '';

const INTEGRATION_KEYS = [
  'cloudinary_cloud_name', 'cloudinary_api_key', 'cloudinary_api_secret',
  'cloudinary_last_tested', 'cloudinary_test_ok',
  'startgg_token', 'startgg_organizer_url', 'startgg_sync_frequency',
  'startgg_last_synced', 'startgg_last_sync_result',
];

/**
 * GET /api/admin/integrations
 * Returns the integration config without exposing secret values — booleans
 * indicate whether keys are set. Last-sync metadata is parsed from JSON.
 */
router.get('/', checkPermission('manage_integrations'), (_req, res) => {
  const raw = {};
  for (const key of INTEGRATION_KEYS) raw[key] = getSetting(key);

  let lastSyncResult = null;
  try { if (raw.startgg_last_sync_result) lastSyncResult = JSON.parse(raw.startgg_last_sync_result); }
  catch (_) { /* ignore — older format */ }

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

/**
 * PUT /api/admin/integrations
 * Updates integration credentials. Empty/undefined values are not written, so
 * the UI can submit "blank" placeholders without clearing existing secrets.
 */
router.put('/', checkPermission('manage_integrations'), (req, res) => {
  const {
    cloudinary_cloud_name, cloudinary_api_key, cloudinary_api_secret, startgg_token,
    startgg_organizer_url, startgg_sync_frequency,
  } = req.body;

  if (cloudinary_cloud_name !== undefined) upsertSetting('cloudinary_cloud_name', cloudinary_cloud_name);
  if (cloudinary_api_key)    upsertSetting('cloudinary_api_key',    cloudinary_api_key);
  if (cloudinary_api_secret) upsertSetting('cloudinary_api_secret', cloudinary_api_secret);
  if (startgg_token)         upsertSetting('startgg_token',         startgg_token);
  if (startgg_organizer_url  !== undefined) upsertSetting('startgg_organizer_url',  startgg_organizer_url);
  if (startgg_sync_frequency !== undefined) upsertSetting('startgg_sync_frequency', startgg_sync_frequency);

  res.json({ success: true });
});

/** POST /api/admin/integrations/test-cloudinary — verify credentials against the API. */
router.post('/test-cloudinary', checkPermission('manage_integrations'), asyncHandler(async (_req, res) => {
  const cfg = getConfig();
  if (!isConfigured(cfg)) {
    return res.status(400).json({ ok: false, error: 'Cloudinary credentials are not configured' });
  }

  const now = new Date().toISOString();
  try {
    cloudinary.config(cfg);
    await cloudinary.api.ping();
    upsertSetting('cloudinary_last_tested', now);
    upsertSetting('cloudinary_test_ok', 'true');
    res.json({ ok: true, tested_at: now });
  } catch (err) {
    upsertSetting('cloudinary_last_tested', now);
    upsertSetting('cloudinary_test_ok', 'false');
    res.status(400).json({ ok: false, error: err.message, tested_at: now });
  }
}));

module.exports = router;
