import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import GameIcon from '../components/GameIcon';
import { useBranding } from '../context/BrandingContext';
import { apiBase } from '../lib/api';

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function Home() {
  const [games, setGames] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const { branding } = useBranding();

  useEffect(() => {
    fetch(`${apiBase}/api/games`)
      .then((r) => r.json())
      .then((data) => { setGames(data); setLoading(false); })
      .catch(() => setLoading(false));

    fetch(`${apiBase}/api/upcoming`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setUpcoming(data); })
      .catch(() => {});
  }, []);

  return (
    <main className="container">
      <div className={`hero${branding.hero_banner ? ' hero-has-banner' : ''}`}>
        {branding.hero_banner && (
          <>
            <img
              src={`${apiBase}${branding.hero_banner}`}
              alt=""
              className="hero-banner-img"
              aria-hidden="true"
            />
            <div className="hero-banner-overlay" aria-hidden="true" />
          </>
        )}
        <div className="hero-content">
          <h1 className="hero-title">{(branding.site_name || 'Esports Standings').toUpperCase()}</h1>
          <p className="hero-subtitle">{branding.site_tagline || 'Local Circuit'}</p>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading games...</div>
      ) : games.length === 0 ? (
        <div className="empty-state">
          No games configured yet.{' '}
          <Link to="/login" className="link">Admin login</Link> to add some.
        </div>
      ) : (
        <div className="game-grid">
          {games.map((game) => (
            <Link to={`/game/${game.id}`} key={game.id} className="game-card">
              <GameIcon game={game} size={64} />
              <span className="game-name">{game.name}</span>
            </Link>
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="upcoming-section">
          <h2 className="upcoming-title">Upcoming Tournaments</h2>
          <div className="upcoming-grid">
            {upcoming.map((t) => (
              <div key={t.id} className="upcoming-card">
                <div className="upcoming-card-header">
                  {t.game_name && (
                    <span className="upcoming-game">
                      {t.icon_emoji} {t.game_name}
                    </span>
                  )}
                  <span className="upcoming-date">{formatEventDate(t.event_date)}</span>
                </div>
                <div className="upcoming-card-name">{t.name}</div>
                {t.location && <div className="upcoming-venue">{t.location}</div>}
                {t.description && <div className="upcoming-desc">{t.description}</div>}
                {t.startgg_url && (
                  <a
                    href={t.startgg_url}
                    className="upcoming-register"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Register on start.gg
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
