import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BrandingProvider, useBranding } from './context/BrandingContext';
import Navbar from './components/Navbar';
import SiteFooter from './components/SiteFooter';
import Home from './pages/Home';
import GameStandings from './pages/GameStandings';
import Login from './pages/Login';
import Admin from './pages/Admin';

function ProtectedRoute({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
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
