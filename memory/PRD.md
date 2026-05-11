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
- `integrations_admin_routes.py` (new) — `/api/admin/integrations/nifty/*` endpoints
- Milestone cron jobs now use async `nifty.is_connected()` instead of static check.

**Frontend:**
- `/auth/callback` — generic OAuth callback page (handles Nifty + future providers).
- `/admin/integrations` — admin page with NiftyCard.

### ✅ Phase 10 — Friction-Reducer Dashboard + Nifty UX + GA4 (Feb 2026)
**Frictionless integration dashboard at `/admin/integrations`:**
- **Nifty rebuild:**
  - `NiftyClient.list_projects()` + `list_members()` now PAGINATED (`per_page=100`, up to 20 pages) — fixes the "only 25 projects" issue.
  - New `app_settings` MongoDB collection stores Nifty projects+members CACHE so admin pages don't re-hit Nifty on every load.
  - "Sync now" button refreshes cache on demand.
  - Default project + Designer/PM/Developer assignees are now **dropdowns** (driven by cached members). Saved preferences stored in DB and used by `onboarding_routes._resolve_assignees(db)` (DB-first, env-fallback).
  - Empty-string + empty-list explicitly clears the preference (regression-tested).
- **Provider cards:** OpenRouter / Emailit / AgencyHandy / PayPal each have a card showing masked key + "Test connection" button that runs a live ping (`chat`, `send_email`, `list_orders`, `_get_access_token`).
- **Bug fix:** `useAdminApi()` now memoizes the axios instance with `useMemo([token])` — fixes infinite useEffect re-trigger loop that was creating a 403-toast cascade.

**Google Analytics 4:**
- `REACT_APP_GA_MEASUREMENT_ID=G-KTSD1H6KMX` set in `/app/frontend/.env`. AnalyticsTracker auto-loads `gtag.js` and fires `page_view` on route change.
- Lead opt-ins fire custom `lead_subscribe` event.

**Test results:**
- iteration_8 18/18 pytest (Phase 9 OAuth)
- iteration_9 18/18 pytest (Phase 10 friction-reducer) + 3 frontend bugs caught
- iteration_10 21/21 pytest (18 phase10 + 3 regression) + 100% frontend re-verification. All 3 bugs fixed.

### ✅ Phase 11 — P2 Backlog + Approval Studio Loop + Health Strip (Feb 2026)

**P2 backlog (all 4 items DONE):**
- **C1 — AgencyHandy HMAC verification**: New `AGENCYHANDY_WEBHOOK_HMAC_SECRET` env var. When set, every incoming AH webhook MUST carry `x-ah-sig` matching `hmac_sha256(secret, raw_body)`. Falls back to existing token check when not set (zero-config-break).
- **C2 — `/admin/clients` admin page**: New `ClientsAdmin.jsx` with table view (name, status, source, last login, joined), search filter, copy-email, mailto link, and one-click "Resend setup" / "Reset link" that auto-copies the URL to clipboard.
- **C3 — OG SVG → PNG conversion**: New `/api/og/blog/{slug}.png` endpoint using `cairosvg`. Same layout as SVG, renders at 1200×630, served with `Cache-Control: public, max-age=3600`. `PublicBlogPost.jsx` switched its `og:image` to the PNG variant (Twitter Cards prefer raster).
- **C4 — AgencyHandy server-side `client_email` filter**: New `AgencyHandyClient.list_orders_for_client_email()` resolves a client by email via the members API, then filters orders by `clientId` server-side. `client_routes.my_orders` calls it first, falls back to pull-all + local filter when company_id missing.

**B — Integrations Health Strip on Dashboard home:**
- New `/api/admin/integrations/health` endpoint aggregates status for all 6 providers (OpenRouter, Emailit, AgencyHandy, PayPal, Nifty, Approval Studio) into a unified `{provider, status, last_ping}` envelope.
- New `_record_ping(db, provider, ok, detail)` helper persists test-ping results to `app_settings.integration_pings`. Wired into every per-provider `/test` endpoint + Nifty status route.
- New `IntegrationsHealthStrip.jsx` component on the admin Dashboard home — renders coloured pills (green = configured + last ping ok, yellow = never tested / configured-but-failing, red = not configured) with relative-time hover tooltip and click-through to `/admin/integrations`.

**Part 3 — Approval Studio ↔ Nifty Design Review Loop (NEW):**
- **`approval_studio_client.py`** (new): Mockable REST client for `approval.studio`. Live mode activates when `APPROVAL_STUDIO_USERNAME/PASSWORD` (or `APPROVAL_STUDIO_TOKEN`) is set; otherwise runs MOCK mode and logs every call to in-memory `mock_log` for inspection. Surface: `create_project`, `upload_asset`, `list_comments`, `get_project`.
- **`approval_studio_routes.py`** (new):
  - `POST /admin/approvals/upload` — Designer pushes a Figma URL → creates/reuses an Approval Studio project, uploads asset (bumps version on re-upload of same client+project+asset), posts a Nifty comment with the review link, sets task status to "In Review", updates linked milestone → `in_progress`.
  - `POST /webhooks/approval-studio` — Public, optional HMAC via `APPROVAL_STUDIO_WEBHOOK_SECRET`. Handles `ANNOTATION_ADDED` (relays comment to Nifty as `[Feedback from <author>] <text>` + status='revision'), `TASK_APPROVED` (closes Nifty task, marks milestone complete, emails client via Emailit), `TASK_REJECTED` (Nifty comment + status='revision').
  - `POST /admin/approvals/{id}/resolve` — Manual fallback when the webhook never arrives.
  - `GET /admin/approvals/mock-log` — Surfaces what the mocked Approval Studio "would have sent" upstream.
- **Hourly cron** (`designer_reminder_cron`): Emails the assigned designer when an approval has been in `revision` state > 48h with no new upload. 24h cooldown on re-sends. Wired into `server.py` lifespan.
- **`ApprovalsAdmin.jsx`** (new admin page at `/admin/approvals`): Upload dialog (auto-fills client/project/asset from a selected milestone), approval list grouped by status pills (in_review / revision / approved / rejected), per-row "Mark approved" manual resolve button, "View mock log" dialog showing the activity log entries.

**Test results:**
- iteration_11 12/12 backend pytest (`/app/backend/tests/test_phase11.py`) — OG PNG, AH HMAC, health endpoint, Approval Studio upload + webhooks + manual resolve + mock log.
- iteration_11 — 100% frontend verification: dashboard health pills (6) render and turn green after `/test` fires, sidebar nav has Clients + Design Approvals, ClientsAdmin renders + search + resend works, ApprovalsAdmin upload flow + mock-log dialog work, client portal login unchanged (5 tabs intact).
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
- Generate Nifty access token at https://developers.niftypm.com → paste into `/app/backend/.env`. Once set, Phase 7 onboarding tasks auto-create AND Phase 8 milestone status syncs run live, AND Phase 11 design approvals auto-comment on the linked Nifty task.
- Wire real Approval Studio credentials (`APPROVAL_STUDIO_USERNAME` + `APPROVAL_STUDIO_PASSWORD`) in `/app/backend/.env` to flip from mock → live mode. No code change required.

### P2
- ~~HMAC signature verification on AgencyHandy webhooks.~~ ✅ Done (Phase 11) — set `AGENCYHANDY_WEBHOOK_HMAC_SECRET` in `.env` to enforce.
- ~~AgencyHandy server-side `list_orders(client_email=…)` filter.~~ ✅ Done (Phase 11).
- ~~Admin `/admin/clients` UI page.~~ ✅ Done (Phase 11).
- ~~Migrate dynamic OG SVG to also render to PNG.~~ ✅ Done (Phase 11) — `.png` route via cairosvg, used by Twitter Cards.

### P3
- Lead scoring + segmentation in Lead Magnets admin (e.g., filter by source_url, magnet_slug).
- A/B testing for lead magnet copy.
- Automated Nifty project creation on Phase 3 onboarding submit (currently logs to admin notifications).
- Stripe as backup payment processor.
- Google Calendar sync.
- Slack notifications (deferred from Phase 11 Approval Studio loop).
- Approval Studio: real-time annotation preview inside `/admin/approvals` (currently shows mock log only).

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
