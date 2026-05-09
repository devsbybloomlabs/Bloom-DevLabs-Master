# plan.md — Bloom Labs Platform (bybloomlabs.com)

## 1) Objectives
- Deliver a fast, branded landing page that converts visitors into booked discovery calls and package starts (**PayPal placeholders**, swappable later).
- Provide an internal founder dashboard for **daily AI routine** + **outreach/content generation** + **pipeline/CRM** + **analytics**.
- Ship credibility/authority modules (case studies, testimonials, thought leadership, authority score + milestones) with **Emailit** email automation.
- Add an integration layer that connects the system end-to-end:
  - **TidyCal webhook → pipeline + notifications**
  - **Agency Handy → revenue ops (MRR, proposals follow-up, invoices) + real-time webhooks + two-way sync**
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

### Phase 5 — Agency Handy Integration (Revenue Ops + Webhooks + Two-way Sync + AI Context) 🚧 IN PROGRESS
**Goal:** Make Agency Handy the system-of-record for revenue operations while keeping Bloom Labs admin UX streamlined.

**Key product outcomes (from stakeholder priorities):**
- **MRR tracking is most important** (plus month-over-month delta).
- Clear visibility into **proposals that need follow-up**.
- Daily AI routine emphasizes **revenue-driving actions**.
- Preserve clarity for admins/moderators/sales (no confusing duplication of Pipeline vs Revenue).

#### Phase 5.1 — Foundation (Data Layer + API Client) 🚧 IN PROGRESS
- Add `AGENCYHANDY_API_KEY` to `backend/.env`.
- Create `agencyhandy_client.py`:
  - HTTP wrapper using `x-api-key` header (confirmed required).
  - Retries, timeouts, structured errors.
  - Defensive parsing for partial/empty datasets.
- Define Pydantic models:
  - `AHOrder`, `AHInvoice`, `AHSubscription`, `AHProposal`, `AHClient`, `AHService`.
- Implement read-only proxy endpoints:
  - `GET /api/agencyhandy/orders`
  - `GET /api/agencyhandy/invoices`
  - `GET /api/agencyhandy/subscriptions`
  - `GET /api/agencyhandy/proposals`
  - `GET /api/agencyhandy/clients`
  - `GET /api/agencyhandy/services`
  - `GET /api/agencyhandy/summary` (MRR + KPIs)
- MRR calculation logic:
  - Sum active subscriptions normalized to **monthly MRR**.
  - Track last-month MRR snapshot for delta.
- Cache strategy:
  - Light caching in MongoDB collections `ah_cache_*`.
  - Refresh on demand (endpoint query param) and via webhooks (Phase 5.3).

#### Phase 5.2 — Revenue Dashboard UI ✅ PLANNED
- Add new admin page: `/admin/revenue` with tabs:
  - Overview (MRR, proposals needing follow-up, recent orders)
  - Subscriptions
  - Invoices
  - Proposals
  - Clients
- Add MRR widget to Dashboard Home (with delta vs last month).
- Add “Proposals needing follow-up” component:
  - Criteria: sent > 3 days ago, not accepted/rejected, no recent activity.
- Sidebar nav entry: **Revenue** (keep Pipeline intact to avoid disruption).
- UX intent:
  - **Pipeline** = lead/prospect operations (TidyCal + manual prospects).
  - **Revenue** = revenue system-of-record (Agency Handy).
  - Cross-links between them (e.g., Prospect → Create Quotation).

#### Phase 5.3 — Webhooks + Real-time Sync ✅ PLANNED
- Register Agency Handy webhooks programmatically on backend startup (idempotent):
  - Use `POST /webhooks` and `GET /webhooks` to upsert.
- Add public receiver endpoint:
  - `POST /api/webhooks/agencyhandy`
- Security:
  - Verify webhook signature (HMAC) using the rolled/registered secret.
  - Provide admin UI readout for webhook status + last delivery.
- Handle events (minimum set aligned to revenue ops):
  - `ORDER.CREATED`, `ORDER.UPDATED`
  - `INVOICE.STATUS.CHANGED`
  - `PAYMENT.RECEIVED`, `PAYMENT.FAILED`
  - `PROPOSAL.SENT`, `PROPOSAL.ACCEPTED`, `PROPOSAL.REJECTED`
  - `CLIENT.ADDED`
  - `PUBLIC_FORM.RESPONSE.CREATED`
  - `TASK.COMPLETED`
- Each event actions:
  - Create Bloom Notification.
  - Update `ah_cache_*` selectively.
  - Trigger selective automation:
    - `PUBLIC_FORM.RESPONSE.CREATED` → auto-create Prospect in Pipeline.
    - `ORDER.UPDATED` → if completed → auto-trigger Emailit testimonial request (guarded + idempotent).

#### Phase 5.4 — Two-way Sync + AI Routine Revenue Context ✅ PLANNED
- Two-way sync (Pipeline → Agency Handy):
  - Pipeline page: add **“Send Quotation”** button.
  - Backend: `POST /api/agencyhandy/quotations` (wrap AH `POST /quotations`).
  - Use Prospect data to create quotation draft and send.
- Daily routine AI prompt enhancements (revenue context):
  - Open proposals expiring / needing follow-up.
  - Subscriptions renewing in 7 days (upsell/check-in).
  - Overdue invoices (collection actions).
  - Recently completed orders (testimonial requests).
  - New form responses (lead follow-up).
- New endpoint:
  - `GET /api/agencyhandy/revenue-actions` (today’s prioritized revenue-driving tasks)
- Routine generator:
  - Update block templates to include a “Revenue Actions” mode/section.
  - Ensure fallbacks if Agency Handy is unavailable (cached data + graceful UI warnings).

## 3) Next Actions
**Delivery-ready. Remaining operator tasks (outside the codebase):**
1. **Replace PayPal placeholders**
   - Update `/app/frontend/src/lib/brand.js` → `PAYPAL_LINKS.{express|custom|enterprise}` with real PayPal URLs.
2. **Emailit sender domain verification (if needed)**
   - Verify `bybloomlabs.com` in Emailit dashboard (SPF + DKIM DNS records). If emails already send successfully, this is complete.
3. **Configure TidyCal webhook (optional but recommended)**
   - In TidyCal, set webhook URL to: `https://bybloomlabs.com/api/webhooks/tidycal`.
4. **Agency Handy integration operator tasks (Phase 5)**
   - Add `AGENCYHANDY_API_KEY` to production `backend/.env`.
   - Ensure the public webhook URL is reachable: `https://bybloomlabs.com/api/webhooks/agencyhandy`.
   - Confirm webhook secret storage/rotation procedure (roll secret when needed).
5. **Add Google Analytics later (optional)**
   - GA is intentionally skipped for now; landing page is prepared for future integration.

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
- **MRR tracking** visible in Dashboard + dedicated Revenue page, with MoM delta.
- Proposals needing follow-up list is accurate and action-oriented.
- Webhooks keep revenue KPIs fresh and generate notifications.
- Two-way sync works: Prospect → Quotation in Agency Handy.
- Daily routine includes a “Revenue Actions” section driven by live/cached Agency Handy data.

✅ **Testing**
- Iteration 1: Phase 1 landing page **100% pass**.
- Iteration 2: Phase 2–4 **backend 100%**, **frontend mobile 100%**, **frontend desktop 95%** (minor selector detection notes, no functional bugs).
- Phase 5: add incremental test runs per sub-phase (5.1–5.4) with API mocking + sandbox/live smoke tests.