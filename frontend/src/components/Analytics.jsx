/**
 * Google Analytics 4 helper — only loads if REACT_APP_GA_MEASUREMENT_ID is set.
 * Tracks page views automatically on route change.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const GA_ID = process.env.REACT_APP_GA_MEASUREMENT_ID;

let initialized = false;

function loadGtag() {
  if (initialized || !GA_ID) return;
  initialized = true;
  // Load gtag.js
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { send_page_view: false });
}

export function trackEvent(name, params = {}) {
  if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, params);
}

export default function AnalyticsTracker() {
  const location = useLocation();
  useEffect(() => {
    if (!GA_ID) return;
    loadGtag();
    if (window.gtag) {
      window.gtag("event", "page_view", {
        page_path: location.pathname + location.search,
        page_title: document.title,
      });
    }
  }, [location]);
  return null;
}
