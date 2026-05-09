import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const AuthContext = createContext({
  user: null,
  token: null,
  loading: true,
  login: async () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

const LS_TOKEN = "bloom_admin_token";
const LS_USER = "bloom_admin_user";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(LS_TOKEN));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_USER) || "null");
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Validate existing token
  useEffect(() => {
    let cancelled = false;
    const validate = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const r = await axios.get(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setUser(r.data);
      } catch {
        if (!cancelled) {
          setToken(null);
          setUser(null);
          localStorage.removeItem(LS_TOKEN);
          localStorage.removeItem(LS_USER);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    validate();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback(async (email, password) => {
    const r = await axios.post(`${API}/auth/login`, { email, password });
    setToken(r.data.access_token);
    setUser(r.data.user);
    localStorage.setItem(LS_TOKEN, r.data.access_token);
    localStorage.setItem(LS_USER, JSON.stringify(r.data.user));
    return r.data;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function RequireAuth({ children }) {
  const { token, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!token) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }
  return children;
}

// Axios helper that auto-injects token
export function authClient(token) {
  const inst = axios.create({ baseURL: API });
  inst.interceptors.request.use((cfg) => {
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
    return cfg;
  });
  return inst;
}
