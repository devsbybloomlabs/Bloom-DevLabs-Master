/**
 * Curated map of contextual internal links for the Bloom Labs SEO graph.
 *
 * Goal: every public page surfaces 3 keyword-rich, semantically-related
 * internal links so search engines can crawl the topic cluster, and so
 * users have a natural next step after each page.
 *
 * Keys are URL prefixes — the longest matching prefix wins.
 */

export const RELATED_LINKS = {
  // ── Homepage ────────────────────────────────────────────────────────
  "/": [
    {
      label: "Custom gym management software (built in 3 weeks)",
      to: "/solutions/gym-management-software",
      kicker: "Niche solution",
    },
    {
      label: "Custom coach funnel & client portal",
      to: "/solutions/coach-funnel",
      kicker: "Niche solution",
    },
    {
      label: "How custom apps stack up vs no-code & off-the-shelf SaaS",
      to: "/blog",
      kicker: "Deep dive",
    },
    {
      label: "Read recent case studies from our shipped builds",
      to: "/case-studies",
      kicker: "Proof",
    },
  ],

  // ── Niche: Gym ──────────────────────────────────────────────────────
  "/solutions/gym-management-software": [
    {
      label: "Our 3-week build process (timeline & deliverables)",
      to: "/solutions/gym-management-software/process",
      kicker: "Process",
    },
    {
      label: "How the dashboard, alerts & churn predictor work under the hood",
      to: "/solutions/gym-management-software/how-it-works",
      kicker: "Under the hood",
    },
    {
      label: "Case studies from real custom-app builds",
      to: "/case-studies",
      kicker: "Proof",
    },
    {
      label: "Get a free workflow audit for your gym",
      to: "/get-audit?src=gym-related",
      kicker: "Audit",
    },
  ],
  "/gym-owners": [
    {
      label: "Our 3-week build process (timeline & deliverables)",
      to: "/gym-owners/process",
      kicker: "Process",
    },
    {
      label: "How the dashboard, alerts & churn predictor work under the hood",
      to: "/gym-owners/how-it-works",
      kicker: "Under the hood",
    },
    {
      label: "Case studies from real custom-app builds",
      to: "/case-studies",
      kicker: "Proof",
    },
    {
      label: "Get a free workflow audit for your gym",
      to: "/get-audit?src=gym-related",
      kicker: "Audit",
    },
  ],

  // ── Niche: Coach ────────────────────────────────────────────────────
  "/solutions/coach-funnel": [
    {
      label: "Our 2-4 week build process for coaching businesses",
      to: "/solutions/coach-funnel/process",
      kicker: "Process",
    },
    {
      label: "How the booking, payments & client portal flow together",
      to: "/solutions/coach-funnel/how-it-works",
      kicker: "Under the hood",
    },
    {
      label: "Case studies of coaches who 2x'd their revenue per client",
      to: "/case-studies",
      kicker: "Proof",
    },
    {
      label: "Get a free workflow audit for your coaching business",
      to: "/get-audit?src=coach-related",
      kicker: "Audit",
    },
  ],
  "/coaches": [
    {
      label: "Our 2-4 week build process for coaching businesses",
      to: "/coaches/process",
      kicker: "Process",
    },
    {
      label: "How the booking, payments & client portal flow together",
      to: "/coaches/how-it-works",
      kicker: "Under the hood",
    },
    {
      label: "Case studies of coaches who 2x'd their revenue per client",
      to: "/case-studies",
      kicker: "Proof",
    },
    {
      label: "Get a free workflow audit for your coaching business",
      to: "/get-audit?src=coach-related",
      kicker: "Audit",
    },
  ],

  // ── Niche: Real Estate ──────────────────────────────────────────────
  "/solutions/real-estate-leads": [
    {
      label: "Our 3-week build process for real estate teams",
      to: "/solutions/real-estate-leads/process",
      kicker: "Process",
    },
    {
      label: "How the lead capture, CRM & SMS automation flow together",
      to: "/solutions/real-estate-leads/how-it-works",
      kicker: "Under the hood",
    },
    {
      label: "Case studies from custom real estate apps we shipped",
      to: "/case-studies",
      kicker: "Proof",
    },
    {
      label: "Get a free workflow audit for your brokerage",
      to: "/get-audit?src=re-related",
      kicker: "Audit",
    },
  ],
  "/real-estate": [
    {
      label: "Our 3-week build process for real estate teams",
      to: "/real-estate/process",
      kicker: "Process",
    },
    {
      label: "How the lead capture, CRM & SMS automation flow together",
      to: "/real-estate/how-it-works",
      kicker: "Under the hood",
    },
    {
      label: "Case studies from custom real estate apps we shipped",
      to: "/case-studies",
      kicker: "Proof",
    },
    {
      label: "Get a free workflow audit for your brokerage",
      to: "/get-audit?src=re-related",
      kicker: "Audit",
    },
  ],

  // ── Blog ────────────────────────────────────────────────────────────
  "/blog": [
    {
      label: "Custom gym management software (case-study walkthrough)",
      to: "/solutions/gym-management-software",
      kicker: "Solution",
    },
    {
      label: "Custom coach funnel & client portal",
      to: "/solutions/coach-funnel",
      kicker: "Solution",
    },
    {
      label: "Custom real estate lead pipeline",
      to: "/solutions/real-estate-leads",
      kicker: "Solution",
    },
    {
      label: "Get a free workflow audit (3-5 app recommendations)",
      to: "/get-audit?src=blog-related",
      kicker: "Audit",
    },
  ],

  // ── Case studies ────────────────────────────────────────────────────
  "/case-studies": [
    {
      label: "How we build custom web apps in 2-4 weeks",
      to: "/blog",
      kicker: "Deep dive",
    },
    {
      label: "Custom gym management software (3-week build)",
      to: "/solutions/gym-management-software",
      kicker: "Solution",
    },
    {
      label: "Custom coach funnel & client portal",
      to: "/solutions/coach-funnel",
      kicker: "Solution",
    },
    {
      label: "Get a free workflow audit for your business",
      to: "/get-audit?src=case-related",
      kicker: "Audit",
    },
  ],

  // ── Audit form ──────────────────────────────────────────────────────
  "/get-audit": [
    {
      label: "Browse case studies from our shipped custom-app builds",
      to: "/case-studies",
      kicker: "Proof",
    },
    {
      label: "Custom gym management software (3-week build)",
      to: "/solutions/gym-management-software",
      kicker: "Solution",
    },
    {
      label: "Custom coach funnel & client portal",
      to: "/solutions/coach-funnel",
      kicker: "Solution",
    },
    {
      label: "Custom real estate lead pipeline",
      to: "/solutions/real-estate-leads",
      kicker: "Solution",
    },
  ],

  // ── Affiliate (new) ─────────────────────────────────────────────────
  "/affiliate": [
    {
      label: "Get your free custom-app workflow audit",
      to: "/get-audit?src=affiliate-related",
      kicker: "Audit",
    },
    {
      label: "Case studies from real custom-app builds",
      to: "/case-studies",
      kicker: "Proof",
    },
    {
      label: "How we build custom web apps in 2-4 weeks",
      to: "/blog",
      kicker: "Deep dive",
    },
  ],
};

/** Returns 3-4 related links best matching the current path. */
export function getRelatedLinks(pathname) {
  if (!pathname) return RELATED_LINKS["/"];
  // Longest-prefix match
  let best = "/";
  for (const key of Object.keys(RELATED_LINKS)) {
    if (pathname === key || pathname.startsWith(key + "/")) {
      if (key.length > best.length) best = key;
    }
  }
  return RELATED_LINKS[best] || RELATED_LINKS["/"];
}
