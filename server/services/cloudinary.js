const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

let _db = null;
function getDb() {
  if (!_db) _db = require('../db');
  return _db;
}

/**
 * Read Cloudinary credentials. DB settings take precedence over environment
 * variables so admins can rotate keys live without redeploying.
 */
function getConfig() {
  try {
    const db = getDb();
    const get = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
    return {
      cloud_name: get('cloudinary_cloud_name') || process.env.CLOUDINARY_CLOUD_NAME || '',
      api_key:    get('cloudinary_api_key')    || process.env.CLOUDINARY_API_KEY    || '',
      api_secret: get('cloudinary_api_secret') || process.env.CLOUDINARY_API_SECRET || '',
    };
  } catch (_) {
    return {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
      api_key:    process.env.CLOUDINARY_API_KEY    || '',
      api_secret: process.env.CLOUDINARY_API_SECRET || '',
    };
  }
}

/**
 * Returns true when all three Cloudinary credentials are present and non-empty.
 * @param {{cloud_name:string, api_key:string, api_secret:string}} cfg
 * @returns {boolean}
 */
function isConfigured(cfg) {
  return !!(cfg.cloud_name && cfg.api_key && cfg.api_secret);
}

/**
 * Extract the Cloudinary public_id from an image URL so we can delete it later.
 * URL format: https://res.cloudinary.com/{cloud}/image/upload/v{ver}/{public_id}.{ext}
 */
function getPublicId(url) {
  if (!url || !url.includes('cloudinary.com')) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
  if (!match) return null;
  return match[1].replace(/\.[^.]+$/, '');
}

/** Best-effort delete of an image — silently no-ops on non-Cloudinary URLs. */
async function destroyIfCloudinary(url) {
  const publicId = getPublicId(url);
  if (!publicId) return;
  try {
    cloudinary.config(getConfig());
    await cloudinary.uploader.destroy(publicId);
  } catch (_) {
    // Non-fatal — image may already be deleted, or credentials may have been rotated
  }
}

/** Reject any file that isn't an image based on its mimetype. */
function imageOnlyFilter(_req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed'));
  }
  cb(null, true);
}

/**
 * Multer disk storage fallback used when Cloudinary credentials aren't set.
 * Files go into server/uploads/{folder}/ and are served via /uploads/* in app.js.
 */
function localUpload(folder, publicIdFn, sizeLimitMb, fieldName, req, res, next) {
  const uploadsDir = path.join(__dirname, '..', 'uploads', folder);
  fs.mkdirSync(uploadsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${publicIdFn(_req, file)}${ext}`);
    },
  });

  multer({
    storage,
    limits: { fileSize: sizeLimitMb * 1024 * 1024 },
    fileFilter: imageOnlyFilter,
  }).single(fieldName)(req, res, (err) => {
    if (err) return next(err);
    if (req.file) {
      const rel = path.relative(path.join(__dirname, '..', 'uploads'), req.file.path);
      req.file.path = `/uploads/${rel.replace(/\\/g, '/')}`;
    }
    next();
  });
}

/**
 * Build a multer-compatible uploader. Config is read from DB on every request,
 * so credentials updated in the Integrations tab take effect immediately.
 *
 * @param {string} folder Cloudinary folder (also used for local fallback)
 * @param {(req: any, file: any) => string} publicIdFn Generates a per-file id
 * @param {number} sizeLimitMb Max upload size in megabytes
 */
function makeUpload(folder, publicIdFn, sizeLimitMb = 5) {
  return {
    single(fieldName) {
      return (req, res, next) => {
        const cfg = getConfig();
        if (!isConfigured(cfg)) {
          return localUpload(folder, publicIdFn, sizeLimitMb, fieldName, req, res, next);
        }
        cloudinary.config(cfg);
        const storage = new CloudinaryStorage({
          cloudinary,
          params: (_req, _file) => ({
            folder,
            public_id: publicIdFn(_req, _file),
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico'],
          }),
        });
        multer({
          storage,
          limits: { fileSize: sizeLimitMb * 1024 * 1024 },
          fileFilter: imageOnlyFilter,
        }).single(fieldName)(req, res, next);
      };
    },
  };
}

module.exports = { cloudinary, makeUpload, destroyIfCloudinary, getConfig, isConfigured };
