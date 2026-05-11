# Bloom Labs Platform — PRD

## Original Problem Statement
Build & maintain the Bloom Labs (`bybloomlabs.com`) full-stack application:
- High-converting B2B SaaS landing page with public Case Studies + Blog + per-page SEO + dynamic OG cards + RSS
- Founder admin dashboard (AI routine, CRM, content, credibility hub, revenue ops, blog, onboarding, **lead magnets**, **milestones**)
- Integrations: OpenRouter (AI), Emailit (transactional email, DNS now verified), AgencyHandy, TidyCal, **PayPal** (one-time + subscriptions), **Nifty PM** (task automation + milestone sync)
- Client Portal with self-service onboarding wizard + **milestone tracking**
- Hidden admin gate (5x footer logo click → `/admin/login`)
- **Lead generation funnel**: inline opt-in forms on blog posts → email drip via Emailit → admin dashboard for managing magnets + leads
- **Google Analytics 4** (gated on `REACT_APP_GA_MEASUREMENT_ID` env var)

## User Personas
- **Founder** (Ryan Salvador) — sole admin
- **Prospect** — discovery-call lead from TidyCal/AgencyHandy/landing/blog magnet opt-in
- **Client** — paid customer (orders, invoices, subscriptions, proposals, profile, onboarding, milestones)
- **Team** (Designer/PM/Developer) — Nifty task assignees, get notifications on onboarding submissions, drive milestone updates back to client portal

## Tech Stack
- Frontend: React 19 (CRA + craco), Tailwind, shadcn/ui, react-router-dom 7, sonner, @paypal/react-paypal-js
- Backend: FastAPI, Motor, httpx, bcrypt, PyJWT, APScheduler
- DB: MongoDB
- Integrations: OpenRouter · Emailit · AgencyHandy · TidyCal · **PayPal REST v2** · **Nifty PM** · **GA4**

## Implementation Phases

### ✅ Phase 1-5 (prior sessions)
POC → V1 MVP → Credibility Builder → Integration Layer → AgencyHandy.

### ✅ Phase 6 — PayPal + Client Portal (Feb 2026)
PayPal Smart Buttons (one-time + subscriptions), Client auth (JWT, role separation), Portal (Orders/Subs/Invoices/Proposals/Profile), Hidden admin gate.

### ✅ Phase 7 — Blog + Onboarding + Nifty + PayPal Plans (Feb 2026)
Public `/blog` + `/case-studies`, admin Blog CRUD + AI drafts, 3-phase onboarding wizard (auto-triggered post-payment, resume-by-token, admin management), Nifty PM REST client + task auto-creation on phase submit with graceful fallback, PayPal subscription plans admin.

### ✅ Phase 8 — Lead Magnets + SEO + GA4 + RSS + OG + Milestones Sync (Feb 2026)
**New backend modules:**
- `/app/backend/leads_routes.py` — Lead Magnets (admin CRUD + wizard-ready models) + public opt-in + APScheduler hourly drip ticks via Emailit
- `/app/backend/milestone_routes.py` — Nifty webhook receiver, milestone CRUD (admin + client-portal), sync history, APScheduler 5-min comment poll + daily 8am timeline refresh
- `/app/backend/blog_extras_routes.py` — `/api/blog/rss.xml` (RSS 2.0) + `/api/og/blog/{slug}.svg` (dynamic SVG OG card generator)

**New frontend components:**
- `SeoHead.jsx` — drop-in SEO injector with hijack-in-place strategy (overrides static index.html tags, restores on unmount)
- `Analytics.jsx` — GA4 loader + page-view tracker + `trackEvent()` helper
- `LeadMagnetForm.jsx` — embeddable opt-in form auto-embedded on blog posts

**New admin pages:** `/admin/lead-magnets` (3-step wizard), `/admin/milestones` (CRUD + sync history)

**Test results:** iteration_6 26/26 pytest, iteration_7 SEO fix verified.

### ✅ Phase 9 — Nifty OAuth Integration (Feb 2026)
**Backend:**
- `nifty_client.py` rewritten to support OAuth2 authorization-code flow with token storage in MongoDB `integrations` collection and **auto-refresh on 401** (one-shot retry). Falls back to static `NIFTY_ACCESS_TOKEN` env var if present.
- `integrations_admin_routes.py` (new) — `/api/admin/integrations/nifty/*` endpoints:
  - `GET /status` — connection state + ping
  - `GET /authorize-url` — generate Nifty authorize URL with CSRF state
  - `POST /exchange` — code → tokens (persists in MongoDB)
  - `POST /manual-token` — testing escape hatch
  - `POST /disconnect` — wipe stored tokens
  - `GET /projects`, `GET /members` — read-only Nifty data
- Milestone cron jobs now use async `nifty.is_connected()` instead of static check.

**Frontend:**
- `/auth/callback` — generic OAuth callback page (handles Nifty + future providers). Parses `?code/state/error`, posts to backend exchange, shows success/error/needs-login states.
- `/admin/integrations` — new admin page with NiftyCard showing status, Connect button, Paste-token fallback, Disconnect, plus live project/member listings once connected.
- Admin nav: added "Integrations" item.

**Test results (iteration_8):**
- 18/18 backend pytest pass (auth gating, status, authorize-url, exchange, manual-token, disconnect)
- 8/8 frontend flows pass

**User config:**
- `NIFTY_CLIENT_ID=YWSnuABjapgejTQFGXse9Xc3LKiQjFqH`
- `NIFTY_CLIENT_SECRET=` (set in `/app/backend/.env`)
- `NIFTY_REDIRECT_URI=https://bybloomlabs.com/auth/callback`
**New backend modules:**
- `/app/backend/leads_routes.py` — Lead Magnets (admin CRUD + wizard-ready models) + public opt-in + APScheduler hourly drip ticks via Emailit
- `/app/backend/milestone_routes.py` — Nifty webhook receiver, milestone CRUD (admin + client-portal), sync history, APScheduler 5-min comment poll + daily 8am timeline refresh
- `/app/backend/blog_extras_routes.py` — `/api/blog/rss.xml` (RSS 2.0) + `/api/og/blog/{slug}.svg` (dynamic SVG OG card generator)

**New frontend components:**
- `/app/frontend/src/components/SeoHead.jsx` — drop-in SEO injector with **hijack-in-place** strategy (overrides static index.html tags, restores on unmount)
- `/app/frontend/src/components/Analytics.jsx` — GA4 loader + page-view tracker + `trackEvent()` helper
- `/app/frontend/src/components/LeadMagnetForm.jsx` — embeddable opt-in form (auto-fetches active magnet)

**New frontend pages:**
- `/admin/lead-magnets` — 3-step wizard (Basics → Drip emails → Review)
- `/admin/milestones` — CRUD + sync-history tabs

**Wiring:**
- LeadMagnetForm auto-embedded at bottom of every blog post (PublicBlogPost.jsx)
- SeoHead applied to Landing + Blog listing + Blog post (Article JSON-LD + breadcrumbs + dynamic OG SVG) + Case Studies (BreadcrumbList JSON-LD)
- AnalyticsTracker mounted inside BrowserRouter for auto-page-view tracking
- Client Portal: new **Milestones tab (default first tab)** with status pills + celebration ring for final deliverables
- Admin nav: added Lead Magnets + Milestones items
- Sitemap.xml updated with /blog + /case-studies

**Test results:**
- iteration_6: 26/26 backend pytest pass (lead magnets + RSS + OG SVG + milestones + Nifty webhook). 1 critical SEO bug found.
- iteration_7: SEO bug fixed (hijack-in-place SeoHead). 26/26 backend pytest still pass. 9/9 SEO frontend assertions pass.

## Backlog

### P1
- Generate Nifty access token at https://developers.niftypm.com → paste into `/app/backend/.env`. Once set, Phase 7 onboarding tasks auto-create AND Phase 8 milestone status syncs run live.
- Set `REACT_APP_GA_MEASUREMENT_ID` in `/app/frontend/.env` with the user's GA4 measurement ID (G-XXXXXXXXXX) → analytics enables itself.

### P2
- HMAC signature verification on AgencyHandy webhooks.
- AgencyHandy server-side `list_orders(client_email=…)` filter.
- Admin `/admin/clients` UI page.
- Migrate dynamic OG SVG to also render to PNG (some social-card scrapers don't render SVG; current SVG works for OpenGraph but Twitter Cards prefer PNG).

### P3
- Lead scoring + segmentation in Lead Magnets admin (e.g., filter by source_url, magnet_slug).
- A/B testing for lead magnet copy.
- Automated Nifty project creation on Phase 3 onboarding submit (currently logs to admin notifications).
- Stripe as backup payment processor.
- Google Calendar sync.
- Slack notifications.

## API Endpoints (cumulative reference)

### Public (no auth)
- PayPal: `GET /api/paypal/config`, `POST /api/paypal/orders`, `POST /api/paypal/orders/{id}/capture`, `POST /api/paypal/subscriptions`, `GET /api/paypal/subscriptions/{id}`
- Webhooks: `POST /api/webhooks/{paypal,agencyhandy,tidycal,nifty}`
- Client auth: `POST /api/clients/{register,login,forgot-password,reset-password}`
- Blog: `GET /api/blog`, `GET /api/blog/{slug}`, `GET /api/blog/rss.xml`, `GET /api/og/blog/{slug}.svg`
- Case studies: `GET /api/public/case-studies`
- Onboarding (by token): `GET /api/onboarding/by-token/{token}`, `POST .../save`, `POST .../submit`
- Lead magnets: `GET /api/leads/magnet/{slug}`, `GET /api/leads/active`, `POST /api/leads/subscribe`, `GET /api/leads/unsubscribe`

### Client-auth
- `GET/PATCH /api/clients/me`
- `GET /api/clients/me/{orders,subscriptions,invoices,proposals,onboarding,milestones}`
- `POST /api/clients/me/onboarding/{save,submit}`

### Admin-auth
- All `/api/admin/*` routes: case-studies, testimonials, blog (incl. `/admin/blog/ai/draft`), onboarding, clients, lead-magnets, leads (+ drip-tick), milestones (+ sync-history)
- PayPal admin: `/api/paypal/admin/{health,plans,transactions,subscriptions,webhooks}`

## MongoDB Collections (cumulative)
- `users`, `daily_routines`, `prospects`, `case_studies`, `testimonials`, `notifications`, `thought_leadership`, `authority_score`
- `clients`, `client_reset_tokens`
- `paypal_transactions`, `paypal_subscriptions`, `paypal_plans`, `paypal_products`, `paypal_webhook_events`
- `blog_posts`
- `onboardings`
- `lead_magnets`, `leads`
- `milestones`, `milestone_sync_history`
