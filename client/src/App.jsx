import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BrandingProvider, useBranding } from './context/BrandingContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import GameStandings from './pages/GameStandings';
import Login from './pages/Login';
import Admin from './pages/Admin';
import { SocialIcon, SOCIAL_PLATFORMS } from './lib/socialIcons';

function ProtectedRoute({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function SiteFooter() {
  const { branding } = useBranding();
  const footerItems  = Array.isArray(branding.footer_links)  ? branding.footer_links  : [];
  const socialLinks  = Array.isArray(branding.social_links)  ? branding.social_links  : [];

  const hasFooterContent = footerItems.some(item =>
    (item.type === 'text' && item.content) ||
    ((item.type === 'link' || !item.type) && item.label && item.url)
  ) || socialLinks.some(l => l.url);
  if (!hasFooterContent) return null;

  return (
    <footer className="site-footer">
      {footerItems.length > 0 && (
        <nav className="footer-links" aria-label="Footer">
          {footerItems.map((item, i) => {
            if (item.type === 'text') {
              return item.content
                ? <span key={i} className="footer-text">{item.content}</span>
                : null;
            }
            // 'link' type or legacy items without a type field
            return item.label && item.url
              ? <a key={i} href={item.url} className="footer-link" target="_blank" rel="noopener noreferrer">{item.label}</a>
              : null;
          })}
        </nav>
      )}
      {socialLinks.some(l => l.url) && (
        <div className="social-links">
          {socialLinks.map((link, i) => {
            const platform = SOCIAL_PLATFORMS.find(p => p.key === link.platform);
            if (!platform || !link.url) return null;
            return (
              <a
                key={i}
                href={link.url}
                className="social-link"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={platform.label}
                title={platform.label}
              >
                <SocialIcon platform={link.platform} size={20} />
              </a>
            );
          })}
        </div>
      )}
    </footer>
  );
}

function AppRoutes() {
  const { branding } = useBranding();
  const hasAnnouncement = branding.announcement_active && branding.announcement_text;

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--announcement-offset',
      hasAnnouncement ? '36px' : '0px'
    );
  }, [hasAnnouncement]);

  return (
    <>
      {hasAnnouncement && (
        <div className="announcement-bar" role="banner">
          {branding.announcement_text}
        </div>
      )}
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/game/:id" element={<GameStandings />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
          }
        />
      </Routes>
      <SiteFooter />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrandingProvider>
        <AppRoutes />
      </BrandingProvider>
    </AuthProvider>
  );
}
