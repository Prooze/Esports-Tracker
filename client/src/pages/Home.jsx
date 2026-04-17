import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import GameIcon from '../components/GameIcon';
import { useBranding } from '../context/BrandingContext';
import { apiBase } from '../lib/api';

export default function Home() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const { branding } = useBranding();

  useEffect(() => {
    fetch(`${apiBase}/api/games`)
      .then((r) => r.json())
      .then((data) => { setGames(data); setLoading(false); })
      .catch(() => setLoading(false));
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
    </main>
  );
}
