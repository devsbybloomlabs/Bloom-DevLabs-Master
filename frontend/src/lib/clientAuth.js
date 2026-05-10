import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const ClientAuthContext = createContext({
  client: null,
  token: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  refreshClient: async () => {},
});

export const useClientAuth = () => useContext(ClientAuthContext);

const LS_TOKEN = "bloom_client_token";
const LS_CLIENT = "bloom_client_user";

export function ClientAuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(LS_TOKEN));
  const [client, setClient] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_CLIENT) || "null");
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const validate = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const r = await axios.get(`${API}/clients/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) {
          setClient(r.data);
          localStorage.setItem(LS_CLIENT, JSON.stringify(r.data));
        }
      } catch {
        if (!cancelled) {
          setToken(null);
          setClient(null);
          localStorage.removeItem(LS_TOKEN);
          localStorage.removeItem(LS_CLIENT);
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
    const r = await axios.post(`${API}/clients/login`, { email, password });
    setToken(r.data.access_token);
    setClient(r.data.client);
    localStorage.setItem(LS_TOKEN, r.data.access_token);
    localStorage.setItem(LS_CLIENT, JSON.stringify(r.data.client));
    return r.data;
  }, []);

  const register = useCallback(async (payload) => {
    const r = await axios.post(`${API}/clients/register`, payload);
    setToken(r.data.access_token);
    setClient(r.data.client);
    localStorage.setItem(LS_TOKEN, r.data.access_token);
    localStorage.setItem(LS_CLIENT, JSON.stringify(r.data.client));
    return r.data;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setClient(null);
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_CLIENT);
  }, []);

  const refreshClient = useCallback(async () => {
    if (!token) return null;
    const r = await axios.get(`${API}/clients/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setClient(r.data);
    localStorage.setItem(LS_CLIENT, JSON.stringify(r.data));
    return r.data;
  }, [token]);

  return (
    <ClientAuthContext.Provider
      value={{ client, token, loading, login, register, logout, refreshClient }}
    >
      {children}
    </ClientAuthContext.Provider>
  );
}

export function RequireClient({ children }) {
  const { token, loading } = useClientAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

export function clientApi(token) {
  const inst = axios.create({ baseURL: API });
  inst.interceptors.request.use((cfg) => {
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
    return cfg;
  });
  return inst;
}
