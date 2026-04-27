/**
 * Format a YYYY-MM-DD string as a long date with weekday.
 * Returns '' for missing/invalid input. Treated as a local-timezone date so
 * the displayed weekday matches the date the admin entered.
 *
 * @param {string} dateStr ISO date (YYYY-MM-DD)
 */
export function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
  });
}

/**
 * Format a YYYY-MM-DD string as a short calendar date (e.g. "Apr 14, 2026").
 * Anchored to noon UTC to avoid timezone drift across midnight boundaries.
 *
 * @param {string} dateStr ISO date (YYYY-MM-DD)
 */
export function formatTournamentDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

/**
 * True if registration for a tournament has closed — either the event date
 * has passed, or the explicit `registration_closes_at` cutoff is in the past.
 *
 * @param {{event_date?: string, registration_closes_at?: string}} t
 */
export function isRegistrationClosed(t) {
  const now = new Date();
  if (t.event_date) {
    const [y, m, d] = t.event_date.split('-');
    if (new Date(+y, +m - 1, +d) < now) return true;
  }
  if (t.registration_closes_at && new Date(t.registration_closes_at) < now) return true;
  return false;
}
