import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import GameIcon from '../components/GameIcon';
import { apiBase } from '../lib/api';

export default function Home() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/api/games`)
      .then((r) => r.json())
      .then((data) => { setGames(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="container">
      <div className="hero">
        <h1 className="hero-title">TOURNAMENT<br />STANDINGS</h1>
        <p className="hero-subtitle">Track season points across all your games</p>
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
