import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

function decodeToken(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('admin_token'));

  const user = token ? decodeToken(token) : null;

  const login = (newToken) => {
    setToken(newToken);
    localStorage.setItem('admin_token', newToken);
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('admin_token');
  };

  // Returns true if the logged-in admin has the given permission (or is a superadmin).
  const hasPermission = useCallback((permission) => {
    if (!user) return false;
    if (user.is_superadmin) return true;
    return Array.isArray(user.permissions) && user.permissions.includes(permission);
  }, [user]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
