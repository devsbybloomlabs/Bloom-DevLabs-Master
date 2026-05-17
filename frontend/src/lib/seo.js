/**
 * Centralised SEO assets — JSON-LD schema builders + per-page meta blocks.
 *
 * All public + niche-funnel pages should pull schema/meta from here so
 * crawlers (Google, Bing, social-card scrapers) see consistent signals.
 * Update once → applies everywhere.
 */

export const SITE_URL = "https://bybloomlabs.com";
export const SITE_NAME = "Bloom Labs";
export const LEGAL_NAME = "Bloom Development Labs Corp";
export const LOGO_URL = `${SITE_URL}/og-default.png`;
export const PHONE = "+1-951-899-5314";
export const EMAIL = "support@bybloomlabs.com";
export const FOUNDED_YEAR = "2026";

export const SOCIALS = [
  "https://linkedin.com/company/bybloomlabs",
  "https://instagram.com/bloomdevlabs",
  "https://tiktok.com/@bybloomlabs",
  "https://facebook.com/bybloomlabs",
];

// ---------------------------------------------------------------------------
// Organization (homepage)
// ---------------------------------------------------------------------------
export const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: LEGAL_NAME,
  alternateName: "Bloom Labs",
  url: SITE_URL,
  logo: LOGO_URL,
  description:
    "AI-native custom web app development. Enterprise-grade software built in 2–4 weeks at ~40% lower cost than traditional agencies.",
  foundingDate: FOUNDED_YEAR,
  sameAs: SOCIALS,
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "Sales",
      email: EMAIL,
      telephone: PHONE,
      areaServed: ["US", "PH", "SG", "Global"],
      availableLanguage: ["English"],
    },
    {
      "@type": "ContactPoint",
      contactType: "Customer Support",
      email: EMAIL,
      areaServed: "Global",
      availableLanguage: ["English"],
    },
  ],
};

// ---------------------------------------------------------------------------
// LocalBusiness — Philippines & Singapore offices (country-level)
// ---------------------------------------------------------------------------
export const LOCAL_BUSINESS_PH = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "@id": `${SITE_URL}/#office-ph`,
  name: `${LEGAL_NAME} — Philippines`,
  url: SITE_URL,
  image: LOGO_URL,
  telephone: PHONE,
  email: EMAIL,
  priceRange: "$$",
  address: {
    "@type": "PostalAddress",
    addressCountry: "PH",
  },
  areaServed: ["PH", "US", "SG", "AU", "GB", "Global"],
  serviceType: "Custom Software Development",
};

export const LOCAL_BUSINESS_SG = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "@id": `${SITE_URL}/#office-sg`,
  name: `${LEGAL_NAME} — Singapore`,
  url: SITE_URL,
  image: LOGO_URL,
  telephone: PHONE,
  email: EMAIL,
  priceRange: "$$",
  address: {
    "@type": "PostalAddress",
    addressCountry: "SG",
  },
  areaServed: ["SG", "US", "PH", "AU", "GB", "Global"],
  serviceType: "Custom Software Development",
};

// ---------------------------------------------------------------------------
// Product / pricing tiers (homepage + pricing section)
// ---------------------------------------------------------------------------
export const PRICING_TIERS = [
  {
    name: "Express Launch",
    price: "5995",
    description:
      "Ship an MVP web app in 10–14 days. Fixed scope, fixed price. 7-day post-launch support. Ideal for solo founders validating an idea.",
  },
  {
    name: "Custom Build",
    price: "8995",
    description:
      "Full custom web application in 20–28 days. Tailored to your workflows. 14-day post-launch support. Most popular for SMBs.",
  },
  {
    name: "Enterprise",
    price: "14995",
    description:
      "Multi-module enterprise-grade system in 28–35 days. Integrations, role-gated access, advanced analytics. 30-day post-launch support.",
  },
];

export const PRODUCT_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Service",
  serviceType: "Custom Web App Development",
  name: "Custom Web App Development Service",
  provider: {
    "@type": "Organization",
    name: LEGAL_NAME,
    url: SITE_URL,
  },
  areaServed: "Global",
  description:
    "AI-native custom web app development delivered in 2–4 weeks at ~40% lower cost than traditional agencies. Fixed scope, fixed price, weekly demos.",
  brand: { "@type": "Brand", name: SITE_NAME },
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "USD",
    lowPrice: "5995",
    highPrice: "14995",
    offerCount: PRICING_TIERS.length,
    availability: "https://schema.org/InStock",
    offers: PRICING_TIERS.map((t) => ({
      "@type": "Offer",
      name: t.name,
      description: t.description,
      price: t.price,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/#pricing`,
    })),
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "5",
    bestRating: "5",
    worstRating: "1",
    reviewCount: "2",
  },
  review: [
    {
      "@type": "Review",
      reviewRating: {
        "@type": "Rating",
        ratingValue: "5",
        bestRating: "5",
      },
      author: { "@type": "Person", name: "SaaS Founder" },
      reviewBody:
        "Shipped our MVP in 3 weeks and hit $5K MRR in the first month after launch. Bloom Labs ran circles around the agency we used previously.",
    },
    {
      "@type": "Review",
      reviewRating: {
        "@type": "Rating",
        ratingValue: "5",
        bestRating: "5",
      },
      author: { "@type": "Person", name: "Business Owner" },
      reviewBody:
        "Custom booking system 3x'd our weekly bookings inside 60 days. Zero scope creep, weekly demos, no surprises.",
    },
  ],
};

// ---------------------------------------------------------------------------
// FAQ — visible + machine-readable
// ---------------------------------------------------------------------------
export const HOMEPAGE_FAQS = [
  {
    id: "ai-native",
    q: "How is AI-native development different?",
    a: "Traditional agencies write everything from scratch — boilerplate, scaffolding, tests, docs. AI-native means we use modern AI tooling at every layer of the build, so we ship the same enterprise-grade quality in a fraction of the time. You get a real, well-architected web app — not a 'no-code' prototype with limits.",
  },
  {
    id: "timeline",
    q: "How long does web app development take with Bloom Labs?",
    a: "Express Launch ships in 10–14 days. Custom Build in 20–28 days. Enterprise in 28–35 days. That's 2–4 weeks end-to-end — vs the 4–6 month average at traditional agencies. We finalize your exact timeline in the discovery call and lock it in the proposal.",
  },
  {
    id: "cost",
    q: "How much does custom web app development cost?",
    a: "Our three tiers are $5,995 (Express Launch), $8,995 (Custom Build), and $14,995 (Enterprise). That's roughly 40% below comparable scope at traditional agencies — because we run lean, no account managers, and our AI-native scaffolding is 60–80% faster.",
  },
  {
    id: "why-fail",
    q: "Why do most web app projects fail or run over budget?",
    a: "Three reasons: scope creep (no fixed proposal), black-box delivery (you find out at month 4 it's broken), and over-engineering. We solve all three: fixed scope locked in writing, weekly demos so you see progress, and AI-native scaffolding so we ship the minimum-viable architecture that scales.",
  },
  {
    id: "support",
    q: "Do you provide post-launch support?",
    a: "Yes. Every package includes a post-launch support window: 7 days on Express Launch, 14 days on Custom Build, 30 days on Enterprise. After that, we offer monthly retainers starting at $1,500/month for ongoing iteration. You own all the code — no lock-in.",
  },
  {
    id: "industries",
    q: "Which industries do you serve?",
    a: "We specialise in three high-leverage verticals: gym & fitness management software, coach & consultant client portals, and real-estate lead-management systems. We also accept custom requests for SaaS founders and clinics — book a discovery call to scope your project.",
  },
  {
    id: "changes-after-launch",
    q: "Can I request changes after launch?",
    a: "Yes. During your post-launch support window, bug fixes and small tweaks are included. Beyond that, you can buy a monthly retainer or commission new features at a transparent sprint rate. You own 100% of the code so you can always take it to another developer too.",
  },
  {
    id: "not-technical",
    q: "What if I'm not technical?",
    a: "Most of our clients aren't. We translate your business workflow into a real system, walk you through weekly demos in plain language, and give you a simple admin panel your team can actually use without training. Our discovery call is non-technical — we ask about your business, not your stack.",
  },
];

export const FAQ_SCHEMA = (faqs = HOMEPAGE_FAQS) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: f.a,
    },
  })),
});

// ---------------------------------------------------------------------------
// Breadcrumb helper
// ---------------------------------------------------------------------------
export function buildBreadcrumbs(items) {
  // items: [{ name, path }]  → path relative to SITE_URL or absolute URL
  return items.map((it) => ({
    name: it.name,
    url: it.path?.startsWith("http") ? it.path : `${SITE_URL}${it.path || ""}`,
  }));
}

// ---------------------------------------------------------------------------
// WebSite schema (homepage) — enables sitelinks search box
// ---------------------------------------------------------------------------
export const WEBSITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  publisher: { "@type": "Organization", name: LEGAL_NAME, logo: LOGO_URL },
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/blog?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

// ---------------------------------------------------------------------------
// Per-niche-page SEO bundle builder
// ---------------------------------------------------------------------------
const NICHE_BREADCRUMB_LABEL = {
  gym: "Gym Owners",
  coach: "Coaches & Consultants",
  re: "Real Estate",
};

const NICHE_BASE_PATH = {
  gym: "/gym-owners",
  coach: "/coaches",
  re: "/real-estate",
};

const NICHE_SOLUTIONS_PATH = {
  gym: "/solutions/gym-management-software",
  coach: "/solutions/coach-funnel",
  re: "/solutions/real-estate-leads",
};

/**
 * Build a `seo` prop object for niche-funnel pages.
 *
 * @param {"gym"|"coach"|"re"} niche
 * @param {"Hero"|"HowItWorks"|"Process"|"Results"} step
 * @param {string} [crumbLabel] optional override for breadcrumb leaf
 */
export function buildNicheSeo(niche, step, crumbLabel) {
  const metaKey = `${niche}${step}`;
  const meta = PAGE_META[metaKey];
  if (!meta) return null;

  const nicheLabel = NICHE_BREADCRUMB_LABEL[niche];
  const stepLabel =
    step === "Hero"
      ? null
      : step === "HowItWorks"
      ? "How It Works"
      : step === "Process"
      ? "Our Process"
      : "Results";

  const solBase = NICHE_SOLUTIONS_PATH[niche];
  const stepPath =
    step === "Hero"
      ? ""
      : step === "HowItWorks"
      ? "/how-it-works"
      : step === "Process"
      ? "/process"
      : "/results";

  const breadcrumbs = [{ name: "Home", url: SITE_URL }, { name: nicheLabel, url: `${SITE_URL}${solBase}` }];
  if (stepLabel) {
    breadcrumbs.push({ name: crumbLabel || stepLabel, url: `${SITE_URL}${solBase}${stepPath}` });
  }

  // Service schema scoped to the niche
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType:
      niche === "gym"
        ? "Gym Management Software Development"
        : niche === "coach"
        ? "Coach & Consultant Client Portal Development"
        : "Real Estate Lead Management Software Development",
    name: meta.title,
    description: meta.description,
    provider: { "@type": "Organization", name: LEGAL_NAME, url: SITE_URL },
    areaServed: "Global",
    url: meta.canonical || `${SITE_URL}${NICHE_BASE_PATH[niche]}${stepPath}`,
    brand: { "@type": "Brand", name: SITE_NAME },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "5995",
      highPrice: "14995",
      offerCount: 3,
      availability: "https://schema.org/InStock",
    },
  };

  return {
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords,
    url: meta.canonical,
    type: "website",
    jsonLd: serviceSchema,
    breadcrumbs,
  };
}
export const PAGE_META = {
  home: {
    title: "Custom Web Apps in 2-4 Weeks | Bloom Labs (40% Cheaper)",
    description:
      "Enterprise-grade custom web apps shipped in 2–4 weeks at ~40% below traditional agencies. AI-native development, fixed scope, weekly demos. Book your discovery call.",
    keywords:
      "custom web app development, AI-native development, web development in 2 weeks, affordable custom software, rapid web application development, web app development cost, enterprise software development fast",
  },
  caseStudies: {
    title: "Case Studies: Web Apps Built in Weeks | Bloom Labs",
    description:
      "See how Bloom Labs ships custom web apps in 2–4 weeks. SaaS founders hitting $5K MRR, business owners 3x'ing bookings — real metrics, real timelines.",
    keywords:
      "custom web app case studies, fast SaaS development, web development results, bloom labs case studies",
  },
  blog: {
    title: "Bloom Labs Blog — AI-Native Development Insights",
    description:
      "Practical articles on AI-native development, custom software pricing, and shipping enterprise web apps fast. From the team behind Bloom Labs.",
    keywords:
      "AI-native development blog, web development insights, custom software cost, web app development",
  },
  // Gym funnel
  gymHero: {
    title: "Gym Management Software Built in 3 Weeks | Bloom Labs",
    description:
      "Stop losing gym members to manual booking chaos. Custom member-management software built in 3–4 weeks. Recover $2K–$4K/month in cancellations. See ROI.",
    keywords:
      "gym management software, fitness app development, gym booking system, member retention software, gym software cost",
    canonical: `${SITE_URL}/solutions/gym-management-software`,
  },
  gymHowItWorks: {
    title: "How Gym Management Software Works | Bloom Labs",
    description:
      "Inside the Bloom Labs gym software build: discovery, prototype, build, launch. See the weekly cadence we use to ship a custom gym system in 3 weeks.",
    keywords:
      "gym management software process, how custom gym software is built, gym app development timeline",
    canonical: `${SITE_URL}/solutions/gym-management-software/how-it-works`,
  },
  gymProcess: {
    title: "Our Process: Gym Software in 4 Phases | Bloom Labs",
    description:
      "Discovery → Proposal → Build → Launch. The 4-phase process Bloom Labs uses to ship custom gym management software in 3 weeks without scope creep.",
    keywords:
      "gym software development process, custom gym software phases, gym app build steps",
    canonical: `${SITE_URL}/solutions/gym-management-software/process`,
  },
  gymResults: {
    title: "Gym Software Results: ROI & Case Studies | Bloom Labs",
    description:
      "Real numbers: gym owners 3x bookings, recover $2K–$4K/month in churned members, and cut admin time 60% with Bloom Labs custom gym software.",
    keywords:
      "gym software ROI, gym management case study, fitness software results, member retention ROI",
    canonical: `${SITE_URL}/solutions/gym-management-software/results`,
  },
  // Coach funnel
  coachHero: {
    title: "Coach & Consultant Client Portal in 3 Weeks | Bloom Labs",
    description:
      "Custom client portal for coaches and consultants — built in 3 weeks. Replace 5 disconnected tools with one branded system. See ROI calculator inside.",
    keywords:
      "coach client portal, consultant software, custom client portal, coaching business software, consultant tech stack",
    canonical: `${SITE_URL}/solutions/coach-funnel`,
  },
  coachHowItWorks: {
    title: "How Our Coach Client Portal Works | Bloom Labs",
    description:
      "See how Bloom Labs builds a custom client portal for coaches and consultants in 3 weeks. Weekly demos, AI-native delivery, fixed scope.",
    keywords:
      "coach client portal process, how coaching software is built, consultant portal development",
    canonical: `${SITE_URL}/solutions/coach-funnel/how-it-works`,
  },
  coachProcess: {
    title: "Coach Software: Our 4-Phase Build Process | Bloom Labs",
    description:
      "Discovery → Proposal → Build → Launch. The exact 4-phase process Bloom Labs uses to ship a custom coach client portal in 3 weeks.",
    keywords:
      "coach software process, consultant software development phases, custom coaching portal build",
    canonical: `${SITE_URL}/solutions/coach-funnel/process`,
  },
  coachResults: {
    title: "Coach Portal ROI & Case Studies | Bloom Labs",
    description:
      "Real coach + consultant ROI: 3x client retention, 60% less admin overhead, cleaner upsell paths. See the Bloom Labs case studies.",
    keywords:
      "coach portal ROI, consultant software results, coaching software case study",
    canonical: `${SITE_URL}/solutions/coach-funnel/results`,
  },
  // Real Estate funnel
  reHero: {
    title: "Real Estate Lead Management System in 3 Weeks | Bloom Labs",
    description:
      "Custom lead-management system for real-estate brokers — built in 3 weeks. Replace your patchwork of CRMs with one branded portal. See ROI inside.",
    keywords:
      "real estate lead management software, real estate CRM, broker software, real estate agent software, MLS integration",
    canonical: `${SITE_URL}/solutions/real-estate-leads`,
  },
  reHowItWorks: {
    title: "How Our Real Estate Lead System Works | Bloom Labs",
    description:
      "Inside the Bloom Labs real-estate build: discovery, prototype, MLS integration, launch. Custom broker lead-management software in 3 weeks.",
    keywords:
      "real estate software process, broker lead management build, real estate CRM development",
    canonical: `${SITE_URL}/solutions/real-estate-leads/how-it-works`,
  },
  reProcess: {
    title: "Real Estate Software: 4-Phase Process | Bloom Labs",
    description:
      "Discovery → Proposal → Build → Launch. The 4-phase Bloom Labs process to ship a custom real-estate lead-management system in 3 weeks.",
    keywords:
      "real estate software development process, broker software phases, custom real estate CRM build",
    canonical: `${SITE_URL}/solutions/real-estate-leads/process`,
  },
  reResults: {
    title: "Real Estate Software Results & ROI | Bloom Labs",
    description:
      "Broker ROI from a Bloom Labs custom lead system: 3x faster follow-up, ~$50K/yr in saved tooling spend, cleaner pipeline visibility.",
    keywords:
      "real estate software ROI, broker CRM case study, real estate lead management results",
    canonical: `${SITE_URL}/solutions/real-estate-leads/results`,
  },
  tour: {
    title: "Sandbox Tour: See a Bloom Labs Build in Action",
    description:
      "Click through a live, working web app we built in under 4 weeks. Real screens, real workflows — see what a Bloom Labs delivery looks like.",
    keywords:
      "bloom labs sandbox tour, custom web app demo, see bloom labs work",
  },
};
