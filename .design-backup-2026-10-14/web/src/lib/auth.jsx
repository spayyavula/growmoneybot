import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import * as api from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(api.getToken()));

  const logout = useCallback(() => {
    api.setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    api.setUnauthorizedHandler(logout);
    if (!api.getToken()) return;
    api.me()
      .then((d) => setUser(d.user))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const finish = (d) => {
    api.setToken(d.token);
    setUser(d.user);
    return d.user;
  };

  const value = {
    user,
    loading,
    setUser,
    logout,
    login: async (body) => finish(await api.login(body)),
    signup: async (body) => finish(await api.signup(body)),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
