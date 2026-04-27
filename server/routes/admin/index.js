const express = require('express');
const db = require('../../db');
const { requireAuth } = require('../../middleware/auth');

const games        = require('./games');
const tournaments  = require('./tournaments');
const accounts     = require('./accounts');
const upcoming     = require('./upcoming');
const integrations = require('./integrations');
const startgg      = require('./startgg');
const branding     = require('./branding');

const router = express.Router();

// Every admin endpoint requires a valid JWT
router.use(requireAuth);

const SENSITIVE_SETTINGS = ['startgg_token', 'cloudinary_api_key', 'cloudinary_api_secret'];

/**
 * GET /api/admin/settings — generic key/value store with secrets stripped.
 * Sensitive credentials are managed via /integrations instead.
 */
router.get('/settings', (_req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM settings').all();
    const result = {};
    for (const { key, value } of rows) result[key] = value;
    for (const key of SENSITIVE_SETTINGS) delete result[key];
    res.json(result);
  } catch (err) { next(err); }
});

router.use('/games',         games);
router.use('/tournaments',   tournaments);
router.use('/accounts',      accounts);
router.use('/upcoming',      upcoming);
router.use('/integrations',  integrations);
router.use('/startgg',       startgg);
// Branding text + uploads share the /settings prefix (legacy URL shape)
router.use('/settings/branding', branding);
router.use('/settings',          branding);

module.exports = router;
