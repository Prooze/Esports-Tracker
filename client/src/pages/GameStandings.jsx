import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import GameIcon from '../components/GameIcon';
import { apiBase } from '../lib/api';

function TournamentRow({ tournament }) {
  const [expanded, setExpanded] = useState(false);
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (!expanded && !standings) {
      setLoading(true);
      const res = await fetch(`${apiBase}/api/tournaments/${tournament.id}/standings`);
      const data = await res.json();
      setStandings(data.standings);
      setLoading(false);
    }
    setExpanded((v) => !v);
  };

  const dateStr = tournament.date
    ? new Date(tournament.date + 'T12:00:00').toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'No date';

  return (
    <div className="tournament-row">
      <button className="tournament-header" onClick={toggle}>
        <span className="tournament-name">{tournament.name}</span>
        {tournament.event_name && (
          <span className="tournament-event">{tournament.event_name}</span>
        )}
        <span className="tournament-date">{dateStr}</span>
        <span className="tournament-players">{tournament.player_count} players</span>
        <span className={`tournament-chevron${expanded ? ' open' : ''}`}>▼</span>
      </button>

      {expanded && (
        <div className="tournament-standings">
          {loading ? (
            <div className="loading-small">Loading...</div>
          ) : standings && standings.length > 0 ? (
            <table className="standings-table compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => (
                  <tr
                    key={s.id}
                    className={
                      s.placement === 1
                        ? 'top-1'
                        : s.placement === 2
                        ? 'top-2'
                        : s.placement === 3
                        ? 'top-3'
                        : ''
                    }
                  >
                    <td className="placement">{s.placement}</td>
                    <td>{s.player_name}</td>
                    <td className="points">{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="loading-small">No standings data.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GameStandings() {
  const { id } = useParams();
  const [game, setGame] = useState(null);
  const [availableYears, setAvailableYears] = useState(null); // null = not yet loaded
  const [year, setYear] = useState(null);
  const [standings, setStandings] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Bootstrap: fetch available years (and game info) whenever the game id changes.
  // Also loads standings/tournaments for the most recent year automatically.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setGame(null);
    setAvailableYears(null);
    setYear(null);
    setStandings([]);
    setTournaments([]);

    async function bootstrap() {
      const yearsRes = await fetch(`${apiBase}/api/games/${id}/years`);
      if (!yearsRes.ok) throw new Error('Game not found');
      const { game: g, years } = await yearsRes.json();
      if (cancelled) return;

      setGame(g);
      setAvailableYears(years);

      if (years.length === 0) {
        setLoading(false);
        return;
      }

      const latestYear = years[0];
      setYear(latestYear);

      const [sData, tData] = await Promise.all([
        fetch(`${apiBase}/api/games/${id}/standings?year=${latestYear}`).then((r) => r.json()),
        fetch(`${apiBase}/api/games/${id}/tournaments?year=${latestYear}`).then((r) => r.json()),
      ]);
      if (cancelled) return;

      setStandings(sData.standings);
      setTournaments(tData);
      setLoading(false);
    }

    bootstrap().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // Called when the user clicks a different year button.
  const handleYearChange = async (yr) => {
    if (yr === year) return;
    setYear(yr);
    setLoading(true);
    const [sData, tData] = await Promise.all([
      fetch(`${apiBase}/api/games/${id}/standings?year=${yr}`).then((r) => r.json()),
      fetch(`${apiBase}/api/games/${id}/tournaments?year=${yr}`).then((r) => r.json()),
    ]);
    setStandings(sData.standings);
    setTournaments(tData);
    setLoading(false);
  };

  if (loading || availableYears === null) return <div className="loading">Loading...</div>;
  if (!game) return <div className="container"><p>Game not found.</p></div>;

  return (
    <main className="container">
      <div className="page-header">
        <Link to="/" className="back-link">← All Games</Link>
        <div className="page-title-row">
          <h1 className="page-title">
            <GameIcon game={game} size={48} />
            {game.name}
          </h1>
          {availableYears.length > 0 && (
            <div className="year-selector">
              {availableYears.map((y) => (
                <button
                  key={y}
                  className={`year-btn${y === year ? ' active' : ''}`}
                  onClick={() => handleYearChange(y)}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {availableYears.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 48 }}>
          No tournaments recorded yet.
        </div>
      ) : (
        <>
          <section className="section">
            <h2 className="section-title">{year} Season Standings</h2>
            {standings.length === 0 ? (
              <div className="empty-state">No tournament data for {year}.</div>
            ) : (
              <table className="standings-table season">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Points</th>
                    <th>Wins</th>
                    <th>Top 3</th>
                    <th>Events</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s, i) => (
                    <tr
                      key={s.player_name}
                      className={i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : ''}
                    >
                      <td className="rank">{i + 1}</td>
                      <td className="player-name">{s.player_name}</td>
                      <td className="points">{s.total_points}</td>
                      <td>{s.wins}</td>
                      <td>{s.top3}</td>
                      <td>{s.tournaments_played}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="section">
            <h2 className="section-title">{year} Tournaments</h2>
            {tournaments.length === 0 ? (
              <div className="empty-state">No tournaments for {year}.</div>
            ) : (
              <div className="tournament-list">
                {tournaments.map((t) => (
                  <TournamentRow key={t.id} tournament={t} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
