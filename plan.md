# plan.md — Bloom Labs Platform (bybloomlabs.com)

## 1) Objectives
- Deliver a fast, branded landing page that converts visitors into booked discovery calls and package starts (PayPal placeholders).
- Build an internal founder dashboard for daily AI routine + content/outreach generation + pipeline + analytics.
- Add credibility builder modules (case studies, testimonials, authority metrics) with email automation.
- Add integration layer (TidyCal webhook + internal sync + cron routines) with graceful error handling.

## 2) Implementation Steps

### Phase 1 — Core POC (Isolation): AI + Email + Webhook viability
**Core workflow to prove:** OpenRouter generation + Emailit send + TidyCal webhook ingestion (these external dependencies can break the app).
1. Websearch/confirm best practices:
   - OpenRouter chat completions (headers, timeouts, retries, model fallback).
   - Emailit API send patterns + rate limiting.
   - TidyCal webhook payload format + signature verification (if supported).
2. Create minimal Python scripts:
   - `poc_openrouter.py`: generate a daily routine (JSON-shaped output).
   - `poc_emailit.py`: send a test email to `hello@bybloomlabs.com`.
   - `poc_tidycal_webhook.py`: run a tiny local endpoint + post a sample payload to confirm parsing.
3. Fix-until-working:
   - Add request timeouts, retry w/ backoff, and response validation.
   - Lock prompt templates and expected JSON schema for routine/content/outreach.

**User stories (POC):**
1. As a founder, I can run a script that reliably generates today’s routine from OpenRouter.
2. As a founder, I can run a script that sends a testimonial request email through Emailit.
3. As a founder, I can post a sample TidyCal booking payload and see it parsed into a normalized object.
4. As a developer, I can detect and log malformed AI outputs and recover with a fallback prompt.
5. As a developer, I can simulate transient API failures and see retries succeed.

---

### Phase 2 — V1 App Development (MVP): Landing + Admin core (no advanced integrations beyond proven POC)
**Deliverables:** React app + FastAPI API + MongoDB models + shadcn UI baseline.
1. Repo/app scaffolding:
   - FastAPI backend (`/api`) + Mongo connection.
   - React frontend (Vite) + shadcn/ui + theme tokens.
2. Landing page (`/`): implement 10 sections per spec
   - Header w/ logo, nav, CTA.
   - Hero + Problem + Solution/Guarantees.
   - Offer cards w/ PayPal placeholder links using `data-paypal-tier`.
   - Case studies, How-we-work timeline, Why Bloom grid.
   - TidyCal iframe embed.
   - FAQ accordion, Footer (email/phone/social `/bybloomlabs`, privacy placeholder), favicon + OG/meta.
3. Admin UI skeleton:
   - Routes: `/login`, `/admin/*` with sidebar layout.
   - Pages: dashboard, routine, outreach, content, pipeline, analytics, settings (MVP versions).
4. Backend MVP endpoints + models:
   - JWT auth (seed user: `founder@thesalvador.group` / `admin123`).
   - Models: Routine, Block, ChecklistItem, Prospect, ContentPiece, Settings.
   - AI endpoints (using proven POC patterns): generate routine, outreach openers, content post+script, discovery prompts.
5. Routine timer:
   - Frontend timer for current block + 5-min warning.
6. One round of end-to-end testing with `testing_agent_v3` (landing + login + routine generation + pipeline CRUD).

**User stories (V1):**
1. As a visitor, I can understand the offer in <10 seconds and book a discovery call via TidyCal embed.
2. As a visitor, I can compare packages and click “Get Started” without broken links (PayPal placeholders).
3. As the founder, I can log in and see today’s AI-generated routine and mark items complete.
4. As the founder, I can generate content/outreach prompts and copy them quickly.
5. As the founder, I can add prospects and see revenue progress toward the $90K goal.

---

### Phase 3 — More Features: Credibility builder + richer analytics
1. Case studies manager:
   - CRUD: metadata, featured image URL, public toggle, checklist.
2. Testimonials module:
   - CRUD + permission tracking.
   - Trigger Emailit testimonial request (manual button) using proven integration.
3. Authority dashboard:
   - Manual inputs (followers/visitors/etc.), derived “Credibility Score”, milestones.
4. Positioning consistency checker:
   - AI audit on copy snippets (site copy/case studies) for “AI-native” consistency.
5. Analytics upgrades:
   - Weekly comparisons + AI recommendations.
6. Testing round with `testing_agent_v3` (case study CRUD, testimonial email send, authority metrics updates).

**User stories (Phase 3):**
1. As the founder, I can publish/unpublish case studies and track completion checklists.
2. As the founder, I can request a testimonial by email and record consent.
3. As the founder, I can see authority metrics and milestones update as I add proof.
4. As the founder, I can run an AI positioning check and get actionable fixes.
5. As the founder, I can review weekly performance insights and recommended actions.

---

### Phase 4 — Integration Layer + Automation: Webhooks, sync, cron, hardening
1. TidyCal webhook listener:
   - `POST /api/webhooks/tidycal` creates/updates Prospect + dashboard notification.
2. Internal sync rules:
   - Case study added → updates authority metrics + drafts a social post (stored as ContentPiece draft).
   - Testimonial collected → updates authority metrics + drafts a social post.
3. Cron jobs (APScheduler):
   - Daily 5am routine generation.
   - Daily 9am testimonial due checks.
   - Hourly pipeline metric rollups.
4. Reliability:
   - Centralized error handling, API timeouts, retries, and “Regenerate/Resync” buttons.
5. Final end-to-end testing with `testing_agent_v3` (webhook → pipeline, cron-triggered routines, email automation).

**User stories (Phase 4):**
1. As the founder, when a discovery call is booked, it appears automatically in my pipeline.
2. As the founder, adding a case study auto-creates a draft social post and updates authority metrics.
3. As the founder, testimonials due trigger an automatic email (or show a clear pending state if failed).
4. As the founder, I can manually resync/regenerate when an integration fails.
5. As the founder, I can trust the dashboard because failures are visible and recoverable.

## 3) Next Actions
1. Run Phase 1 POC scripts for OpenRouter + Emailit + TidyCal webhook parsing; fix until stable.
2. Implement Phase 2 landing page first (logo/favicon, TidyCal embed, PayPal placeholder CTAs).
3. Build admin MVP pages + backend endpoints + Mongo models in one pass.
4. Execute `testing_agent_v3` and resolve issues before moving to Phase 3.

## 4) Success Criteria
- Landing page: all sections render, mobile responsive, TidyCal embed works, CTAs non-broken, correct branding + meta/OG.
- Admin: login works, routine/content/outreach generation returns valid outputs, pipeline CRUD works, timer works.
- Credibility: case studies/testimonials CRUD works; Emailit sends reliably; authority dashboard updates.
- Integrations: TidyCal webhook creates pipeline entries; cron jobs run; errors are recoverable and visible.
