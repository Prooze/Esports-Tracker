import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo">ESPORTS TRACKER</Link>
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
