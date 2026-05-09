/**
 * Lightweight Agency Handy data hooks + helpers.
 * Centralizes /api/agencyhandy/* fetches so each component is concise and consistent.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { authClient, useAuth } from "@/lib/auth";

const CURRENCY_SYMBOLS = {
  PHP: "₱",
  USD: "$",
  EUR: "€",
  GBP: "£",
  SGD: "S$",
  AUD: "A$",
  CAD: "C$",
  JPY: "¥",
};

export function currencySymbol(code) {
  if (!code) return "";
  return CURRENCY_SYMBOLS[code.toUpperCase()] || `${code} `;
}

export function formatMoney(amount, currency = "USD", { maximumFractionDigits = 0 } = {}) {
  if (amount === null || amount === undefined) return "—";
  const num = Number(amount);
  if (Number.isNaN(num)) return "—";
  const sym = currencySymbol(currency);
  return `${sym}${num.toLocaleString(undefined, { maximumFractionDigits })}`;
}

export function formatDateTime(value, { dateOnly = false } = {}) {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  if (dateOnly) {
    return dt.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return dt.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeFromNow(value) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const diffMs = dt.getTime() - Date.now();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (Math.abs(days) < 1) {
    const hrs = Math.round(diffMs / (1000 * 60 * 60));
    if (hrs === 0) return "now";
    return hrs > 0 ? `in ${hrs}h` : `${Math.abs(hrs)}h ago`;
  }
  if (days > 0) return `in ${days}d`;
  return `${Math.abs(days)}d ago`;
}

export function useAgencyHandy() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);

  const fetcher = useCallback(
    async (path, params) => {
      const r = await api.get(`/agencyhandy${path}`, { params, timeout: 60000 });
      return r.data;
    },
    [api]
  );

  const refresh = useCallback(async () => {
    const r = await api.post(`/agencyhandy/refresh`);
    return r.data;
  }, [api]);

  return { fetcher, refresh };
}

/**
 * Generic resource hook: fetches once on mount and exposes reload.
 * resource example: '/summary', '/subscriptions', '/proposals'
 */
export function useAgencyHandyResource(resource, params) {
  const { fetcher } = useAgencyHandy();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const paramsKey = JSON.stringify(params || {});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetcher(resource, params);
      setData(d);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher, resource, paramsKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

export const PROPOSAL_STATUS_VARIANT = {
  sent: "bg-blue-100 text-blue-900",
  viewed: "bg-blue-100 text-blue-900",
  opened: "bg-blue-100 text-blue-900",
  accepted: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
  draft: "bg-secondary text-foreground",
  expired: "bg-amber-100 text-amber-900",
};

export function stripHtml(html) {
  if (!html) return "";
  return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
