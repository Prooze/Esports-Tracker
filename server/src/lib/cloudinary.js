const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
    await cloudinary.uploader.destroy(publicId);
  } catch (_) {
    // Non-fatal — image may already be deleted
  }
}

function makeStorage(folder, publicIdFn) {
  return new CloudinaryStorage({
    cloudinary,
    params: (req, file) => ({
      folder,
      public_id: publicIdFn(req, file),
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico'],
    }),
  });
}

function makeUpload(folder, publicIdFn, sizeLimitMb = 5) {
  return multer({
    storage: makeStorage(folder, publicIdFn),
    limits: { fileSize: sizeLimitMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed'));
      }
      cb(null, true);
    },
  });
}

module.exports = { cloudinary, makeUpload, destroyIfCloudinary };
