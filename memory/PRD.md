# Bloom Labs Platform — PRD

## Original Problem Statement
Build & maintain the Bloom Labs (`bybloomlabs.com`) full-stack application:
- High-converting B2B SaaS landing page with public Case Studies + Blog
- Founder admin dashboard (AI routine, CRM, content, credibility hub, revenue ops, blog, onboarding)
- Integrations: OpenRouter (AI), Emailit (transactional email), AgencyHandy (CRM/revenue), TidyCal (booking), **PayPal** (one-time + subscriptions), **Nifty PM** (task automation)
- Client Portal with self-service onboarding wizard
- Hidden admin gate (5x footer logo click → `/admin/login`)

## User Personas
- **Founder** (Ryan Salvador) — sole admin. Runs daily routine, pipeline, content, blog, onboardings, revenue.
- **Prospect** — discovery-call lead from TidyCal/AgencyHandy/landing forms.
- **Client** — paid customer with portal access (orders, invoices, subscriptions, proposals, profile, onboarding).
- **Team** (Designer/PM/Developer) — receive Nifty task notifications + assignments triggered by onboarding submissions.

## Core Requirements (static)
1. SEO-optimized public landing with OG cards, sitemap, robots, JSON-LD, custom Bw Modelica typography, mobile-responsive.
2. JWT auth with strict role separation (`founder` vs `client` — verified by tests).
3. All integrations resilient (graceful 5xx, audit trails, retry-safe webhooks, best-effort with admin fallback notifications).
4. MongoDB with `_id` exclusion on every response.
5. All UI elements have `data-testid` for automated testing.

## Tech Stack
- Frontend: React 19 (CRA + craco), Tailwind, shadcn/ui, react-router-dom 7, sonner, @paypal/react-paypal-js
- Backend: FastAPI, Motor (async MongoDB), httpx, bcrypt, PyJWT, APScheduler
- DB: MongoDB
- Integrations: OpenRouter, Emailit, AgencyHandy, TidyCal, **PayPal REST v2**, **Nifty PM**

## Implementation Phases

### ✅ Phase 1-5 (prior sessions)
Core POC → V1 MVP → Credibility Builder → Integration Layer → AgencyHandy.

### ✅ Phase 6 — PayPal + Client Portal (Feb 2026)
- PayPal full payment (one-time + subscriptions) with Smart Buttons
- Client auth (register/login/forgot-pw/reset-pw) + role separation hardening
- Client Portal (Orders/Subscriptions/Invoices/Proposals/Profile)
- Hidden admin gate (5x footer logo click)

### ✅ Phase 7 — Blog + Onboarding + Nifty + PayPal Plans (Feb 2026)
**New backend modules:**
- `/app/backend/nifty_client.py` — Nifty PM async REST client (graceful fallback when token missing)
- `/app/backend/onboarding_routes.py` — 3-phase onboarding (public-by-token, client-auth, admin)
- `/app/backend/blog_routes.py` — public listing/detail + admin CRUD + AI-assisted drafts (OpenRouter)
- `/app/backend/public_routes.py` — `/api/public/case-studies` (filter public:true)

**New frontend pages:**
- `/blog`, `/blog/:slug` — public blog with markdown renderer + OG/SEO meta
- `/case-studies` — public marketing page
- `/portal/onboarding` — 3-step wizard (Design → Function → Company) with token + client-auth resume
- `/admin/blog` — admin CRUD + AI draft dialog
- `/admin/onboarding` — manage onboardings, regenerate resume links, replay failed Nifty automation
- `/admin/paypal-plans` — create recurring subscription plans

**Wiring:**
- PayPal capture → auto-create client → auto-trigger onboarding (idempotent)
- Onboarding phase submission → Nifty task creation (best-effort) + admin notification + AH project context
- Public case-study filtered endpoint with no auth
- Admin nav: added Blog, Onboarding, PayPal Plans
- Header: added Blog nav link
- Client Portal: added onboarding banner with Resume/Start button
- Footer 5x admin gate still works

**Test results (iteration_5):**
- Backend: 20/20 new pytest cases pass; combined with Phase 6: 47/47 total
- Frontend: 100% flows verified end-to-end (testing agent)
- One PayPal API URL typo found + fixed by testing agent (`/v1/catalog/products` → `/v1/catalogs/products`)

## Backlog

### P1
- Generate `NIFTY_ACCESS_TOKEN` via https://developers.niftypm.com app registration so onboarding tasks auto-create in Nifty. Update `NIFTY_ACCESS_TOKEN` + `NIFTY_PROJECT_ID` in backend `.env`.
- Emailit DNS verification for `bybloomlabs.com` (SPF/DKIM) so transactional emails actually deliver.

### P2
- Google Analytics tracking.
- HMAC signature verification on AgencyHandy webhooks (if plan supports).
- AgencyHandy server-side `list_orders(client_email=…)` filter.
- Admin `/admin/clients` UI page.
- Public blog RSS feed at `/blog/rss.xml`.
- Auto-generated OG cards per blog post (use existing headless Chromium tooling).

### P3
- More integrations the user mentioned ("a lot of apps next"): likely Stripe (backup payment), Google Calendar sync, Slack notifications.
- Onboarding analytics dashboard (completion funnel, time-per-phase).
- AI agent that auto-generates kickoff brief from Phase 3 responses.

## API Endpoints (cumulative)

### Public (no auth)
- `GET /api/paypal/config`, `POST /api/paypal/orders`, `POST /api/paypal/orders/{id}/capture`, `POST /api/paypal/subscriptions`, `GET /api/paypal/subscriptions/{id}`
- `POST /api/webhooks/paypal`, `POST /api/webhooks/agencyhandy`, `POST /api/webhooks/tidycal`
- `POST /api/clients/{register,login,forgot-password,reset-password}`
- `GET /api/blog`, `GET /api/blog/{slug}`
- `GET /api/public/case-studies`, `GET /api/public/case-studies/{id}`
- `GET /api/onboarding/by-token/{token}`, `POST /api/onboarding/by-token/{token}/{save,submit}`

### Client-auth
- `GET/PATCH /api/clients/me`
- `GET /api/clients/me/{orders,subscriptions,invoices,proposals,onboarding}`
- `POST /api/clients/me/onboarding/{save,submit}`

### Admin-auth (role=founder)
- All `/api/admin/*` routes (case-studies, testimonials, etc.)
- `GET/POST/PATCH/DELETE /api/admin/blog`, `POST /api/admin/blog/ai/draft`
- `GET/POST/DELETE /api/admin/onboarding`, `POST /api/admin/onboarding/start`, `POST /api/admin/onboarding/{id}/regenerate-link`, `POST /api/admin/onboarding/{id}/replay/{phase}`
- `GET /api/admin/clients`, `POST /api/admin/clients/{email}/resend-setup`
- `GET /api/paypal/admin/{health,plans,transactions,subscriptions,webhooks}`, `POST /api/paypal/admin/plans`, `POST /api/paypal/admin/webhooks/register`

## MongoDB Collections (cumulative)
- `users`, `daily_routines`, `prospects`, `case_studies`, `testimonials`, `notifications`, `thought_leadership`, `authority_score`
- `clients`, `client_reset_tokens`
- `paypal_transactions`, `paypal_subscriptions`, `paypal_plans`, `paypal_products`, `paypal_webhook_events`
- `blog_posts`
- `onboardings`
