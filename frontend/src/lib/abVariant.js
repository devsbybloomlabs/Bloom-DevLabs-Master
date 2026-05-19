/**
 * useAbVariant — React hook that fetches the active A/B variant for a given
 * `elementKey` and returns the live copy (or the fallback control copy if no
 * test is running). Also fires impression + click events so the admin
 * dashboard can compute CTR / conversion / lift.
 *
 * Usage:
 *   const { content, trackClick, trackConversion } = useAbVariant(
 *     "homepage_hero_cta",
 *     "Book a Discovery Call"
 *   );
 *   <button onClick={trackClick}>{content}</button>
 */
import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const STORAGE_KEY = "bloom_visitor_id";

function rememberActiveVariantInternal(elementKey, testId, variantKey) {
  try {
    const raw = localStorage.getItem("bloom_ab_active") || "[]";
    const list = JSON.parse(raw);
    const idx = list.findIndex((r) => r.element_key === elementKey);
    const row = { element_key: elementKey, test_id: testId, variant_key: variantKey };
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    localStorage.setItem("bloom_ab_active", JSON.stringify(list.slice(-20)));
  } catch {
    // noop
  }
}

function getVisitorId() {
  let v = localStorage.getItem(STORAGE_KEY);
  if (!v) {
    v =
      "v_" +
      (window.crypto?.randomUUID?.() ||
        Date.now().toString(36) + Math.random().toString(36).slice(2));
    localStorage.setItem(STORAGE_KEY, v);
  }
  return v;
}

function getSessionId() {
  let s = sessionStorage.getItem("bloom_ab_session");
  if (!s) {
    s =
      "s_" +
      (window.crypto?.randomUUID?.() ||
        Date.now().toString(36) + Math.random().toString(36).slice(2));
    sessionStorage.setItem("bloom_ab_session", s);
  }
  return s;
}

export function useAbVariant(elementKey, fallbackContent) {
  const [state, setState] = useState({
    content: fallbackContent,
    testId: null,
    variantKey: null,
    active: false,
    loading: true,
  });
  const impressionFired = useRef(false);
  const conversionFired = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const visitorId = getVisitorId();
    axios
      .get(`${API}/public/ab/v2/assign/${encodeURIComponent(elementKey)}`, {
        params: { visitor_id: visitorId },
      })
      .then((r) => {
        if (cancelled) return;
        if (r.data?.active) {
          setState({
            content: r.data.content || fallbackContent,
            testId: r.data.test_id,
            variantKey: r.data.variant_key,
            active: true,
            loading: false,
          });
          rememberActiveVariantInternal(elementKey, r.data.test_id, r.data.variant_key);
        } else {
          setState({
            content: fallbackContent,
            testId: null,
            variantKey: null,
            active: false,
            loading: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState((s) => ({ ...s, loading: false }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [elementKey, fallbackContent]);

  // Fire impression once we know which variant we're on
  useEffect(() => {
    if (state.active && !state.loading && !impressionFired.current) {
      impressionFired.current = true;
      const visitorId = getVisitorId();
      axios
        .post(`${API}/public/ab/v2/track`, {
          test_id: state.testId,
          variant_key: state.variantKey,
          kind: "page_view",
          visitor_id: visitorId,
          session_id: getSessionId(),
        })
        .catch(() => {});
    }
  }, [state.active, state.loading, state.testId, state.variantKey]);

  const trackClick = useCallback(() => {
    if (!state.active) return;
    const visitorId = getVisitorId();
    axios
      .post(`${API}/public/ab/v2/track`, {
        test_id: state.testId,
        variant_key: state.variantKey,
        kind: "cta_click",
        visitor_id: visitorId,
        session_id: getSessionId(),
      })
      .catch(() => {});
  }, [state.active, state.testId, state.variantKey]);

  const trackConversion = useCallback(() => {
    if (!state.active || conversionFired.current) return;
    conversionFired.current = true;
    const visitorId = getVisitorId();
    axios
      .post(`${API}/public/ab/v2/track`, {
        test_id: state.testId,
        variant_key: state.variantKey,
        kind: "conversion",
        visitor_id: visitorId,
        session_id: getSessionId(),
      })
      .catch(() => {});
  }, [state.active, state.testId, state.variantKey]);

  return {
    content: state.content,
    active: state.active,
    loading: state.loading,
    trackClick,
    trackConversion,
  };
}

/**
 * Global conversion tracker — call this from your conversion page (e.g. the
 * /book-a-call success screen). It walks the localStorage to find any
 * active test_id/variant the visitor was bucketed into and fires a single
 * conversion event for each.
 *
 * Lightweight: stores last-seen { testId, variantKey } per element_key in
 * localStorage so we can attribute conversions even if the user navigated.
 */
export function fireGlobalConversion() {
  try {
    const raw = localStorage.getItem("bloom_ab_active") || "[]";
    const list = JSON.parse(raw);
    const visitorId = getVisitorId();
    list.forEach((row) => {
      axios
        .post(`${API}/public/ab/v2/track`, {
          test_id: row.test_id,
          variant_key: row.variant_key,
          kind: "conversion",
          visitor_id: visitorId,
          session_id: getSessionId(),
        })
        .catch(() => {});
    });
  } catch {
    // noop
  }
}

/** Stamp the last-seen variant for cross-page conversion attribution. */
export function rememberActiveVariant(elementKey, testId, variantKey) {
  rememberActiveVariantInternal(elementKey, testId, variantKey);
}
