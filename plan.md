# plan.md — Bloom Labs Platform (bybloomlabs.com)

## 1) Objectives
- Deliver a fast, branded landing page that converts visitors into booked discovery calls and package starts (**PayPal placeholders**, swappable later).
- Provide an internal founder dashboard for **daily AI routine** + **outreach/content generation** + **pipeline/CRM** + **analytics**.
- Ship credibility/authority modules (case studies, testimonials, thought leadership, authority score + milestones) with **Emailit** email automation.
- Add an integration layer that connects the system end-to-end:
  - **TidyCal webhook → pipeline + notifications**
  - **Agency Handy → revenue ops (MRR, proposals follow-up, invoices) + real-time webhooks + streamlined two-way workflow**
- Ensure the system is tested end-to-end with graceful fallbacks and clear UX for partial integration states (e.g., Emailit DNS not verified, Agency Handy webhook config missing).

## 2) Implementation Steps

### Phase 1 — Core POC (Isolation): AI + Email + Webhook viability ✅ COMPLETED
**Core workflow proven:** OpenRouter generation + Emailit send + webhook ingestion.

**What was done:**
1. Built POC scripts and verified external dependencies:
   - OpenRouter routine generation works using a current model.
   - Emailit API wiring works (may require sender DNS verification depending on account state).
2. Hardened AI parsing:
   - Strips markdown fences.
   - Increased `max_tokens` to prevent truncated JSON.
   - Added static fallback routine if AI fails.

**Result:** External dependency risk is reduced; production code uses the validated patterns.

---

### Phase 2 — V1 App Development (MVP): Landing + Admin core ✅ COMPLETED
**Deliverables shipped:** React + FastAPI + MongoDB with shadcn/ui styling and production-grade UX.

**What was built:**
1. Landing page (`/`) implemented per spec (10 sections):
   - Sticky header with logo + nav + CTA.
   - Hero + Problem + Solution/Guarantees.
   - 3 package offer cards with PayPal placeholder CTAs using `data-paypal-tier`.
   - Case studies, How-we-work timeline, Why Bloom grid.
   - TidyCal iframe embed.
   - FAQ accordion, footer with email/phone/social (`/bybloomlabs`), privacy placeholder.
   - Logo + favicon + OG/meta tags.
2. Admin dashboard core (`/admin/*`):
   - JWT auth + seeded founder user (`founder@thesalvador.group` / `admin123`) idempotently.
   - Pages shipped: Dashboard Home, Routine, Outreach AI, Content AI, Pipeline, Analytics, Settings.
   - OpenRouter integration:
     - Daily 7-block routine generation with checklists + copyable AI prompts.
     - Outreach openers, content generator, discovery call brief.
   - Block timer with 5-minute warning.
   - APScheduler cron: **daily 5am routine generation**.

**Testing:**
- Phase 1 landing tested: **100% pass** (iteration_1.json).

---

### Phase 3 — More Features: Credibility builder + richer analytics ✅ COMPLETED
**What was built:**
1. Case studies manager:
   - CRUD: metadata, quote, investment, timeline, featured image URL, public toggle.
   - Completion checklist with toggles.
2. Testimonials module:
   - CRUD + permission tracking + status states.
   - Emailit send-request endpoint wired and UI button provided.
   - Clear UI guidance when Emailit domain verification is pending.
3. Thought leadership tracker:
   - CRUD + grouped display by type (blog, guest post, speaking, podcast, etc.).
4. Authority system:
   - Manual inputs (followers/visitors/inbound metrics) stored as snapshots.
   - Authority score + milestone tracking.
5. Positioning consistency checker:
   - Scans stored content/case studies for “AI-native” mentions and provides counts/recommendations.
6. Content themes performance:
   - Aggregates engagement scoring by content type.

**Testing:**
- Included in iteration_2.json comprehensive run.

---

### Phase 4 — Integration Layer + Automation: Webhooks, sync, cron, hardening ✅ COMPLETED
**What was built:**
1. TidyCal webhook listener:
   - `POST /api/webhooks/tidycal` (**no auth**) creates/updates Prospect + creates Notification.
   - Idempotent behavior (no duplicate prospects on re-delivery).
   - Cancellation event handling.
2. Notifications system:
   - Backend: `/api/notifications` (list), `/read`, `/clear`.
   - Frontend: notifications bell with unread count + popover.
3. Internal sync rules (AI-assisted):
   - `POST /api/sync/case-study/{id}/to-content`:
     - Generates LinkedIn post draft via OpenRouter.
     - Saves as `ContentPiece` draft.
     - Auto-checks `case_study.checklist.linkedin_post=true`.
   - `POST /api/sync/testimonial/{id}/feature`:
     - Marks testimonial featured.
     - Generates “celebrate/testimonial highlight” draft post.
4. Reliability hardening:
   - OpenRouter fallback model: `meta-llama/llama-3.3-70b-instruct:free`.
   - Clear error responses and UI toasts.
   - Cron job continues to operate independently of UI.

**Testing:**
- Comprehensive Phase 2–4 test run: **Backend 100% (50/50)**, **Frontend desktop 95%**, **Frontend mobile 100%**, **no critical issues** (iteration_2.json).

---

### Phase 5 — Agency Handy Integration (Revenue Ops + Webhooks + Streamlined Two-way Workflow + AI Context) ✅ COMPLETED
**Goal achieved:** Agency Handy is now the system-of-record for revenue operations, while Bloom Labs admin remains the day-to-day ops cockpit.

**Key product outcomes (stakeholder priorities):**
- **MRR tracking is first-class** (Dashboard widget + Revenue page; MoM snapshot system in place).
- Clear visibility into **proposals that need follow-up** (including the two high-value Orbitstream proposals).
- Daily AI routine emphasizes **revenue-driving actions** from live/cached Agency Handy data.
- Admin UX avoids confusion:
  - **Pipeline** = pre-sale leads/prospects (TidyCal + manual + AH form responses)
  - **Revenue & Clients** = post-sale system-of-record (Agency Handy)

#### Phase 5.1 — Foundation (Data Layer + API Client) ✅ COMPLETED
- Added Agency Handy config to `backend/.env`:
  - `AGENCYHANDY_API_KEY`, `AGENCYHANDY_BASE_URL`, `AGENCYHANDY_COMPANY_ID`, `AGENCYHANDY_DEFAULT_CURRENCY`
- Built `agencyhandy_client.py`:
  - Uses `x-api-key` auth (verified live).
  - Timeouts + structured `{success,status,data,error}` envelope.
  - Defensive parsing for partial/empty datasets.
  - Webhook helper methods: events lookup, auth save, create/update/delete, send test.
- Implemented read-only proxy endpoints (auth required):
  - `GET /api/agencyhandy/health`
  - `GET /api/agencyhandy/services`
  - `GET /api/agencyhandy/orders`
  - `GET /api/agencyhandy/invoices`
  - `GET /api/agencyhandy/subscriptions`
  - `GET /api/agencyhandy/proposals`
  - `GET /api/agencyhandy/clients`
  - `GET /api/agencyhandy/summary` (MRR + proposal follow-ups + invoice KPIs + renewals)
  - `GET /api/agencyhandy/revenue-actions` (prioritized daily actions)
  - `POST /api/agencyhandy/refresh` (cache refresh)
- MRR & KPI logic:
  - MRR computed as monthly-normalized subscription value.
  - Daily MRR snapshots in MongoDB for later MoM deltas.
- Cache strategy:
  - MongoDB `ah_cache` used for resilience.
  - Summary returns freshness + stale source flags.

#### Phase 5.2 — Revenue Dashboard UI ✅ COMPLETED
- Added new admin page: **`/admin/revenue`** with tabs:
  - Overview (MRR, proposals follow-up, renewals, recent orders)
  - Subscriptions
  - Proposals
  - Invoices
  - Clients
- Added **Dashboard Home MRR widget**:
  - Shows MRR/ARR, active subs, pending proposals.
  - Shows top “Today’s revenue actions” list.
- Added sidebar nav entry: **Revenue & Clients**.
- Follow-up UX:
  - Highlights stale proposals (sent ≥ 3 days) and surfaces value.
  - Two high-value Orbitstream proposals (₱250K / ₱200K) are now surfaced consistently.

#### Phase 5.3 — Webhooks + Real-time Sync ✅ COMPLETED
- Public webhook receiver (**no auth**):
  - `POST /api/webhooks/agencyhandy`
  - Always returns 200 to prevent retry storms.
  - Persists audit events to `ah_webhook_events`.
  - Verification logic:
    - Token-based verification via webhook auth token.
    - Accepts Agency Handy test events signed with `x-ah-sig` header.
- Admin webhook management endpoints (auth required):
  - `GET /api/agencyhandy/webhooks/status`
  - `POST /api/agencyhandy/webhooks/register` (idempotent upsert)
  - `POST /api/agencyhandy/webhooks/test/{event}`
  - `DELETE /api/agencyhandy/webhooks/{id}`
- Settings UI: full **Agency Handy Webhooks panel**
  - Shows registered state, target URL, active webhook, recent events.
  - Re-sync events + send test controls.
- Event automation (notifications + cache invalidation + pipeline sync):
  - ORDER, INVOICE, PAYMENT, PROPOSAL, CLIENT, TASK events → NotificationItems
  - `PUBLIC_FORM.RESPONSE.CREATED` → auto-create Prospect in Pipeline
  - `PROPOSAL.ACCEPTED` → creates/updates Prospect status to `won`
  - `ORDER.UPDATED` (completed) → best-effort Emailit testimonial request with idempotency guard

#### Phase 5.4 — Streamlined Two-way Workflow + AI Routine Revenue Context ✅ COMPLETED
- Pipeline → Agency Handy handoff:
  - Added **Send Quotation** action on Pipeline rows.
  - Implementation choice (by necessity):
    - Updates prospect status to `proposal` + sets a next-action note.
    - Opens Agency Handy portal/catalog in a new tab to complete the quotation.
    - Rationale: Agency Handy quotation creation API requires complex nested `inlineServices` / package configuration.
- AI routine revenue context injection:
  - Routine generation appends **AGENCY HANDY REVENUE CONTEXT** to the prompt.
  - Verified live: routine blocks now include concrete tasks like following up on the stale Orbitstream proposals.

**Testing:**
- Comprehensive Phase 5 test run: **Backend 100% (67/67)** + **Frontend verified** + **integration verified** (iteration_3.json).

## 3) Next Actions
**Delivery-ready. Remaining operator tasks (outside the codebase):**
1. **Replace PayPal placeholders**
   - Update `/app/frontend/src/lib/brand.js` → `PAYPAL_LINKS.{express|custom|enterprise}` with real PayPal URLs.
2. **Emailit sender domain verification (if needed)**
   - Verify `bybloomlabs.com` in Emailit dashboard (SPF + DKIM DNS records).
3. **Configure TidyCal webhook (optional but recommended)**
   - In TidyCal, set webhook URL to: `https://bybloomlabs.com/api/webhooks/tidycal`.
4. **Agency Handy production operator tasks**
   - Set production environment variables:
     - `AGENCYHANDY_API_KEY`
     - `AGENCYHANDY_WEBHOOK_TARGET_URL=https://bybloomlabs.com/api/webhooks/agencyhandy`
     - `AGENCYHANDY_WEBHOOK_SECRET` (token)
     - `AGENCYHANDY_WEBHOOK_AUTH_ID` (Token auth ID from AH)
   - Click **Settings → Agency Handy webhooks → Register webhook** (or call `/api/agencyhandy/webhooks/register`).
   - Optionally rotate webhook token periodically (update env + re-sync).
5. **Backlog items (optional / future)**
   - Public marketing page: **`/case-studies`** pulling published case studies.
   - Swap PayPal placeholders (or switch to Stripe).
   - Implement true quotation creation via AH API (requires building nested inlineServices payload builder).
   - Add HMAC signature verification if Agency Handy supports it for your plan/auth type.

## 4) Success Criteria
✅ **Landing page**
- All 10 sections render, mobile responsive, explicit backgrounds, branding correct (#1E3A8A / #3B82F6).
- TidyCal embed works.
- Package CTAs use PayPal placeholders and `data-paypal-tier` attributes.
- Correct meta/OG tags + favicon.

✅ **Admin dashboard**
- JWT login works with seeded founder credentials.
- AI routine/outreach/content/discovery generation works with validated OpenRouter models.
- Checklist toggles persist; pipeline CRUD works; analytics updates persist.
- Block timer renders with warning state.
- Daily 5am cron generation works.

✅ **Credibility builder**
- Case studies/testimonials/thought leadership CRUD fully functional.
- Authority score + milestones update based on stored data.
- Positioning checker and content themes performance visible.

✅ **Integrations**
- TidyCal webhook creates/updates pipeline entries and generates notifications.
- Internal sync endpoints generate AI draft posts and update checklist/status.
- Emailit send-request endpoint responds gracefully whether domain is verified or pending.

✅ **Agency Handy (Phase 5)**
- **MRR tracking** visible in Dashboard + dedicated Revenue page, with MoM delta snapshot system in place.
- Proposals needing follow-up list is accurate and action-oriented (Orbitstream proposals surfaced everywhere).
- Webhooks keep revenue KPIs fresh and generate notifications.
- Streamlined two-way workflow works: Prospect → mark as proposal → open Agency Handy portal to send quotation.
- Daily routine includes revenue-driven blocks driven by live/cached Agency Handy data.

✅ **Testing**
- Iteration 1: Phase 1 landing page **100% pass**.
- Iteration 2: Phase 2–4 **backend 100%**, **frontend mobile 100%**, **frontend desktop 95%** (minor selector detection notes, no functional bugs).
- Iteration 3: Phase 5 **backend 100% (67/67)** + frontend/integration verification (no issues).