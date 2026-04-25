import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import GameIcon from '../components/GameIcon';
import { useBranding } from '../context/BrandingContext';
import { apiBase, resolveImageUrl } from '../lib/api';

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function isRegistrationClosed(t) {
  const now = new Date();
  if (t.event_date) {
    const [y, m, d] = t.event_date.split('-');
    if (new Date(+y, +m - 1, +d) < now) return true;
  }
  if (t.registration_closes_at && new Date(t.registration_closes_at) < now) return true;
  return false;
}

function detectPlatform(url) {
  if (!url) return null;
  if (/twitch\.tv\//i.test(url)) return 'twitch';
  if (/youtube\.com\/|youtu\.be\//i.test(url)) return 'youtube';
  if (/facebook\.com\/|fb\.watch\//i.test(url)) return 'facebook';
  return null;
}

function getEmbedUrl(url, platform) {
  if (platform === 'twitch') {
    const m = url.match(/twitch\.tv\/([^/?#]+)/i);
    const channel = m ? m[1] : '';
    const domain = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `https://player.twitch.tv/?channel=${channel}&parent=${domain}`;
  }
  if (platform === 'youtube') {
    const m1 = url.match(/[?&]v=([^&]+)/);
    const m2 = url.match(/youtu\.be\/([^/?#]+)/);
    const videoId = m1 ? m1[1] : m2 ? m2[1] : '';
    return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
  }
  if (platform === 'facebook') {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true`;
  }
  return null;
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

  const streamPlatform = detectPlatform(branding.stream_url);
  const streamEmbedUrl = branding.stream_active && branding.stream_url && streamPlatform
    ? getEmbedUrl(branding.stream_url, streamPlatform)
    : null;

  return (
    <main className="container">
      {streamEmbedUrl && (
        <section className="live-section">
          <div className="live-badge">
            <span className="live-dot" />
            LIVE NOW
          </div>
          <div className="live-embed-wrapper">
            <iframe
              src={streamEmbedUrl}
              className="live-embed"
              allowFullScreen
              allow={streamPlatform === 'facebook'
                ? 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share'
                : 'autoplay; fullscreen'}
              title="Live Stream"
              frameBorder="0"
            />
          </div>
        </section>
      )}

      <div className={`hero${branding.hero_banner ? ' hero-has-banner' : ''}`}>
        {branding.hero_banner && (
          <>
            <img
              src={resolveImageUrl(branding.hero_banner)}
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
                {t.icon_path
                  ? <img src={resolveImageUrl(t.icon_path)} alt={t.game_name || ''} className="upcoming-game-icon" />
                  : t.icon_emoji && <span className="upcoming-game-emoji">{t.icon_emoji}</span>
                }
                <div className="upcoming-card-header">
                  {t.game_name && (
                    <span className="upcoming-game">{t.game_name}</span>
                  )}
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
