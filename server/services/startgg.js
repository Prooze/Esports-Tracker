const db = require('../db');

const STARTGG_API_URL = 'https://api.start.gg/gql/alpha';

/**
 * Run a GraphQL query against the start.gg API.
 * @param {string} query GraphQL query string
 * @param {object} variables Variables object for the query
 * @param {string} token Personal Access Token
 * @throws if the API returns a non-2xx status or a GraphQL error
 */
async function startggQuery(query, variables, token) {
  const res = await fetch(STARTGG_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`start.gg responded with ${res.status}`);

  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

/** Read the saved start.gg API token from settings, or null. */
function getToken() {
  return db.prepare("SELECT value FROM settings WHERE key = 'startgg_token'").get()?.value || null;
}

/**
 * Extract the bare tournament slug from any start.gg URL variant.
 *   https://www.start.gg/tournament/my-slug/register   → my-slug
 *   https://www.start.gg/tournament/my-slug/event/foo  → my-slug
 *   https://start.gg/tournament/my-slug                → my-slug
 */
function extractTournamentSlug(url) {
  if (!url) return null;
  const m = url.match(/start\.gg\/tournament\/([^/?#]+)/i);
  return m ? m[1] : null;
}

/** Extract the bare organizer slug from a /user/ or /org/ start.gg URL. */
function extractOrganizerSlug(url) {
  if (!url) return null;
  const m = url.match(/start\.gg\/(?:user|org)\/([^/?#]+)/);
  return m ? m[1] : null;
}

const TOURNAMENT_LOOKUP_QUERY = `query TournamentLookup($slug: String!) {
  tournament(slug: $slug) {
    id
    name
    startAt
    events {
      id
      name
      numEntrants
      videogame { id name }
    }
  }
}`;

const EVENT_STANDINGS_QUERY = `query EventStandings($eventId: ID!, $page: Int!, $perPage: Int!) {
  event(id: $eventId) {
    id
    name
    standings(query: { page: $page, perPage: $perPage }) {
      nodes {
        placement
        entrant { name }
      }
    }
  }
}`;

const TOURNAMENT_STATUS_QUERY = `query TournamentStatus($slug: String!) {
  tournament(slug: $slug) {
    id
    name
    state
    events {
      id
      name
      state
      videogame { id name }
      phases { id name state }
      standings(query: { page: 1, perPage: 64 }) {
        nodes {
          placement
          entrant {
            participants { gamerTag prefix }
          }
        }
      }
    }
  }
}`;

const ORGANIZER_TOURNAMENTS_QUERY = `query OrganizerTournaments($slug: String!) {
  user(slug: $slug) {
    tournaments(query: { filter: { upcoming: true, tournamentView: "admin" } }) {
      nodes {
        id
        name
        slug
        startAt
        registrationClosesAt
        events {
          id
          name
          videogame { id name }
        }
      }
    }
  }
}`;

/** Look up a tournament by slug. Returns the raw tournament object or null. */
async function lookupTournament(slug, token) {
  const data = await startggQuery(TOURNAMENT_LOOKUP_QUERY, { slug }, token);
  return data.tournament || null;
}

/** Fetch the top-`perPage` standings for an event. Returns the array of nodes. */
async function fetchEventStandings(eventId, token, perPage = 64) {
  const data = await startggQuery(
    EVENT_STANDINGS_QUERY,
    { eventId: String(eventId), page: 1, perPage },
    token
  );
  return data.event?.standings?.nodes ?? [];
}

/**
 * Sync upcoming tournaments hosted by a start.gg organizer. New events for
 * games we already track go straight into `upcoming_tournaments`; events for
 * unrecognised games go into `pending_games` for manual review.
 *
 * @returns {{tournaments_found:number, games_matched:number, upcoming_added:number, pending_games:number}}
 */
async function syncOrganizerTournaments(slug, token) {
  const data = await startggQuery(ORGANIZER_TOURNAMENTS_QUERY, { slug }, token);
  const tournaments = data.user?.tournaments?.nodes ?? [];

  let added = 0;
  let pending = 0;
  let skipped = 0;

  for (const tournament of tournaments) {
    // tournament.slug from the API is "tournament/slug-name" — strip the prefix
    const pureSlug = tournament.slug.replace(/^tournament\//, '');
    const tournamentUrl = `https://www.start.gg/tournament/${pureSlug}/register`;
    const eventDate = tournament.startAt
      ? new Date(tournament.startAt * 1000).toISOString().split('T')[0]
      : null;
    const registrationClosesAt = tournament.registrationClosesAt
      ? new Date(tournament.registrationClosesAt * 1000).toISOString()
      : null;

    const seenGames = new Set();
    for (const event of (tournament.events || [])) {
      const gameName = event.videogame?.name;
      if (!gameName || seenGames.has(gameName.toLowerCase())) continue;
      seenGames.add(gameName.toLowerCase());

      const game = db.prepare('SELECT * FROM games WHERE lower(name) = lower(?)').get(gameName);

      if (game) {
        const existing = db.prepare(
          'SELECT id FROM upcoming_tournaments WHERE startgg_url = ?'
        ).get(tournamentUrl);

        if (!existing) {
          db.prepare(
            `INSERT INTO upcoming_tournaments
             (name, game_id, event_date, startgg_url, registration_closes_at)
             VALUES (?, ?, ?, ?, ?)`
          ).run(tournament.name, game.id, eventDate, tournamentUrl, registrationClosesAt);
          added++;
        } else {
          if (registrationClosesAt) {
            db.prepare(
              `UPDATE upcoming_tournaments SET registration_closes_at = ?
               WHERE startgg_url = ? AND registration_closes_at IS NULL`
            ).run(registrationClosesAt, tournamentUrl);
          }
          skipped++;
        }
      } else {
        const alreadyPending = db.prepare(
          'SELECT id FROM pending_games WHERE lower(game_name) = lower(?) AND tournament_name = ?'
        ).get(gameName, tournament.name);

        if (!alreadyPending) {
          db.prepare(
            `INSERT INTO pending_games (game_name, tournament_name, startgg_tournament_url, event_date)
             VALUES (?, ?, ?, ?)`
          ).run(gameName, tournament.name, tournamentUrl, eventDate);
          pending++;
        }
      }
    }
  }

  return {
    tournaments_found: tournaments.length,
    added,
    pending,
    skipped,
  };
}

module.exports = {
  startggQuery,
  getToken,
  extractTournamentSlug,
  extractOrganizerSlug,
  lookupTournament,
  fetchEventStandings,
  syncOrganizerTournaments,
  TOURNAMENT_STATUS_QUERY,
};
