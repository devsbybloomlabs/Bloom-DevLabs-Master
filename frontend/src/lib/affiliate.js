/**
 * Affiliate tracking helpers — cookie/localStorage based.
 *
 * On every page load, App.js mounts <AffiliateTracker /> which captures
 * a `?ref=CODE` URL param, stores it for 90 days, and pings the backend
 * to log the click event. The GetAuditPage reads this and passes
 * `affiliate_ref` along with the audit submission for attribution.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";

const COOKIE_KEY = "bloom_aff_ref";
const COOKIE_TTL_DAYS = 90;
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function setCookie(value) {
  if (typeof document === "undefined") return;
  const exp = new Date(Date.now() + COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000);
  // Cross-subdomain attribution: explicitly scope to root domain.
  const host = window.location.hostname;
  const parts = host.split(".");
  const root = parts.length >= 2 ? parts.slice(-2).join(".") : host;
  const isLocal = host === "localhost" || host.startsWith("127.");
  const domainAttr = isLocal ? "" : `; domain=.${root}`;
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(value)}; expires=${exp.toUTCString()}; path=/${domainAttr}; SameSite=Lax`;
  try {
    localStorage.setItem(COOKIE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function getAffiliateRef() {
  if (typeof document === "undefined") return null;
  // Prefer cookie, fall back to localStorage (incognito-friendly)
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]+)`));
  if (match) return decodeURIComponent(match[1]);
  try {
    return localStorage.getItem(COOKIE_KEY);
  } catch {
    return null;
  }
}

export function clearAffiliateRef() {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  try {
    localStorage.removeItem(COOKIE_KEY);
  } catch {
    /* ignore */
  }
}

async function trackClick(code, landingPath, referrer) {
  try {
    await axios.post(`${API}/affiliate/track-click`, {
      code,
      landing_path: landingPath,
      referrer: referrer || null,
    });
  } catch {
    /* network failure should not block the user — fire-and-forget */
  }
}

/**
 * Mount once at the root of the app. Looks for ?ref=CODE on first paint
 * and on every route change. First-touch attribution: do not overwrite
 * an existing cookie within the 90-day window.
 */
export default function AffiliateTracker() {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get("ref");
    if (!ref) return;
    if (!/^[a-z0-9]{6,16}$/i.test(ref)) return; // basic format check
    const existing = getAffiliateRef();
    // First-touch attribution: keep the earliest ref
    if (!existing) {
      setCookie(ref);
    }
    // Track every click (even repeat) so we can detect re-engagement
    trackClick(ref, location.pathname, document.referrer || null);
  }, [location.pathname, location.search]);

  return null;
}
