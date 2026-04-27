import { apiBase } from '../utils/images';

/**
 * Centralised fetch wrapper. All client → server calls go through here so
 * error handling and auth are consistent.
 *
 * Usage: `await api('/api/games')` for GET, or `api(path, { method, body, token })`.
 *
 * Throws on non-2xx with the server's `message` (or `error` for compat).
 */
async function api(path, { method = 'GET', body, token, headers, signal } = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
    signal,
  });

  // 204 No Content
  if (res.status === 204) return null;

  let data;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok) {
    const message = data?.message || data?.error || `Request failed with status ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ─── Public ──────────────────────────────────────────────────────────────────
export const publicApi = {
  getSettings:        () => api('/api/settings/public'),
  getUpcoming:        () => api('/api/upcoming'),
  getUpcomingForGame: (gameId) => api(`/api/upcoming/game/${gameId}`),
  getGames:           () => api('/api/games'),
  getGameYears:       (id) => api(`/api/games/${id}/years`),
  getGameStandings:   (id, year) => api(`/api/games/${id}/standings?year=${year}`),
  getGameTournaments: (id, year) => api(`/api/games/${id}/tournaments?year=${year}`),
  getTournamentStandings: (id) => api(`/api/tournaments/${id}/standings`),
};

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username, password) => api('/api/auth/login', { method: 'POST', body: { username, password } }),
};

// ─── Admin ───────────────────────────────────────────────────────────────────
const adminPrefix = '/api/admin';

/** Build an admin API client bound to a JWT token. */
export function adminApi(token) {
  const call = (path, opts = {}) => api(`${adminPrefix}${path}`, { ...opts, token });

  // Multipart upload helper — does not set Content-Type so the browser can
  // generate the multipart boundary. Field name defaults to `file`.
  const upload = (path, file, fieldName = 'file') => {
    const fd = new FormData();
    fd.append(fieldName, file);
    return call(path, { method: 'POST', body: fd });
  };

  return {
    // Bulk loaders
    getGames:        () => call('/games'),
    getTournaments: () => call('/tournaments'),
    getSettings:     () => call('/settings'),
    getAccounts:     () => call('/accounts'),
    getUpcoming:     () => call('/upcoming'),
    getPendingGames: () => call('/startgg/pending-games'),

    // Games
    createGame:    (body) => call('/games', { method: 'POST', body }),
    renameGame:    (id, name) => call(`/games/${id}`, { method: 'PUT', body: { name } }),
    deleteGame:    (id) => call(`/games/${id}`, { method: 'DELETE' }),
    uploadGameIcon: (id, file) => upload(`/games/${id}/icon`, file, 'icon'),
    removeGameIcon: (id) => call(`/games/${id}/icon`, { method: 'DELETE' }),

    // Tournaments
    createTournament: (body) => call('/tournaments', { method: 'POST', body }),
    updateTournament: (id, body) => call(`/tournaments/${id}`, { method: 'PUT', body }),
    deleteTournament: (id) => call(`/tournaments/${id}`, { method: 'DELETE' }),
    checkCompletions: () => call('/tournaments/check-completions', { method: 'POST' }),
    getCompletionLog: () => call('/tournaments/completion-log'),

    // start.gg integration
    lookupStartgg:    (url) => call('/startgg/lookup', { method: 'POST', body: { url } }),
    importStartgg:    (body) => call('/startgg/import', { method: 'POST', body }),
    syncOrganizer:    (url) => call('/startgg/sync-organizer', { method: 'POST', body: { url } }),
    approvePending:   (id, body) => call(`/startgg/pending-games/${id}/approve`, { method: 'POST', body }),
    dismissPending:   (id) => call(`/startgg/pending-games/${id}`, { method: 'DELETE' }),

    // Upcoming
    createUpcoming: (body) => call('/upcoming', { method: 'POST', body }),
    updateUpcoming: (id, body) => call(`/upcoming/${id}`, { method: 'PUT', body }),
    deleteUpcoming: (id) => call(`/upcoming/${id}`, { method: 'DELETE' }),
    dismissUpcoming: (id) => call(`/upcoming/${id}/dismiss`, { method: 'POST' }),
    forceImportUpcoming: (id) => call(`/upcoming/${id}/import-standings`, { method: 'POST' }),

    // Accounts
    createAccount: (body) => call('/accounts', { method: 'POST', body }),
    updateAccount: (id, body) => call(`/accounts/${id}`, { method: 'PUT', body }),
    deleteAccount: (id) => call(`/accounts/${id}`, { method: 'DELETE' }),

    // Integrations
    getIntegrations:   () => call('/integrations'),
    saveIntegrations:  (body) => call('/integrations', { method: 'PUT', body }),
    testCloudinary:    () => call('/integrations/test-cloudinary', { method: 'POST' }),

    // Branding
    saveBranding:    (body) => call('/settings/branding', { method: 'PUT', body }),
    saveStream:      (body) => call('/settings/stream', { method: 'PUT', body }),
    uploadBranding:  (type, file) => upload(`/settings/${type}`, file),
    removeBranding:  (type) => call(`/settings/${type}`, { method: 'DELETE' }),
  };
}
