# Bloom Labs Platform — PRD

## Original Problem Statement
Build & maintain the Bloom Labs (`bybloomlabs.com`) full-stack application:
- High-converting B2B SaaS landing page
- Founder admin dashboard (AI routine, CRM, content, credibility hub, revenue ops)
- Integrations: OpenRouter (AI), Emailit (transactional email), AgencyHandy (CRM/revenue), TidyCal (booking)
- PayPal full payment processing (one-time + subscriptions) — Feb 2026
- Client Portal (self-service) — Feb 2026
- Hidden admin login — Feb 2026

## User Personas
- **Founder** (Ryan Salvador) — sole admin user. Operates daily AI routine, pipeline, content, revenue.
- **Prospect** — discovery-call lead from TidyCal/manual/AgencyHandy form responses.
- **Client** — paid customer with portal access (orders, invoices, subscriptions, proposals, profile).

## Core Requirements (static)
1. SEO-optimized public landing with OG cards, sitemap, robots, JSON-LD.
2. Bw Modelica self-hosted typography across the entire app.
3. Mobile-responsive: zero horizontal overflow at 375px.
4. JWT auth with strict role separation (`founder` vs `client`).
5. All integrations resilient (graceful 5xx, audit trails, retry-safe webhooks).
6. MongoDB with `_id` exclusion on every response.

## Tech Stack
- Frontend: React 19 (CRA + craco), Tailwind, shadcn/ui, react-router-dom 7, sonner, @paypal/react-paypal-js
- Backend: FastAPI, Motor (async MongoDB), httpx, bcrypt, PyJWT, APScheduler
- DB: MongoDB
- Integrations: OpenRouter, Emailit, AgencyHandy, TidyCal, **PayPal REST v2**

## Implementation Log

### ✅ Phase 1 — Core POC (completed prior session)
External dependency proven: OpenRouter routine generation, Emailit send, webhook ingestion.

### ✅ Phase 2 — V1 MVP (completed prior session)
Landing page (10 sections) + Admin dashboard core (JWT, daily routine, outreach, content, pipeline, analytics, settings) + APScheduler 5am cron.

### ✅ Phase 3 — Credibility Builder (completed prior session)
Case studies, testimonials, thought leadership, authority score, positioning checker, content themes.

### ✅ Phase 4 — Integration Layer (completed prior session)
TidyCal webhook → prospect/notifications, internal AI sync rules, OpenRouter fallback model.

### ✅ Phase 5 — AgencyHandy Integration (completed prior session)
MRR widget, /admin/revenue page, webhook receiver, real-time sync, revenue-context AI routine.

### ✅ Phase 6 — PayPal + Client Portal (completed Feb 2026)
**Backend additions:**
- `/app/backend/paypal_client.py` — async REST v2 client (OAuth, Orders, Catalog Products, Plans, Subscriptions, Webhook verify via official endpoint)
- `/app/backend/paypal_routes.py` — public checkout endpoints + admin-auth-protected admin endpoints
- `/app/backend/paypal_webhooks.py` — `POST /api/webhooks/paypal` (no auth, signature-verified, persisted to `paypal_webhook_events`)
- `/app/backend/client_routes.py` — client auth (register/login/forgot-pw/reset-pw), client portal (`/clients/me/*`), admin client management (`/admin/clients`)
- `/app/backend/auth.py` — **hard role separation**: `get_current_user` now rejects role=`client` tokens
- `/app/backend/.env` — `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` (sandbox), `PAYPAL_ENV=sandbox`

**Frontend additions:**
- `/app/frontend/src/lib/clientAuth.js` — `ClientAuthProvider`, `RequireClient`, separate localStorage key from admin
- `/app/frontend/src/components/payment/PayPalCheckoutButton.jsx` — reusable Smart Buttons (order & subscription)
- `/app/frontend/src/components/sections/Pricing.jsx` — checkout dialog with email/name capture → Smart Buttons
- `/app/frontend/src/components/sections/Header.jsx` — Client Login button (top right + mobile menu)
- `/app/frontend/src/components/sections/Footer.jsx` — 5x rapid click on footer logo within 3s → `/admin/login` (hidden admin gate)
- `/app/frontend/src/pages/client/{ClientLogin,ClientRegister,ClientPortal,SetPassword,ForgotPassword,CheckoutSuccess}.jsx`
- `/app/frontend/src/App.js` — registered all client routes (`/login`, `/register`, `/portal`, `/forgot-password`, `/set-password`, `/reset-password`, `/checkout/success`)

**Testing:**
- 27/27 backend pytest cases pass (`/app/backend/tests/test_paypal_clients.py`)
- All 9 frontend flows verified (header button, registration → portal, 5 portal tabs, profile save+persist, logout, footer admin gate, mobile menu client login, forgot password, pricing checkout dialog with PayPal Smart Buttons)

**Known user-config issue (not a code bug):**
- PayPal sandbox `CLIENT_ID` and `CLIENT_SECRET` in `.env` are intentionally the same string (user pasted Client ID twice). PayPal OAuth returns `invalid_client` until user pastes real secret. Backend handles gracefully with 502 + clear error message.

## Backlog / Future Tasks

### P1
- Replace duplicated `PAYPAL_CLIENT_SECRET` in `.env` with real PayPal sandbox secret. Once done, full end-to-end PayPal checkout works.
- Build **subscription plans** for Server Management / App Maintenance / 3-Tier Support — UI to create plans in `/admin/revenue` → POST `/api/paypal/admin/plans`.
- Register PayPal webhook URL in production: `POST /api/paypal/admin/webhooks/register` (sets `PAYPAL_WEBHOOK_TARGET_URL` from env).
- Emailit DNS verification for `bybloomlabs.com` (SPF/DKIM) so client setup emails actually send.

### P2
- Public `/case-studies` marketing page pulling `?public=true` from `/api/case-studies`.
- Google Analytics tracking.
- HMAC signature verification on AgencyHandy webhooks (if plan supports it).
- AgencyHandy server-side filter for `list_orders(client_email=…)` instead of client-side filtering.
- Admin `/admin/clients` UI page listing/managing client accounts with resend-setup button.

### P3
- More 3rd-party integrations (per user note: "we will be integrating a lot of apps next"). Likely candidates from prior conversations: Stripe (backup payment), Calendly (alt to TidyCal), Slack notifications, Google Calendar sync.

## API Endpoints (new in Phase 6)

### Public (no auth)
- `GET /api/paypal/config`
- `POST /api/paypal/orders` (create one-time)
- `POST /api/paypal/orders/{id}/capture`
- `POST /api/paypal/subscriptions` (create from plan_key)
- `GET /api/paypal/subscriptions/{id}`
- `POST /api/webhooks/paypal`
- `POST /api/clients/register`
- `POST /api/clients/login`
- `POST /api/clients/forgot-password`
- `POST /api/clients/reset-password`

### Client-auth required
- `GET /api/clients/me`
- `PATCH /api/clients/me`
- `GET /api/clients/me/orders`
- `GET /api/clients/me/subscriptions`
- `GET /api/clients/me/invoices`
- `GET /api/clients/me/proposals`

### Admin-auth required (role=founder)
- `GET /api/paypal/admin/health`
- `GET /api/paypal/admin/plans`
- `POST /api/paypal/admin/plans` (create subscription plan)
- `GET /api/paypal/admin/transactions`
- `GET /api/paypal/admin/subscriptions`
- `POST /api/paypal/admin/webhooks/register`
- `GET /api/paypal/admin/webhooks`
- `GET /api/admin/clients`
- `POST /api/admin/clients/{email}/resend-setup`

## MongoDB Collections (new in Phase 6)
- `clients` — { id, email, name, company, phone, password_hash, needs_password_setup, source, source_ids, status, last_login_at, created_at, updated_at }
- `client_reset_tokens` — { token, email, purpose, expires_at, used, created_at }
- `paypal_transactions` — { id, kind, status, tier, amount, currency, customer_email, customer_name, description, metadata, raw, raw_capture, captured_at, created_at, updated_at }
- `paypal_subscriptions` — { id, plan_id, plan_key, status, customer_email, customer_name, metadata, raw, activated_at, created_at, updated_at }
- `paypal_plans` — { plan_id, plan_key, product_id, name, description, price, currency, interval_unit, interval_count, status, created_at }
- `paypal_products` — { product_id, name, description, created_at }
- `paypal_webhook_events` — { event_id, event_type, resource_type, summary, received_at, verified, raw }
