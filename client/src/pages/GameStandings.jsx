import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import GameIcon from '../components/GameIcon';
import { resolveImageUrl } from '../utils/images';
import { formatEventDate, formatTournamentDate, isRegistrationClosed } from '../utils/dates';
import { applyRanks } from '../utils/rankings';
import { getRecordingInfo } from '../utils/streams';
import { publicApi } from '../api';

function TournamentRow({ tournament }) {
  const [expanded, setExpanded] = useState(false);
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (!expanded && !standings) {
      setLoading(true);
      try {
        const data = await publicApi.getTournamentStandings(tournament.id);
        setStandings(data.standings);
      } catch (_) {
        setStandings([]);
      } finally {
        setLoading(false);
      }
    }
    setExpanded((v) => !v);
  };

  const dateStr = tournament.date ? formatTournamentDate(tournament.date) : 'No date';

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
                      s.placement === 1 ? 'top-1'
                        : s.placement === 2 ? 'top-2'
                        : s.placement === 3 ? 'top-3'
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
  const [availableYears, setAvailableYears] = useState(null);
  const [year, setYear] = useState(null);
  const [standings, setStandings] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [upcoming, setUpcoming] = useState([]);

  useEffect(() => {
    setUpcoming([]);
    publicApi.getUpcomingForGame(id)
      .then((data) => { if (Array.isArray(data)) setUpcoming(data); })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setGame(null);
    setAvailableYears(null);
    setYear(null);
    setStandings([]);
    setTournaments([]);

    async function bootstrap() {
      const { game: g, years } = await publicApi.getGameYears(id);
      if (cancelled) return;

      setGame(g);
      setAvailableYears(years);

      if (years.length === 0) { setLoading(false); return; }

      const latestYear = years[0];
      setYear(latestYear);

      const [sData, tData] = await Promise.all([
        publicApi.getGameStandings(id, latestYear),
        publicApi.getGameTournaments(id, latestYear),
      ]);
      if (cancelled) return;

      setStandings(applyRanks(sData.standings));
      setTournaments(tData);
      setLoading(false);
    }

    bootstrap().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const handleYearChange = async (yr) => {
    if (yr === year) return;
    setYear(yr);
    setLoading(true);
    try {
      const [sData, tData] = await Promise.all([
        publicApi.getGameStandings(id, yr),
        publicApi.getGameTournaments(id, yr),
      ]);
      setStandings(applyRanks(sData.standings));
      setTournaments(tData);
    } finally {
      setLoading(false);
    }
  };

  if (loading || availableYears === null) return <div className="loading">Loading...</div>;
  if (!game) return <div className="container"><p>Game not found.</p></div>;

  const recordings = tournaments.filter((t) => t.recording_url);

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
                  {standings.map((s) => (
                    <tr
                      key={s.player_name}
                      className={s.rank === 1 ? 'top-1' : s.rank === 2 ? 'top-2' : s.rank === 3 ? 'top-3' : ''}
                    >
                      <td className="rank">{s.rank}</td>
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
                {tournaments.map((t) => <TournamentRow key={t.id} tournament={t} />)}
              </div>
            )}
          </section>
        </>
      )}

      {recordings.length > 0 && (
        <section className="section">
          <h2 className="section-title">Past Recordings</h2>
          <div className="recording-grid">
            {recordings.map((t) => {
              const info = getRecordingInfo(t.recording_url);
              return (
                <a
                  key={t.id}
                  href={t.recording_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="recording-card"
                >
                  <div className="recording-thumb">
                    {info?.thumbnail
                      ? <img src={info.thumbnail} alt={t.name} />
                      : <div className="recording-thumb-placeholder">▶</div>
                    }
                  </div>
                  <div className="recording-info">
                    <div className="recording-name">{t.name}</div>
                    {t.date && <div className="recording-date">{formatTournamentDate(t.date)}</div>}
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="upcoming-section">
          <h2 className="upcoming-title">Upcoming Tournaments</h2>
          <div className="upcoming-grid">
            {upcoming.map((t) => (
              <div key={t.id} className="upcoming-card">
                {t.icon_path
                  ? <img src={resolveImageUrl(t.icon_path)} alt={game?.name || ''} className="upcoming-game-icon" />
                  : t.icon_emoji && <span className="upcoming-game-emoji">{t.icon_emoji}</span>
                }
                <div className="upcoming-card-header">
                  <span className="upcoming-date">{formatEventDate(t.event_date)}</span>
                </div>
                <div className="upcoming-card-name">{t.name}</div>
                {t.location && <div className="upcoming-venue">{t.location}</div>}
                {t.description && <div className="upcoming-desc">{t.description}</div>}
                {t.startgg_url && (
                  isRegistrationClosed(t)
                    ? <span className="registration-closed">Registration Closed</span>
                    : (
                      <a href={t.startgg_url} className="upcoming-register" target="_blank" rel="noopener noreferrer">
                        Register on start.gg
                      </a>
                    )
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
