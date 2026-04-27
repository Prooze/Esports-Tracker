import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { resolveImageUrl } from '../utils/images';

export default function Navbar() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const { branding } = useBranding();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const logoContent = branding.site_logo ? (
    <img
      src={resolveImageUrl(branding.site_logo)}
      alt={branding.site_name || 'Logo'}
      style={{ height: 34, width: 'auto', objectFit: 'contain', display: 'block' }}
    />
  ) : (
    branding.site_name || 'ESPORTS TRACKER'
  );

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo">
          {logoContent}
        </Link>
        <div className="navbar-links">
          {token ? (
            <>
              <Link to="/admin">Dashboard</Link>
              {user?.username && (
                <span className="navbar-user">
                  {user.is_superadmin && <span className="badge badge-super" style={{ marginRight: 6 }}>Super Admin</span>}
                  {user.username}
                </span>
              )}
              <button onClick={handleLogout} className="btn-ghost small">Logout</button>
            </>
          ) : (
            <Link to="/login">Admin</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
