// Base URL for API and upload requests.
// In production set VITE_API_URL to the backend service URL.
// In local dev leave it unset — Vite proxies /api and /uploads automatically.
export const apiBase = import.meta.env.VITE_API_URL || '';

/**
 * Resolve an image path to a usable src URL. Cloudinary URLs (or any other
 * absolute URL) are returned as-is; relative paths are prefixed with apiBase.
 */
export function resolveImageUrl(path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${apiBase}${path}`;
}
