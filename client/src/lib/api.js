// Base URL for all API and upload requests.
// In production set VITE_API_URL to the Railway server service URL (e.g. https://my-server.up.railway.app).
// In local dev leave it unset — the Vite proxy handles /api and /uploads automatically.
export const apiBase = import.meta.env.VITE_API_URL || '';

// Resolve an image path to a usable src URL.
// Cloudinary URLs are already absolute; legacy local paths need the apiBase prefix.
export function resolveImageUrl(path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${apiBase}${path}`;
}
