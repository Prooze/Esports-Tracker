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

function isConfigured(cfg) {
  return !!(cfg.cloud_name && cfg.api_key && cfg.api_secret);
}

// Extract public_id from a Cloudinary URL so we can delete it later.
// URL format: https://res.cloudinary.com/{cloud}/image/upload/v{ver}/{public_id}.{ext}
function getPublicId(url) {
  if (!url || !url.includes('cloudinary.com')) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
  if (!match) return null;
  return match[1].replace(/\.[^.]+$/, ''); // strip extension
}

async function destroyIfCloudinary(url) {
  const publicId = getPublicId(url);
  if (!publicId) return;
  try {
    cloudinary.config(getConfig());
    await cloudinary.uploader.destroy(publicId);
  } catch (_) {
    // Non-fatal — image may already be deleted
  }
}

function localUpload(folder, publicIdFn, sizeLimitMb, fieldName, req, res, next) {
  const uploadsDir = path.join(__dirname, '../../uploads', folder);
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
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
      cb(null, true);
    },
  }).single(fieldName)(req, res, (err) => {
    if (err) return next(err);
    if (req.file) {
      const rel = path.relative(path.join(__dirname, '../../uploads'), req.file.path);
      req.file.path = `/uploads/${rel.replace(/\\/g, '/')}`;
    }
    next();
  });
}

// Returns an object with a .single() method compatible with multer instances.
// Config is read from DB (with env var fallback) per-request, so credentials
// updated in the Integrations settings take effect immediately.
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
          fileFilter: (_req, file, cb) => {
            if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
            cb(null, true);
          },
        }).single(fieldName)(req, res, next);
      };
    },
  };
}

module.exports = { cloudinary, makeUpload, destroyIfCloudinary, getConfig, isConfigured };
