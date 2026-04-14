// Base URL for all API and upload requests.
// In production set VITE_API_URL to the Railway server service URL (e.g. https://my-server.up.railway.app).
// In local dev leave it unset — the Vite proxy handles /api and /uploads automatically.
export const apiBase = import.meta.env.VITE_API_URL || '';
