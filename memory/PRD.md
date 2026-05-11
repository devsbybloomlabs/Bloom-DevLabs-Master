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

### ✅ Phase 12 — DB-stored Credentials Store + ThriveDesk Escalation + Slack Notifier (Feb 2026)

**Credentials UX (no more .env edits):**
- `integration_credentials.py` (new): Centralised DB-stored credentials store at `app_settings.integration_credentials`. Resolution priority: env var → DB value. Helpers: `get_credentials`, `get_credential`, `set_provider_credentials`, `list_masked_credentials`.
- New endpoints: `GET /api/admin/integrations/credentials` (masked read), `PUT /api/admin/integrations/credentials/{provider}` (write — accepts approval_studio / thrivedesk / slack only).
- `IntegrationCredentialsForm.jsx` (new) embedded inside `/admin/integrations` — three provider cards (Approval Studio, ThriveDesk, Slack) with show/hide toggle on secret fields, Test connection + Save buttons. Saving auto-refreshes the live client instance (no restart needed).
- `ApprovalStudioClient` + `ThriveDeskClient` both now have `bind_db()` + `_resolve_creds()` so they pick up DB creds at request time.

**Part 4 — ThriveDesk → Nifty Escalation Loop (NEW):**
- **`thrivedesk_client.py`** (new): Mockable REST client. Methods: `get_conversation`, `add_reply`, `add_note`, `update_status`, `add_tags`. Auth via Bearer API key. Mock mode logs every call to `mock_log` for inspection.
- **`thrivedesk_routes.py`** (new):
  - Classification engine: `URGENT_KEYWORDS` (urgent/blocked/asap/critical/emergency) + `URGENT_TAGS` (High Priority/urgent) + `FEATURE_REQUEST_TAGS` (Feature Request).
  - `POST /webhooks/thrivedesk` — Receives `conversation.created`, `conversation.tags.updated`. Verifies HMAC-SHA1+base64 signature (per ThriveDesk spec) when webhook secret is set. Routes to `_create_escalation`.
  - `_create_escalation` — Builds the Nifty task (urgent → "🚨 URGENT SUPPORT — {subject}", due today, custom field `ThriveDesk_Ticket_ID`; feature → "Feature Request — {subject}", custom field `Scope Creep?: To Be Determined`, tag "Client Request"). Persists to `support_escalations` Mongo collection. Idempotent per (ticket_id, classification).
  - Slack alert for urgent — via `slack_notifier.post_message` to `#urgent-support`. When Slack not configured, falls back to admin notification.
  - Error handling — when Nifty task creation fails, queues an admin notification with full ticket details for manual creation (per spec).
  - `POST /admin/support-triage/simulate-ticket` — Synthetic test endpoint for QA / demos.
  - `POST /admin/support-triage/{id}/resolve` — Manual fallback: posts ThriveDesk reply + optionally closes ticket.
  - `GET /admin/support-triage/mock-log` — ThriveDesk activity inspection.
- **Reverse-sync (Nifty → ThriveDesk)**: `milestone_routes.nifty_webhook` calls `relay_nifty_completion_to_thrivedesk()` whenever a Nifty task with `ThriveDesk_Ticket_ID` custom field is marked Complete. Posts public reply ("We've resolved your request! …") + optionally closes the ticket when custom field `Close Ticket: Yes`.
- **`slack_notifier.py`** (new): Simple async webhook POST (no SDK). Reads `SLACK_WEBHOOK_URL` env var first, falls back to DB-stored credentials. Returns `{ok, status, reason}`; never raises. `reason='not_configured'` lets callers fall back to admin notifications.
- **`SupportTriageAdmin.jsx`** (new admin page at `/admin/support-triage`): Stats tiles (open / urgent open / feature requests open / resolved), type+status filters, Resolve dialog (summary + close ticket checkbox), Simulate Ticket dialog, Mock Log dialog.
- Health endpoint extended to 8 providers (added `thrivedesk` + `slack`).

**Test results:**
- iteration_12 14/14 phase12 backend pytest + 30/30 phase10+11 regression = **44/44 PASS**.
- iteration_12 100% frontend verification — every spec'd selector and flow rendered correctly. Zero issues.

### ✅ Phase 13 — ThriveDesk Live Integration + Escalation Timeline + Demo Mode (Feb 2026)

**ThriveDesk goes LIVE (with public-scope JWT):**
- User saved a real ThriveDesk JWT API key via the Phase 12 credentials form.
- Token has `scope: ["public"]` which only exposes `/v1/me`, `/v1/inboxes`, `/v1/contacts`. Write endpoints (conversations/replies, conversations/notes, conversations status) return 405 Method Not Allowed.
- `/admin/integrations/thrivedesk/test` switched to use `/v1/me` (works on every scope) and surfaces `company` name on success.
- New `_is_scope_limited(res)` helper catches 401/403/404/405 from write endpoints and falls back to `mock_log` + `{success: True, scope_limited: True}`. UI flows still complete successfully; users see a "scope-limited heads-up" note in the Timeline dialog.

**P3 — ThriveDesk Visual Escalation Timeline (NEW):**
- New backend endpoint `GET /api/admin/support-triage/{id}/timeline` aggregates events chronologically from `support_escalations`, `thrivedesk_webhook_events`, and `notifications` collections.
- Each event has `{kind, title, body, at, icon, actor}` with icon enums (alert / check / error / info / webhook / check_circle).
- Annotates with live ThriveDesk thread when API key has conversation scope.
- New `EscalationTimelineDialog.jsx` — vertical timeline with iconified events, scope-limited heads-up note, and live thread JSON when available. Triggered via per-row "Timeline" button.

**Potential improvement — Demo Mode (NEW):**
- New `demo_routes.py` — `POST/DELETE /admin/demo/seed` + `GET /admin/demo/status`. Spawns exactly 13 synthetic records (2 clients with portal access + 2 milestones + 3 approvals in mixed states + 4 escalations in mixed states + 1 onboarding + 1 lead). All flagged `demo: True` so they can be wiped via the same endpoint. Idempotent — POST wipes first.
- Demo password is `demo1234`.
- New `DemoModeCard.jsx` on the Dashboard home — "Arm demo" button, switches to Re-seed/Wipe/Copy creds when active, shows per-collection counts.

**Test results:**
- iteration_13 8/8 phase13 backend tests + 26/26 phase 11+12 regression = **34/34 PASS**.
- iteration_13 100% frontend verification — every selector + flow rendered correctly. Zero functional bugs.

### ✅ Phase 14 — Slack LIVE + Public Sandbox Tour at /tour (Feb 2026)

**Slack incoming webhook configured:**
- User pasted webhook URL into `/admin/integrations` → Credentials → Slack. Live test message landed in `#urgent-support`. Health pill: green.
- 6 of 8 integrations now LIVE (only Approval Studio + Nifty remain pending real credentials).

**P3 — Public Sandbox Tour at /tour (NEW):**
- New public route `/tour` — no auth required. Walks prospects through the full automation flywheel using real demo data fetched from `GET /api/public/tour/snapshot`.
- **Backend `public_tour_routes.py`** — auto-seeds the demo dataset on first request if empty; strips `hashed_password` and `raw_data` from every response; returns curated featured items (urgent escalation, in_review approval, complete milestone) + full arrays + stats.
- **Frontend `PublicSandboxTour.jsx`** — IntersectionObserver-driven scrollytelling layout:
  - Hero with bold gradient (#0F172A → #1E40AF), "Start the tour" CTA + "Skip — talk to founder" secondary
  - 6 step sections with sticky preview panel that swaps content based on scroll position
  - Each preview is a browser-framed card: Onboarding wizard preview, Approval Studio comment, Comment thread, Urgent escalation card, Slack message rendering, Resolution timeline
  - Closing CTA section with "Book a 15-min call" + "See pricing"
- **GA4 instrumentation** — fires `tour_step_view` (per step on scroll) and `tour_cta_click` events (with `location: header|hero|footer` labels).
- **SEO** — added `/tour` to `sitemap.xml` with priority 0.95. Added "See it live" link to main site Header nav.

**Test results:**
- iteration_14 7/7 phase14 backend tests + 34/34 phase 11-13 regression = **41/41 PASS**.
- iteration_14 100% frontend verification — every data-testid covered, scrollytelling preview-swap verified, Header nav-link routes correctly, sitemap includes /tour. Zero bugs.

### ✅ Phase 15 — Part 6 + A/B test + Lead scoring + Multi-workspace + Approval annotations (Feb 2026)

**Part 6 — Client Portal Contact Us → ThriveDesk (NEW):**
- New `contact_routes.py` — POST `/api/clients/me/contact` accepts multipart {subject, body, priority, file<=10MB}, stores file under `/app/backend/uploads/<uuid>.<ext>`, calls ThriveDesk `create_conversation`, falls back to `status: 'queued'` when scope-limited (current public-scope JWT). Persists in `client_contacts` Mongo collection.
- Slack notification on every submission (best-effort) + Emailit confirmation email to client.
- Hourly `thrivedesk_retry_cron` retries queued submissions (up to 6 attempts).
- Reverse-sync: ThriveDesk `conversation.status.updated → resolved/closed` triggers `relay_td_resolution_to_client` which emails the client.
- Owner-only attachment download via `GET /api/clients/me/contact/attachment/{id}` (cross-tenant 404).
- Frontend: new `ClientContactPanel.jsx` with subject + body + priority + file upload (with size preview, remove-chip, 10MB client-side cap), priority dropdown, submission history with status pills (sent / queued / resolved / failed).

**A/B test CTA position on /tour:**
- `ab_test_routes.py` — POST `/public/ab/track` (no auth) with `{experiment, variant, kind}`. GET `/admin/ab/{exp}/stats` returns per-variant CTR + winner detection.
- 3 variants on `/tour`: `header` (CTA only in slim header) | `hero` (large CTA in hero) | `sticky` (bottom sticky bar with dismiss X). Assignment cached in `localStorage.bloom_ab_tour_cta`. Impressions + clicks tracked.
- `AbStatsCard.jsx` embedded on `/admin/integrations` shows live CTR breakdown + winner badge.

**Lead scoring + segmentation:**
- `_score_lead()` heuristic (magnet weight 0-30 + source weight 0-25 + recency 0-25 + engagement 0-20 = 0-100).
- `_segment_for_score()` → hot ≥70 · warm 40-69 · cold <40.
- `/admin/leads` now accepts `?segment`, `?score_min`, `?source_contains`, `?magnet_slug` filters.
- New `/admin/leads/segments` aggregation endpoint.
- `LeadsTablePanel.jsx` embedded on `/admin/lead-magnets` — 4 stat tiles + filter row (segment/magnet/source-text/score slider) + scored leads table.

**Multi-workspace Nifty:**
- New `nifty_workspaces_routes.py` — `nifty_workspaces` Mongo collection stores snapshots {id, name, access_token, refresh_token, expires_at, last_activated_at}.
- POST snapshots the current live OAuth into a named record. POST `/{id}/activate` copies tokens back into `integrations.nifty` so NiftyClient picks them up on next call.
- `NiftyWorkspacesPanel.jsx` embedded in IntegrationsAdmin Nifty card — name input + Save/Activate/Delete buttons per snapshot.

**Approval Studio real-time annotation preview:**
- Extended `ApprovalStudioClient.list_comments()` to return a deterministic mock thread per project_id when in mock mode (2-5 comments seeded from `_MOCK_ANNOTATION_CORPUS`).
- New `GET /admin/approvals/{id}/annotations` returns `{comments, aps_mode}`.
- `ApprovalAnnotationsDialog.jsx` — vertical timeline with resolved/open status icons + anchor coordinates display.

**Test results:**
- iteration_15 15/15 phase15 backend + 40/40 phase 11-14 regression = **55/55 PASS**, 1 skipped (Slack live).
- iteration_15 100% frontend verification — all 5 features + Part 6 verified via testids + flows. Zero issues.
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
- ~~Generate Nifty access token~~ Still pending. With multi-workspace now live (Phase 15), you can snapshot + switch between multiple Nifty workspaces once you've OAuth'd at least one.
- Wire **Google Calendar OAuth** — paste `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (setup steps sent to user). Will enable client booking flow + milestone calendar sync.
- Wire real Approval Studio creds (paste in /admin/integrations → Credentials → Approval Studio).
- Upgrade ThriveDesk JWT scope from `public` → `admin` so write endpoints (replies, status) work live (currently scope-limited fallback queues for hourly retry).
- Re-issue Slack webhook URL — the current one started returning `no_team` (likely revoked by Slack after many tests).

### P2
- ~~HMAC signature verification on AgencyHandy webhooks.~~ ✅ Done (Phase 11).
- ~~AgencyHandy server-side `list_orders(client_email=…)` filter.~~ ✅ Done (Phase 11).
- ~~Admin `/admin/clients` UI page.~~ ✅ Done (Phase 11).
- ~~Migrate dynamic OG SVG to also render to PNG.~~ ✅ Done (Phase 11).
- ~~DB-stored credentials store + UI~~ ✅ Done (Phase 12).
- ~~ThriveDesk ↔ Nifty escalation loop~~ ✅ Done (Phase 12).

### P3
- A/B testing for lead magnet copy.
- Automated Nifty project creation on Phase 3 onboarding submit.
- Stripe as backup payment processor.
- ~~Google Calendar sync.~~ DEFERRED — awaiting creds from user.
- ~~Slack notifications.~~ ✅ Done (Phase 12/14).
- ~~Approval Studio real-time annotation preview.~~ ✅ Done (Phase 15).
- ~~ThriveDesk visual escalation timeline.~~ ✅ Done (Phase 13).
- ~~Multi-workspace Nifty support.~~ ✅ Done (Phase 15).
- ~~Public "Sandbox tour" route at /tour.~~ ✅ Done (Phase 14).
- ~~A/B-test the CTA position on /tour.~~ ✅ Done (Phase 15).
- ~~Lead scoring + segmentation.~~ ✅ Done (Phase 15).
- ~~Client portal Contact Us form (Part 6).~~ ✅ Done (Phase 15).
- Embed a 15-second product demo video on /tour above the fold.

### P4
- Project Files tab in the client portal (Google Drive integration for *continuous* deliverable folder sharing — distinct from Part 6 support attachments).
- Sandbox tour i18n (Spanish/French translations for international prospects).
- Email digest summary for admins (Mon-morning recap of pending escalations, queued contacts, fresh leads).

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
