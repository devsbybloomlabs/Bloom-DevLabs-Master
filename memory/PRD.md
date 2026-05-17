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

### ✅ Wave 3.5 — SEO Phase 2: Sitemap + Internal Linking + Bloom vs Agencies (Feb 17, 2026)
**Goal**: Push internal-link signal toward the new canonical /solutions/* URLs and add the explicit competitor positioning block from the SEO brief.

**What changed**
- `frontend/public/sitemap.xml` — replaced. Now lists all 12 new `/solutions/*` URLs at priority 0.85–0.95, plus /case-studies, /blog, /tour. Old `/gym-owners` etc. omitted so search engines follow canonicals to the SEO-friendly aliases.
- `frontend/src/components/sections/BloomVsAgencies.jsx` — NEW. 7-row side-by-side comparison table (Timeline / Cost / Communication / Process / Tech Stack / Scope Changes / Code Ownership), keyword-rich H2 "Why Bloom Labs is 40% cheaper — and 6× faster", 3 stat cards (~40% / 6× / 0 surprise fees), CTA. Mobile renders stacked cards.
- `frontend/src/pages/Landing.jsx` — `<BloomVsAgencies />` inserted between Pricing and CaseStudies so visitors see comparison right after the tier prices.
- `frontend/src/components/sections/WhoWeServe.jsx` — expanded from 2 cards (gym + clinics) to 4 cards (gym + coach + real estate live, clinics coming soon). Each LIVE card links to the canonical `/solutions/*` path with keyword-rich anchor ("See our gym management software" etc.).
- `frontend/src/components/sections/CaseStudies.jsx` — appended a cross-link strip at the bottom: "Explore by industry: gym management software / coach client portal / real estate lead management" pointing to canonical solution hubs.

**Verification (Feb 17, 2026)**
- Headless probe: WhoWeServe renders all 4 cards, CaseStudies cross-links point to `/solutions/*`, sitemap.xml returns 200 with all 3 niche slugs present.
- Visual: comparison table renders cleanly on 1920×1100 viewport (green checks vs red X, stat cards align).
- Lint clean across all touched sections.

### ✅ Wave 3 — SEO Foundation: Meta + Schema + Niche-page Optimization (Feb 17, 2026)
**Goal**: Lay the indexable-content foundation for ranking on the 20 target keywords (custom web app dev, 2-week delivery, gym/coach/real-estate vertical software). Phase 1 of the 4-phase SEO push.

**What changed**
- `frontend/src/components/SeoHead.jsx` — extended with `extraJsonLd` array prop so a page can inject Organization + WebSite + LocalBusiness + Product + FAQ schemas simultaneously without colliding with the breadcrumb block.
- `frontend/src/lib/seo.js` — NEW central SEO assets module. Single source of truth for:
  - `ORGANIZATION_SCHEMA` (founded 2026, LinkedIn/Instagram/TikTok/Facebook socials, US/PH/SG areas served)
  - `LOCAL_BUSINESS_PH` + `LOCAL_BUSINESS_SG` (country-level ProfessionalService schema)
  - `PRODUCT_SCHEMA` — Service with 3 tier Offers ($5,995 / $8,995 / $14,995) + AggregateRating 5.0 + 2 Reviews from real case studies
  - `FAQ_SCHEMA()` + `HOMEPAGE_FAQS` — expanded from 5 to 8 questions including the SEO-mandated ones (cost, why projects fail, industries served, support window, etc.)
  - `WEBSITE_SCHEMA` (enables Google sitelinks search box)
  - `PAGE_META` — title/description/keywords/canonical presets for 16 pages
  - `buildNicheSeo(niche, step)` — generates per-page Service schema + BreadcrumbList for any of the 12 niche-funnel pages
- `frontend/src/pages/Landing.jsx` — renders 6 JSON-LD blocks (Org, WebSite, LocalBusiness×2, Product, FAQ) plus optimized title/description.
- `frontend/src/components/sections/FAQ.jsx` — now pulls from `HOMEPAGE_FAQS` (single source). 8 visible questions matching FAQ JSON-LD.
- `frontend/src/pages/{gym,coach,realestate}/{Layout}.jsx` — accept `seo` prop, render `<SeoHead>` automatically. Backwards-compatible (prop optional).
- All 12 niche-funnel pages (gym, coach, realestate × hero/howitworks/process/results) — pass `seo={buildNicheSeo(...)}` to their layout. Each page now has keyword-optimized title, description, Service schema, BreadcrumbList.
- `frontend/src/App.js` — added 12 new SEO-friendly alias routes under `/solutions/*`:
  - `/solutions/gym-management-software` (+ /how-it-works, /process, /results)
  - `/solutions/coach-funnel` (+ /how-it-works, /process, /results)
  - `/solutions/real-estate-leads` (+ /how-it-works, /process, /results)
  - Old `/gym-owners`, `/coaches`, `/real-estate` routes still work. Canonical `<link>` in SeoHead points to the new `/solutions/*` paths so search engines consolidate signal there.
- H1 audit: every public + niche-funnel page has exactly ONE `<h1>` (verified).

**Verification (Feb 17, 2026)**
- Headless browser probe confirmed `/` exposes 6 distinct JSON-LD blocks: Organization, WebSite, ProfessionalService×2, Service, FAQPage.
- `/solutions/gym-management-software` returns title "Gym Management Software Built in 3 Weeks | Bloom Labs", canonical pointing to the alias, Service + BreadcrumbList schema.
- `/solutions/coach-funnel/results` returns title "Coach Portal ROI & Case Studies | Bloom Labs" with correct canonical.
- Lint clean across `seo.js`, `SeoHead.jsx`, `Landing.jsx`, FAQ, and all gym/coach/realestate page directories.

**Remaining SEO phases (proposed for future iterations)**
- Phase 2: Internal-linking pass + "Bloom vs Traditional Agencies" comparison block
- Phase 3: Blog post drafts (3 cornerstone articles, ~2k words each)
- Phase 4: Core Web Vitals + mobile audit + rank-tracking integration

### ✅ Wave 2.5 — PayPal credentials managed from Admin UI (Feb 2026)
**Goal**: Let the founder configure separate PayPal credentials per environment (Sandbox in Preview, Live in Production) directly from `/admin/integrations` — no `.env` edits, no redeploy.

**What changed**
- `backend/paypal_client.py` now resolves credentials via `_resolve_creds()` on every API call. DB (`integration_credentials.paypal`) is authoritative; `.env` is the fallback. OAuth token cache is invalidated automatically when creds rotate (fingerprint diff).
- `backend/integration_credentials.py` adds `get_credential_db_first()` for admin-managed providers.
- `backend/integrations_admin_routes.py` adds `paypal` to `ALLOWED_CRED_PROVIDERS`. Removed duplicate `/paypal/test` route — single canonical endpoint that calls `_resolve_creds()` then verifies OAuth.
- `frontend/src/components/admin/IntegrationCredentialsForm.jsx` adds a PayPal block at the top of the Credentials card with fields: `client_id`, `client_secret` (masked + eye toggle), `env` (sandbox/live select), `webhook_id`. Wired to Save + Test connection.

**Verification (Feb 17, 2026)**
- `GET /api/admin/integrations/credentials` returns paypal block (masked).
- `PUT /api/admin/integrations/credentials/paypal` round-trips sandbox creds, returns masked secret.
- Empty-string field clears the value. Confirmed via curl.
- UI screenshot confirms layout: PayPal card renders first in Credentials section with Empty/Stored badge.

**Operator note**
Preview and Production each have their own MongoDB. Saving credentials in the preview admin only affects preview. To update live, log in to the production admin (after deploying via the Emergent dashboard) and paste live keys there. Env vars (`PAYPAL_CLIENT_ID`, etc.) remain a hard fallback if the DB row is empty.

### ✅ Wave 1 — Urgent cleanups & bug fixes (Feb 2026)
**Goal**: Close out the long-tail of cleanups the founder flagged so the platform feels coherent before moving to Wave 2 (Project Mode Focus Shell). All 12 acceptance criteria PASS — backend pytest 7/7 (`test_hard_delete.py`) + 261/261 regression + Playwright sweep on companies/dashboard/invoices/onboarding/portal/drawer.

**Hard delete companies & contacts:**
- New `DELETE /api/admin/companies/{id}/hard` cascades to contacts + activity_log (returns `{ok, deleted:{company:1, contacts:N, activity:N}}`).
- New `DELETE /api/admin/contacts/{id}/hard` — refuses primary contact with 400, deletes non-primary with 200.
- Frontend: `CompaniesAdmin.jsx` adds hover-revealed Trash2 button per row (`data-testid=admin-company-delete-{id}`) with confirm dialog. `CompanyDetailDrawer.jsx` Contacts tab gets a Trash2 button on every NON-primary contact (`data-testid=drawer-contact-delete-{id}`).
- Fixed a runtime crash on `/admin/companies` — `Trash2` was used but not imported.

**Nifty removed from user-visible surfaces:**
- Sidebar link gone.
- `/admin/integrations/health` no longer returns a `nifty` provider (block + `get_nifty` dependency removed).
- Dashboard `IntegrationsHealthStrip` no longer renders a nifty pill.
- Backend Nifty client/routes/cron remain as dormant code (no UI entry point exists to trigger them) — kept to avoid risky breakage in the onboarding/project-brief/PM auto-task pipeline.

**Revenue & Clients page removed:**
- `/admin/revenue` route deleted, `RevenuePage` import removed from `App.js`.
- Sidebar reorganized into 6 groups in order: Daily / Pipeline / Delivery / Money / Authority / System.

**WYSIWYG markdown paste fix:**
- `RichTextEditor.jsx` now wires `tiptap-markdown` with `transformPastedText: true`.
- Paste from Claude (`## H2 / **bold** / - bullet`) now renders as real H2 / `<strong>` / `<ul>` instead of raw markdown text.

**Support email routing fix:**
- `contact_routes.py::_email_founder_notification` now routes primary `to=support@bybloomlabs.com` with founder cc'd.
- Adds standard headers ThriveDesk uses to attribute the inbound: `X-Bloom-Ticket`, `X-Bloom-Client-Email`, `X-Bloom-Client-Name`, `X-Bloom-Priority`, `X-Bloom-Support-UID`, `X-Bloom-Company`.
- Email body now carries Phone / Company / Support UID / Tier / Client-since rows pulled from the company + client DB records.

**Admin invoice PDF download fix:**
- `InvoicesAdmin.jsx` was reading `auth_token` from localStorage — the correct key is `bloom_admin_token`.
- New `_adminToken()` helper checks both keys for backwards compat. View action now uses authenticated blob fetch + opens via blob URL in a new tab.

**Milestone timeline placeholders:**
- Client `/portal` Milestones tab now merges 5 standard build phases (Discovery & Brief Sign-off / Design Language / Build — Core flows / QA & Polish / Launch) as "Up next" placeholder cards when they haven't been seeded yet.
- Visual: `opacity-50` + grayscale icon + `Up next` pill in the corner + `data-placeholder="true"` attribute.

**Tests** (`/app/backend/tests/test_hard_delete.py`): 7 pytests — hard-delete company cascade, primary-contact refusal, non-primary delete, auth guards × 2, 404 paths, integrations-health-omits-nifty. All green.



### ✅ Emergent bridge — one-click "Send to Emergent" on every task (Feb 2026)
**Goal**: The team's biggest friction was copying a task description into Emergent every time they wanted to start a build. Now it's one click — the prompt is auto-formatted with project context + the always-true house rules and the clipboard is loaded as Emergent opens.

**Frontend (`/app/frontend/src/lib/emergentBridge.js`):**
- Pure-function `buildEmergentPrompt({ task, project, milestoneTitle })` produces a clean markdown block:
  ```
  # {task title}
  **Project:** {name} · **Client:** {email} · **Milestone:** {milestone}
  **Priority:** {priority} · **Due:** {date}

### ✅ Phases A · B · C · D + Phase E Backend Scaffold (Feb 2026)
**Goal**: knock out the founder-reported brief/onboarding/milestone issues + ship the Project Mode Focus Shell + scaffold Google Drive Mirror Sync. All verifiable items PASS — backend 21/21 (`test_iteration_27.py` 11 new + `test_brief_per_phase.py` 3 + `test_hard_delete.py` 7) + Playwright 6/6 acceptance items + full regression 268/268 still green.

**Phase A — Brief flow bug fixes**
- A1: `OnboardingAdmin.jsx` Phase 3 detail view was reading the wrong field names (`company_name`, `industry`, `uvp` …). Fixed to render the actual stored keys (`project_name`, `company_story`, `goals`, `timeline_expectation`, `success_scenarios`, `phone`, `best_time_to_call`, `company_logo_url`).
- A2: Brief re-roll/re-send confusion. After a client comment, admin used to need 2 clicks (Save then Re-send). New `Save & re-send for review` button (`brief-save-and-resend-{key}`) chains PATCH summary → POST send-for-review in one round trip so the client sees the brief immediately flip back to `sent_for_review`. Renamed the legacy `Save summary` action to `Save draft` for clarity.

**Phase B — Milestone consolidation**
- Replaced 3 `Brief Review: {Phase}` milestone cards with a single `Discovery & Brief Sign-off` card whose description carries per-phase emoji chips (`⏳ Design Language · 👀 Functionality · 💬 Company Background · ✅ …`). Status only flips to `complete` when all 3 phases are approved, then `Design Language` (next standard milestone) auto-activates `in_progress`. Legacy per-phase rows are hard-archived idempotently on first sync. `_seed_milestones_from_brief` rewritten with per-title idempotency.
- New `project_brief_routes.py::_build_discovery_description`, `_archive_legacy_review_milestones`, and rewritten `_ensure_review_milestone`/`_sync_review_milestone`.

**Phase C — Onboarding wizard Step 3-3 redesign**
- Removed `Budget` field from `OnboardingWizard.jsx::Phase3Form` + backend `_process_phase3` + `generate_company_prompt`.
- New **Company logo upload** via Publit.io CDN (PNG/JPG/SVG/WebP up to 5MB) — new `publitio_client.py` (signed-request httpx client, SHA1 timestamp+nonce+secret) + `publitio_routes.py` (POST `/api/clients/me/uploads/logo` + `/api/admin/uploads/logo`) with magic-byte validation + 400/413/415 rejections. Wizard shows uploaded thumbnail with a Remove (X) button.
- New **Phone** input + structured **Best time to call** dropdown (Morning 9-12 / Afternoon 12-5 / Evening 5-8 / Anytime) + 10-option **Timezone** select (PT/MT/CT/ET/GMT/CET/IST/SGT/JST/AEST + Other).
- Admin Phase 3 view renders the logo thumbnail + phone + best time inline.

**Phase D — Project Mode Focus Shell**
- `/admin/project-mode/{projectId}` now mounts a dedicated focus shell (`admin-layout-focus`) — slim 48px topbar with `Back to Admin` + `FOCUS MODE` chip + sign-out. The 6-group admin sidebar is hidden. List URL `/admin/project-mode` keeps the regular layout.
- Removed the auto-redirect that used to bounce `/admin/project-mode` → first project (broke the exit-focus mental model).
- Added a `Kanban | Files` view toggle inside Project Mode. Files panel (`ProjectFilesPanel`) is scoped to the project's `client_email` and supports upload + download + delete.

**Phase E — Google Drive Mirror Sync (backend scaffold complete, OAuth pending)**
- `google_drive_routes.py` exposes `/admin/google-drive/{status,connect,disconnect,projects/{id}/toggle,projects/{id}/sync-now}` + public `/admin/google-drive/oauth/callback`.
- Per-project schema fields added: `sync_to_drive`, `drive_folder_id`, `drive_folder_link`, `last_sync_at`.
- `project_files_routes.upload_file` now best-effort mirrors via `mirror_file_bytes_to_drive` after the primary object-storage upload succeeds. Failures are logged and never block the upload.
- Frontend `IntegrationsAdmin.jsx::GoogleDriveCard` — Connect/Disconnect, per-project Sync checkbox + `Sync now` button + folder link. Shows `Setup required` notice with the 3 env var names while `GOOGLE_CLIENT_ID` is empty.
- **Pending user action**: create OAuth Web client in Google Cloud Console, paste `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, redirect `https://cred-manager-20.preview.emergentagent.com/api/admin/google-drive/oauth/callback` (preview) + `https://bybloomlabs.com/api/admin/google-drive/oauth/callback` (prod) into `backend/.env` and restart backend. Then click `Connect Google Drive` in Admin → Integrations.

**Tests**: `/app/backend/tests/test_iteration_27.py` (11 tests — Publit.io upload rejections + Drive 503/400 guards + integrations health regression). `/app/backend/tests/test_brief_per_phase.py` rewritten to assert single Discovery card + emoji chips.

**Decommissioned**: BreezeDocs MSA auto-injection parked in backlog until BreezeDocs custom-field API is confirmed by their support.



  {task description (AI-authored Emergent-ready prompt)}
  ---
  **House rules:** /api prefix · MONGO_URL/DB_NAME from .env · REACT_APP_BACKEND_URL · data-testid · shadcn primitives
  ```
- `sendToEmergent(...)` copies to clipboard + opens `https://app.emergent.sh` in a new tab.

**Two click surfaces (`ProjectModeAdmin.jsx`):**
- **Quick rocket icon** appears on TaskCard hover (testid `pm-task-emergent-quick-{id}`) — one click, zero dialog open.
- **Full "Send to Emergent" button** inside TaskDetailDialog (testid `pm-task-emergent`) — violet styling, sits next to Save changes. Uses the latest edits in the dialog so the prompt reflects any title/description tweaks not yet saved.

**Backend touch:** none — admin milestone-list endpoint already exists (`GET /admin/milestones`) and is now fetched once per page-load to enrich the prompt with milestone titles.


### ✅ Phases F · G · H · I · J — Subscriptions + Contract Automation (Feb 2026)
**Verified — testing agent (iteration_28.json) + 19/19 backend pytest (test_iteration_28*.py) + full regression 297/298 + frontend Playwright smoke + manual UI screenshot.**

**Phase F — Google Drive Mirror Sync OAuth completed**
- Pasted founder's `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` into `backend/.env`. `/api/admin/google-drive/status` reports `configured:true`; `/connect` returns the real Google OAuth start URL. Founder still needs to click **Connect Google Drive** in Admin → Integrations to authorize once.

**Phase G — Invoice address fix**
- `invoice_service.BUSINESS_DEFAULTS.address_lines` → `["2153 Chino Roces Ave.", "Brgy. Pio del Pilar, Makati City", "1229 Philippines"]`. Albuquerque line removed. Verified via WeasyPrint PDF + pypdf text extraction in pytest.

**Phase H — Package → 1-yr free support subscription auto-provision + paid upgrade**
- New `support_subscription_routes.py`. Catalog: 6 PayPal-backed plans (Std/Premium/VIP × Annual/Quarterly) with real `plan_id`s starting with `P-`. Pricing: Annual $29/$49/$89·mo (= $348/$588/$1,068/yr) · Quarterly $39/$59/$99·mo (= $117/$177/$297/qtr).
- Mapping: `express → standard`, `custom → premium`, `enterprise → vip`. On PayPal package capture, `provision_bundled_support_subscription` inserts a `support_subscriptions` row with `source=bundled`, `status=active_free`, `expires_at = now + 365d`. Idempotent — never duplicates an existing active row.
- `/api/clients/me/support-subscription` GET returns the current entitlement + `available_plans` (server-side filtered to upgrade-only) + exclusions note.
- `/subscribe` POST guards `new_tier > current_tier` (returns 400 on equal-or-lower) + reuses a pending PayPal approval URL if one exists. Webhook hook in `paypal_webhooks.BILLING.SUBSCRIPTION.ACTIVATED` calls `activate_paid_support_subscription` which supersedes the bundled free row + inserts `active_paid` + flips `company.support_tier`.
- Daily 3am UTC `support_subscription_expiry_cron`: flips overdue `active_free` rows to `expired` and (if no paid replacement) flips `company.support_tier→none`.
- Client portal **Subscriptions tab** rewritten — `SupportSubscriptionSection` shows the current tier card + Annual/Quarterly upgrade catalog with per-plan testids (`portal-support-plan-{key}`, `portal-support-subscribe-{key}`). Exclusions note rendered prominently.

**Phase I — Tier-aware support email routing**
- `contact_routes._email_founder_notification` now routes primary `to:` to `SUPPORT_VIP_EMAIL` (= `vipsupport@bybloomlabs.com`) when `company.support_tier=='vip'`, else `SUPPORT_EMAIL`. Adds `X-Bloom-Routed-Tier` header. Founder stays cc'd in all cases.

**Phase L — Prototype upgrade self-serve + post-purchase email drip + dual-path visualization (Feb 2026)**
- New `gym_upgrade_routes.py` (mounted at `/api/clients/orders`): server-validated prototype → full-build upgrade with $1,000 credit applied. Eligibility rules: tier=`gym_prototype` · status paid · <14 days since purchase · email matches authenticated client · no prior upgrade row. Endpoint `POST /clients/orders/{id}/upgrade` mints a fresh PayPal order at $7,995 with `metadata.upgrade_from` linking back to the prototype. `GET /clients/orders/upgrade-eligibility` returns one row per prototype with verdict + days remaining.
- New `gym_prototype_drip.py` — V3-spec 5-step nurture (Day 0/3/5/10/11) stored in `gym_prototype_drips` collection. Step 0 fires immediately on prototype capture (idempotent), subsequent steps gated by `next_send_at`. Hourly APScheduler tick (`prototype_drip_cron`, minute 20) walks due rows + sends via Emailit. Critically, the tick short-circuits the sequence the moment the buyer's upgrade order completes — no "you should upgrade!" emails after they already did.
- New `UpgradePrototypeBanner.jsx` in the client portal: appears below each eligible prototype order with a one-click "Upgrade" CTA that opens a confirm-dialog showing the price math ($8,995 - $1,000 = $7,995) then redirects to PayPal. Portal fetches `upgrade-eligibility` on load and renders the banner only for paid prototypes still inside the 14-day window.
- New `DualPathSection` on `/gym-owners/how-it-works` — side-by-side Path A (Prototype, $2,995, 24h) vs Path B (Full Build, $8,995, 3 weeks) with flow chips + inclusions + upgrade-bridge callout (~90% upgrade rate, $1K credit, projection disclaimer).
- Tests: 6 new in `tests/test_gym_upgrade.py` (eligibility — recent paid, expired window, unpaid, wrong email, already-upgraded, non-prototype tier) + 5 new in `tests/test_prototype_drip.py` (spec compliance, idempotency, immediate Day-0 send, skip-on-upgrade, day-3 gating). All 34 niche-related tests green.

**Phase K — Gym-Owners niche site + PayPal niche tiers + Who-We-Serve mega menu (Feb 2026)**
- New public funnel at `/gym-owners` · `/how-it-works` · `/process` · `/results` — sticky 4-page nav, breadcrumb, mobile drawer, exit-intent modal mounted in `GymLayout.jsx`.
- **(V3 update, Feb 2026)** — 4 niche package tiers now: `gym_prototype` ($2,995, 24-hour test-drive, **no $500 upfront discount**, single-payment via `full_upfront_discount: 0` override) / `gym_express` ($5,995 — still in backend for legacy) / `gym_custom` ($8,995) / `gym_enterprise` ($14,995). Each carries `niche="gym_owners"`, `inclusions[]`, `timeline`, `support_tier`.
- `compute_charge()` now respects per-tier `full_upfront_discount` override so the prototype doesn't accidentally get a 17%-off upfront credit.
- `support_subscription_routes.PACKAGE_TO_SUPPORT_TIER` extended (`gym_prototype→standard`, `gym_express→standard`, `gym_custom→premium`, `gym_enterprise→vip`).
- New `GymCheckoutDialog.jsx` — for `gym_prototype` the dialog **hides the payment-plan toggle** and forces full upfront (the prototype is a low-friction entry, not an installment product).
- **(V3 update)** Pricing page restructured to **3 tiers** (Prototype / Full Build / Enterprise) per the dual-path V3 spec. Full Build tier shows "MOST POPULAR" badge.
- **(V3 new)** `PreQualSection` — 3-checkbox qualifier ("Losing $1K+/mo, ready by May, $2,995-$8,995 budget") so tire-kickers self-select out before the offer.
- **(V3 new)** `ReferralSection` — "Refer a gym, get $1,000 credit" with split-path math (prototype → basically free, full build → $7,995 after referral).
- **(V3 new)** Year-1 / Year-2+ callout block below pricing — Year 1 = build + training + 60-day support; Year 2+ = maintenance retainer + dashboard-based feature upgrades.
- **(V3 new)** Hero rewritten to dual-path positioning: "Stop losing $500-$2,000/month to member churn · Choose your path: test-drive in 1 day or full system in 3 weeks", with two visible mini-cards (Path A Prototype $2,995, Path B Full Build $8,995) + "$1,000 upgrade-credit if you upgrade within 14 days" copy. Primary CTA = "See the prototype first" (emerald, anchors to #offer), secondary = "Build full system — book call" (orange, TidyCal).
- **(V3 new)** FAQ rewritten — 8 entries, 5 prototype-focused ("Why is the prototype so cheap?", "Can I upgrade later?", "What if the prototype doesn't work?", "What if I don't upgrade?", "What happens after Year 1?") + 3 carried over.
- **(V3 new)** Final CTA → May 31 deadline urgency.
- New `<WhoWeServe/>` homepage section between Solution and Pricing surfaces the niche to anonymous visitors.
- `Header.jsx` mega menu gains "Who We Serve" group with 5 entries; mobile drawer adds "For Gym Owners".
- Tests: `tests/test_gym_tiers.py` now 4 tests including a `test_gym_prototype_skips_full_upfront_discount` regression guard; testing-agent-authored `tests/test_iteration_29.py` (9) still green.

**Phase I.2 — Coaches & Consultants funnel ecosystem (Feb 2026)**
- New 4-page funnel mirroring the gym structure with coach-specific copy and a deep-teal + amber/coral accent palette.
  - `/coaches` (`CoachHeroPage.jsx`) — Hero "Your coaching skills are incredible. Your website isn't.", dual-path Starter $2,995 vs Premium $8,995 cards, pre-qual gate, problem (lost-bookings $1K–$3K/mo), solution (website / one-click booking / client dashboard), 3-tier offer with PayPal dialog, simple ROI calc (booking-conversion based), social proof, 5-item FAQ, final CTA.
  - `/coaches/how-it-works` (`CoachHowItWorksPage.jsx`) — three feature blocks (website / booking / dashboard) with mock visuals, integration grid (Stripe/PayPal/Email/Google Calendar/iCal/Zoom), 8-step client journey, bank-level security, "your job / our job" split.
  - `/coaches/process` (`CoachProcessPage.jsx`) — 24-hour 4-phase timeline (Discovery morning → Build afternoon → Review evening → Go-live next morning), 2h-15-min commitment table, support tiers, 30-day money-back guarantee, what's-included checklist, Starter→Premium upgrade-path card.
  - `/coaches/results` (`CoachResultsPage.jsx`) — 3 coach archetypes (Solopreneur / Multi-offering / Consultant) before-vs-after, 4 big numbers, 8-step domino effect, 6 coach-type results cards, detailed ROI calc, 5-step "what happens next", 5-item FAQ, final CTA.
- Shared `CoachLayout.jsx` (sticky header with NAV + Book-Discovery-Call CTA, breadcrumb, footer, ExitIntentModal reused from gym layout). Pure `useEffect`-based scroll-to-top (replaced the render-time `setTimeout` anti-pattern flagged by testing agent).
- `CoachCheckoutDialog.jsx` — same shape as `GymCheckoutDialog` but with coach tier metadata; Starter tier honors `skipSplit=true` (no 50/50 toggle, full upfront only — like the gym prototype).
- `CoachROICalculator.jsx` — booking-conversion focused (Simple + Detailed), assumes ~25-percentage-point lift from 40% → 65% lead-to-booking rate.
- `Header.jsx` mega menu "Who We Serve" expanded to **3 columns** (Industries + Coach playbook + Gym-owner playbook); featured panel now promotes the coach funnel. MegaPanel grid now adapts (`sm:grid-cols-3` when ≥3 columns). Mobile drawer adds "For Coaches & Consultants".
- `App.js` — 4 new routes: `/coaches`, `/coaches/how-it-works`, `/coaches/process`, `/coaches/results`.
- Backend tiers (`coach_starter` $2,995 / `coach_premium` $8,995 / `coach_enterprise` $14,995) and generic self-serve upgrade with $1K credit were shipped earlier in the same session and validated in iteration 29.
- Tests: iteration 30 — frontend testing agent verified 12/12 acceptance items (100%) including all sections, all 3 tier dialogs, ROI calculators, FAQ accordions, mega-menu, mobile drawer. Zero console errors.

**Phase I.3 — Real Estate Agents funnel + Team-invite SaaS flow + Site-wide cleanups (Feb 2026, iter 31)**
- **NEW Real Estate Agents funnel** at `/real-estate*` mirroring the gym/coach structure, navy + amber palette:
  - `/real-estate` Hero: dual-path Starter $2,995 vs Premium $8,995, pre-qual gate, problem section, 3-tier offer w/ PayPal dialog, simple ROI calc (commission-based), social proof, 5-item FAQ, final CTA.
  - `/real-estate/how-it-works`: 4 layer blocks (MLS integration → Lead capture → Automated follow-up → Lead management), MLS / CRM / payment integrations grid, 7-step lead journey, compliance section.
  - `/real-estate/process`: 4-phase 24-hour timeline (Fri 3pm call → Fri-Sat build → Sat-Sun review → Mon 9am launch), ~80-min commitment table, support tiers, checklist, upgrade path.
  - `/real-estate/results`: 3 case-study archetypes (solo agent / team lead / new agent) with before/after, 4 big numbers, post-launch roadmap, detailed ROI calc (4 inputs: leads, lead→showing %, showing→deal %, commission), 5-item FAQ.
  - Shared `RELayout.jsx` (sticky header, breadcrumb, footer) + niche-aware `ExitIntentModal` variant `realestate`.
- Backend tier configs: `realestate_starter` $2,995, `realestate_premium` $8,995, `realestate_enterprise` $14,995 in `paypal_routes.py`. PayPal order creation tested end-to-end (24/24 backend tests green).
- `UPGRADE_PATHS` in `gym_upgrade_routes.py` extended: `realestate_starter → realestate_premium` honors the $1K upgrade credit.
- **Niche-aware Exit Intent Modal**: extracted to `/pages/shared/ExitIntentModal.jsx`. Takes a `variant` prop ("gym" | "coach" | "realestate"), each with its own copy + gradient. Fixed the bug where coach pages showed gym copy. Old `/pages/gym/components/ExitIntentModal.jsx` deleted.
- **Pre-PayPal warm-lead capture (site-wide)**: new `/api/leads/warm` endpoint stores name/email/niche/tier in `warm_leads` Mongo collection. Idempotent (dedupes on niche+tier+email, increments visits). Fired onBlur from CoachCheckoutDialog, GymCheckoutDialog, and RECheckoutDialog — captures the lead BEFORE they complete PayPal so abandoners are recoverable.
- **Post-purchase team-invite SaaS flow** (iter 31's biggest piece):
  - Backend: `company_setup_routes.py` with three routers — `/company-setup/*` (init, profile, invites, complete, status), `/companies/me` (current user's company + role + members), `/company-invites/{token}` (validate + accept).
  - Data model: `companies` collection extended with `owner_client_email`, `setup_status`, `phone`, `address`. New `company_members` collection (id, company_id, client_email, role: "admin"|"viewer", is_owner, status). New `company_invites` collection (token, email, role, expires_at, status).
  - Roles: `owner` (always admin, cannot be demoted), `admin` (full purchaser-level), `viewer` (read-only). Any admin can promote viewers to admin.
  - Invite emails sent via Emailit with a `/join/{token}` magic link, expire in 14 days.
  - Frontend:
    - `/portal/welcome` (`CompanyWelcomeWizard.jsx`) — 3-step wizard (Company profile → Team invites → Done). Required after purchase but skippable. Auto-creates the company on `init`.
    - `/join/:token` (`CompanyInviteAccept.jsx`) — public branded landing "Join {Company} on Bloom DevLabs" → set name + password → membership created in view-only mode.
    - `CompanySetupBanner.jsx` — portal-home banner shown when `setup_status != complete` (fallback B — user can resume the wizard anytime).
    - `ClientLogin.jsx` updated to honor `?next=` query string so post-checkout flow redirects through login → wizard.
    - `CheckoutSuccess.jsx` updated CTA to "Sign in & set up team" pointing to `/portal/welcome`.
- **Mega menu: click-to-reveal niches**: refactored Who-We-Serve panel into `IndustriesMegaPanel`. Default state hides playbooks and shows a "Pick an industry" placeholder. Clicking `mega-industry-gym-owners` / `mega-industry-coaches` / `mega-industry-real-estate` reveals the corresponding `mega-playbook-*` column with 3 links + a "Visit overview" CTA. Mobile drawer gains "For Real Estate Agents".
- **30-day money-back guarantee** REMOVED site-wide (gym + coach + realestate + pricing + checkout dialogs). Replaced with "approve each phase before payment moves forward" / "30-day support window" / "risk-managed" language.
- Tests: iteration 31 — backend **24/24 (100%) PASS** (`/app/backend/tests/test_iteration_31.py`). Frontend ~95% — all RE pages render, mega-menu click-to-reveal works, /portal/welcome auth gate works, /join/{token} validates. Critical-review fixes applied: owner role lock tightened (cannot change owner's role at all), companies/me response no longer leaks `_id` field.

**Phase I.4 — Password UX + reactivation crons + Manage-Team panel + Warm-Leads admin (Feb 2026, iter 32-33)**
- **Reusable `PasswordInput` component** (`/app/frontend/src/components/ui/password-input.jsx`) with built-in eye/eye-off toggle. Retrofitted across every password field site-wide: client login + register, admin login, set-password (×2 fields), company-invite accept, Nifty manual token, Google Drive client secret. Each toggle button gets `data-testid="{field-testid}-toggle"`.
- **APScheduler reactivation crons** (`reactivation_crons.py`):
  - `company_setup_reminder_tick` (daily 09:00 UTC) — finds companies whose owner created the company >24h ago and `setup_status != complete`, sends an Emailit nudge, sets `setup_reminder_sent_at` watermark for idempotency.
  - `warm_lead_reengagement_tick` (daily 10:00 UTC) — finds warm-leads captured 24–72h ago with `status=captured`, skips ones that converted (matching paypal_transaction by email+tier), sends "did you change your mind?" email with niche-aware CTA, bumps status to `nurtured` + `reengagement_sent_at` watermark.
- **`useCompanyContext()` hook** (`/app/frontend/src/lib/useCompanyContext.js`) — pulls `/companies/me`, exposes `{company, role, members, isOwner, canWrite, refresh}`. `canWrite = role === "admin"`. Used by ManageTeamPanel today; ready for write-action gating site-wide.
- **Manage Team panel** (`ManageTeamPanel.jsx`) embedded in portal's Profile tab. Admins see: members list with role badges (owner/admin/viewer), promote/demote buttons (`team-promote-{id}` / `team-demote-{id}`), invite form (`team-invite-email-N`, `team-invite-send`). Viewers see read-only list with a "ask admin to promote you" hint.
- **Warm Leads admin dashboard** at `/admin/warm-leads` (`WarmLeadsAdmin.jsx`) — admin-only view of every captured warm lead. Stats grid (total, per-niche counts, conversion %), search box (`warm-leads-search`), niche filter chips (`warm-leads-filter-{niche}`), refresh button, expandable row per lead with status badge + tier + niche-specific context (gym name / coaching niche / market).
- **Security tightening**: `GET /api/leads/warm` (previously unauthenticated) was REMOVED. New admin endpoint `GET /api/admin/leads/warm` is protected by `Depends(get_current_user)`. POST `/api/leads/warm` remains public for capture.
- **clientApi factory bug fix** (iter 33): `clientApi` in `/lib/clientAuth.js` is a FACTORY `(token) => axios`. Iter 31's code called `clientApi.post(...)` directly which raised TypeError silently. Fixed across 4 components: useCompanyContext, ManageTeamPanel, CompanyWelcomeWizard, CompanySetupBanner. All now use `clientApi(token).post(...)`. Also added `data-testid` to empty/loading early returns + replaced silent `catch {}` with `console.error` for discoverability.
- Tests: iter 32 round 1 — backend 35/35 (100%) but frontend ~70% due to the factory bug. Iter 33 retest — **backend 35/35 + frontend 100%, zero open issues, zero retests**.




**Phase J — Brief approval → contract & invoice automation (admin-review gate)**
- On 3rd-phase approval, `_finalize_brief_approval` flips `brief.awaiting_contract_dispatch=true`. Admin sees an amber **Contract Dispatch Banner** in `ProjectBriefDialog` with Preview + Send buttons.
- New `brief_contract_routes.py`:
  - `_build_contract_pdf` (WeasyPrint) compiles cover + 3 approved phase summaries + onboarding kickoff (project name / story / goals / scenarios / phone / best time / logo) + appendix cover for the original PayPal package invoice.
  - **(Feb 2026 update)** — the rendered paid-invoice PDF (via `invoice_service.render_invoice_pdf`) is now merged into the final contract PDF via `pypdf` so the actual branded invoice appears as the closing pages of the MSA bundle. New `tests/test_contract_invoice_merge.py` proves the page count increases when a paid invoice exists.
  - `POST /api/admin/briefs/{id}/dispatch-contract` — idempotent. Side effects: saves PDF to `project_files` (category=contract), creates BreezeDocs document from the configurable template (default `test contract template.docx`), sends signing email, writes `breezedocs_proposals` row tagged with `linked_brief_id` + `linked_milestone_title`, creates `Contract & Invoice Sent` milestone (status=in_progress), emails client.
  - `GET /api/admin/briefs/{id}/contract-preview` — returns the compiled PDF inline.
- BreezeDocs sync (`sync_proposal` + `breezedocs_sync_cron`) now flips the `Contract & Invoice Sent` milestone to `complete` when the proposal transitions to `signed` or `completed`.
- Defensive fix on `_resolve_template_id` — BreezeDocs `/templates` rows can be dict OR bare string; both shapes handled.
- **(Feb 2026 update)** — `IntegrationsAdmin.GoogleDriveCard.load()` no longer silently swallows fetch errors; surfaces a toast so the founder sees a real reason if the status endpoint fails instead of perceiving "credentials disappeared".

**Decommissioned**
- BreezeDocs custom-field MSA stays parked. We sidestepped the custom-field requirement entirely by self-generating the PDF and using BreezeDocs purely for the signing workflow (Option J-a).

**Backlog (P2)**
- BreezeDocs custom-field templating (switch behind `USE_BREEZEDOCS_NATIVE_TEMPLATE` flag once their support confirms).
- The two pre-existing console warnings (Radix DialogTitle, TipTap duplicate-link).
- `server.py` router refactor.
- "Restore archived contact" undo.
- Flaky `test_project_files_and_triage.py::test_upload_admin_download_client_download` in full-suite parallel (passes standalone — likely a fixture race).


**Tests** (`emergentBridge.test.js`): 7 Jest unit tests covering title heading, context block, description pass-through, always-true house rules, missing-description fallback, null-task safety, no-context graceful degradation. **All green.**

### ✅ Phase D part 3 — Per-phase AI Project Brief rewrite (Feb 2026)
**Goal**: Replace the old "approve whole brief at once" pattern with a per-phase review-and-comment cycle so the client has agency over each section and the team has a tight feedback loop.

**Per-phase state machine:**
   `draft → sent_for_review → in_revision (client comment) → sent_for_review → approved`

**Backend (`project_brief_routes.py` — full rewrite, 770 lines):**
- New phase schema: `{summary, status, sent_at, approved_at, latest_comment, admin_reply_note, revisions[], updated_at}`. Every PATCH appends a revision snapshot — full audit trail.
- New endpoints (all admin-auth or client-auth):
  - `PATCH /admin/briefs/{id}/phase/{phase_key}` — save summary + optional admin reply chip. **Approved phases return 409** (locked).
  - `POST /admin/briefs/{id}/phase/{phase_key}/send-for-review` — flip status, send per-phase Emailit email with rendered HTML, Slack notify.
  - `POST /clients/me/briefs/{id}/phase/{phase_key}/comment` — client leaves a comment, status → `in_revision`, founder Slack + email.
  - `POST /clients/me/briefs/{id}/phase/{phase_key}/approve` — requires `no_comments_confirmed=true` (mirrors the legal checkbox), 400 otherwise. Idempotent.
  - `POST /clients/me/briefs/{id}/approve` — **final gate** — refuses 409 unless all 3 phases approved.
- HTML sanitisation via `bleach` (new dep) on every write — allow-list: p/strong/em/h2/h3/ul/li/a/blockquote/code/pre.
- Brief-level status auto-derives from rolled-up phase statuses.

**Live milestone sync** (3 new `Brief Review: {Phase}` milestones that live alongside the standard 5 build milestones):
- `sent_for_review` → "Waiting for your review."
- `in_revision` → "Our team is reviewing your comments…"
- `approved` → status=complete + completion_date stamped.

**Full-approval auto-pipeline:**
- 5 standard build milestones (Discovery / Design / Build / QA / Launch) seed.
- **Project Mode workspace auto-creates** with AI-generated **Emergent-ready dev tasks** — Claude (OpenRouter) reads the 3 approved phase summaries and emits 8-12 specific tasks like `"Build a /src/pages/Dashboard.jsx React component that fetches /api/x and renders y with shadcn Card components."` Each task is linked to a build milestone via title-match; first task starts `in_progress`. Falls back to a 5-task template if LLM fails.
- **PDF snapshot** of the approved brief renders via WeasyPrint and uploads to Project Files (category=`brief`). Permanent contract artifact.
- Founder Slack + email digest fires.

**Frontend (`RichTextEditor.jsx` + `ProjectBriefDialog.jsx` + `ProjectBriefView.jsx`):**
- **TipTap WYSIWYG admin editor** with toolbar (bold/italic/strike/H2/H3/lists/quote/link/undo/redo). Configured to avoid the duplicate-link extension warning.
- Admin dialog: 3 phase tabs with live status pills, copy-prompt, save, send, **lock state on approved**, expandable revision history per phase, latest-comment banner with re-roll prompt, admin reply chip input.
- Client portal Brief tab: **animated progress bar** (Phase 1 ✅ · Phase 2 🔄 · Phase 3 ⏳), per-phase card with:
  - Read-only TipTap render of the approved summary
  - Comment textarea + "Your team typically responds within 24h" SLA hint
  - **Legal checkbox** with EXACT user-specified wording ("I have reviewed Phase X's summary…")
  - **Approve Phase X** button gated by the checkbox
  - Revision history viewer (previous versions with the triggering comment shown inline)
- **Final approve button** locked until all 3 phases approved; click → shadcn AlertDialog with the scope-creep warning.

**Per-phase email** (`send_brief_phase_for_review`): branded HTML email containing the rendered Claude summary + admin's optional note (as a highlighted block) + a "Review Phase X" deep-link button to `/portal?tab=brief&phase=phaseN`.

**Tests** (`test_brief_per_phase.py`): 3 pytests covering the full 18-step state machine, milestone live-sync across 3 transitions, auth guards. **All green. 264/264 backend regression** (incl. legacy brief tests updated to match the new API).

### ✅ Improvements bundle (Feb 2026)
Three high-leverage polish items shipped together:

**(A) Portal Support tab — Ticket pill (10-line trust signal)**
- `BL-YYYY-####` ref now renders as a clickable monospace pill (testid `contact-history-ticket-{id}`) beside every Previous-message row.
- Click-to-copy via `navigator.clipboard.writeText` with a toast confirm.
- Hidden for legacy records without a `ticket_ref`, so no broken pills.
- Also cleaned the obsolete `"Slack + ThriveDesk"` subtitle → `"Slack + email"`.

**(B) Contact attachment retrofit → Emergent Object Storage**
- Upload path in `contact_routes.py` now writes to object storage at `bybloomlabs/contact-attachments/{client_email}/{uuid}{ext}`. Stores `attachment.storage_path` in DB.
- Graceful local-disk fallback if object storage is unavailable (storage init failed, EMERGENT_LLM_KEY missing, etc.). Old `stored_path` field still set in that case so downloads keep working.
- Download endpoint checks `storage_path` first, falls back to disk for **legacy records** (zero migration needed).
- Public response always strips `storage_path` + `stored_path` so clients never see internal paths.

**(C) "Today's Coaching" admin dashboard widget**
- Backend `GET /api/pipeline/coaching/today?limit=3` (admin-auth) ranks active prospects (new/contacted/qualified/proposal — won/lost excluded) by `stage_weight × age_boost × log(1 + deal_value)`. Aging caps at 14 days (so cold leads bubble up). Each card carries a fallback `next_action` per stage so the UI never shows "—". Returns top N (max 10).
- Frontend `TodaysCoachingCard.jsx` mounts on `/admin/dashboard` left column. 3 cards with avatar initials, stage badge, days-stale chip (color-coded green/amber/rose), deal-value pill, blue next-action chip, refresh button.
- Clicking a card navigates to `/admin/pipeline?focus={prospect_id}` → `PipelinePage` auto-opens the matching prospect drawer + cleans the query param. Founder is one click away from the AI Suggest button + activity composer for that lead.
- A11y polish: ProspectDrawer now has a sr-only `SheetDescription` to silence the Radix `aria-describedby` warning.

**Tests** (`test_coaching_and_attachments.py`): 6 pytests covering ranking determinism, limit capping, won/lost exclusion, auth guard, object-storage path correctness, no-internal-path leak, cross-client 404, text-only contact still works. **All green. 262/262 full backend regression.**

### ✅ Phase H — Public Mega Menu redesign (Feb 2026)
**Goal**: Replace the cramped 8-link top nav with a modern 3-category mega menu so the public site can carry product/resource/work depth without sacrificing scannability.

**Frontend (`Header.jsx`):**
- 3 hover triggers (Platform · Resources · Work) → each opens a full-width panel with rich iconified cards + a featured CTA on the right (Try the platform / Watch first / Ready to brief us).
- Smart hover behaviour: 140ms close delay so users don't lose the panel when moving the cursor; ChevronDown rotates 180° on active.
- Mobile drawer preserved with a flat link list + Client Login + Book CTA.
- Test IDs: `mega-trigger-{platform|resources|work}`, `mega-panel-{id}`, `mega-link-{id}`, `mega-featured-{tour|demo|book}`.

### ✅ Phase I — Auto ticket numbering + Support Triage admin (Feb 2026)
**Goal**: Every portal contact already gets an auto-minted `BL-YYYY-####` ticket ref — this phase exposes a fast lookup tool so the team can triage by ref, email, or keyword.

**Backend changes:**
- Fixed a latent 500 in `/admin/portal-contacts` and `/admin/portal-contacts/{id}/resolve` — promoted auth from incorrect in-handler `get_current_user(request)` call to router-level `Depends`.
- Existing search supports filtering by status + free-text `q` across ticket_ref / email / name / subject / body.

**Frontend (`SupportTriageAdmin.jsx`):**
- New page at `/admin/support-triage` (Sales group, LifeBuoy icon).
- Search input with 350ms debounce, status filter dropdown, 3 tally cards (Open / In progress / Resolved).
- Expandable ticket rows with inline Resolve button + body toggle.
- Test IDs: `support-triage-admin`, `support-triage-search`, `support-triage-status-filter`, `support-triage-tallies`, `support-triage-results`, `ticket-row-{id}`, `ticket-row-{id}-toggle`, `ticket-row-{id}-resolve`.

### ✅ Project Files (Feb 2026)
**Goal**: Replace local-disk uploads with Emergent Object Storage and ship a clean "Files" tab for clients to download deliverables (PDFs, mockups, ZIP archives).

**Backend:**
- New `object_storage.py` helper: init-once handshake, auto-retry on 403/429, `put_object`/`get_object`/`guess_content_type`. Started at FastAPI startup; degrades to 503 on uploads if `EMERGENT_LLM_KEY` is missing.
- New `project_files_routes.py`:
  - Collection `project_files`: `{id, company_id?, client_email, storage_path, original_filename, content_type, size_bytes, category (deliverable|brief|mockup|invoice|other), notes, uploaded_by, uploaded_at, is_deleted}`.
  - Admin: `GET/POST /admin/project-files`, `GET /admin/project-files/{id}/download`, `DELETE /admin/project-files/{id}` (soft-delete only — storage has no delete API).
  - Client: `GET /clients/me/project-files` + `GET /clients/me/project-files/{id}/download` — scoped to the caller's email OR any company they're a contact of.
  - All responses strip `storage_path` so clients never see internal paths.
  - 100MB ceiling, content-type enforced, empty file rejected.

**Frontend:**
- `/admin/project-files` (`ProjectFilesAdmin.jsx`): drop-file upload form + filter input + soft-delete + Download. Substring filter is client-side for instant feedback.
- `/portal` "Files" tab (`ProjectFilesView.jsx`): conditional tab that only appears when client has ≥1 file. Category-colored badges, fmtBytes, blob-stream download via authenticated endpoint.

**Tests** (`test_project_files_and_triage.py`): 5 pytests (upload + admin download + client download + cross-client 403 + soft-delete + auth guards + ticket-ref format + triage search by 3 axes + status filter + resolve flow). **All green. 256/256 backend regression.**

### ✅ Phase G — Breakcold-style Pipeline Kanban + AI suggest (Feb 2026)
**Goal**: Replace the table-style `/admin/pipeline` with a rich Kanban + activity stream + AI-powered next-action coach. Keeps the existing `prospects` collection — adds a kanban view, a `pipeline_activity` audit log, and three new endpoints.

**Backend (`routes.py::pipeline_router`):**
- `GET /api/pipeline/board` — Kanban-grouped {stages, columns: {new|contacted|qualified|proposal|won|lost: []}, totals: {prospects, closed_revenue, open_value, by_stage}}.
- `POST /api/pipeline/prospects/{id}/move {status}` — drag-and-drop transition with HTTP-400 enum validation. Persists `last_activity_at` and writes a `stage.changed` event to `pipeline_activity`. Idempotent (same-stage move is a no-op).
- `POST/GET /api/pipeline/prospects/{id}/activity` — log a touch (types: note/call/email/linkedin_dm/meeting) + list (newest first). Bumps `last_activity_at`.
- `GET /api/pipeline/prospects/{id}/ai-suggestion` — single AI-generated next action via OpenRouter + the existing emergent LLM key. Includes a deterministic stage-aware fallback so the UI **never** breaks if the LLM is unreachable. Returns `{action, source: "ai"|"fallback"}`.

**Frontend (`PipelinePage.jsx`):**
- 6-column Kanban (New / Contacted / Qualified / Proposal / Won / Lost) with HTML5 drag-and-drop **plus** keyboard-accessible "Move ▾" menu on every card (testable + screen-reader friendly).
- Rich card: avatar initials, name + company chip, deal-value pill, next-action chip (arrow icon), linkedin/email icon row, last-activity timestamp.
- 4 stat tiles: Prospects · Open value · Closed revenue · Win rate (% won of total).
- Click any card → side `Sheet` drawer with:
  - **AI next action** panel (Suggest button → renders + Apply-to-card button).
  - **Log a touch** composer with 5 type-buttons (Note / Call / Email / LinkedIn DM / Meeting).
  - **Activity stream** (chronological, includes auto-logged stage transitions).
  - Full editable details (Name, Company, Email, LinkedIn, Industry, Deal value, Stage, Source, Next action, Notes).
  - Save · Send quote (re-uses SendQuotationDialog) · Delete actions.

**Tests** (`test_pipeline_kanban.py`): 8 pytests covering board grouping, move + invalid-stage 400 + 404 + idempotency, activity stream (all 5 types, sort, last_activity_at bump), AI suggestion (`ai` and `fallback` sources), auth guards. **All green.**

### ✅ Team Activity Widget — "team is heads-down" indicator (Feb 2026)
**Goal**: Tiny but high-impact UX touch on the client portal — when the team is actively working on PM tasks, the client opens the Milestones tab and sees a live pulse card with counts + recent moves. Hides entirely when there's no activity, so clients without active projects don't see empty noise.

**Backend (`project_mode_routes.py::pm_client_router`):**
- `GET /api/clients/me/team-activity` (client-auth) — aggregates the caller's PM projects + tasks. Returns:
  - `has_activity` boolean (false when client has 0 PM projects → frontend hides the card)
  - `projects_count`, `counts` per status, `active_count` (in_progress + review), `completed_this_week`
  - `recent` — last 5 task updates (title + status + updated_at + project_name + project_color). **`description` is stripped server-side to prevent internal notes leaking**.

**Frontend (`TeamActivityWidget.jsx`):**
- Renders inside the Milestones tab on `/portal` above the existing animated timeline.
- Pulsing green dot + "Team is heads-down" label.
- 3 stat tiles (In progress · In review · Shipped this wk).
- Rose alert banner when blocked count > 0.
- Recent activity list (max 5) with color-coded status dots + relative time.
- Auto-refreshes every 30 seconds while the tab is mounted.

**Tests**: 3 pytests in `test_pipeline_kanban.py` (empty client, populated client with PM tasks, auth-guard).

### ✅ Phase F — In-house Project Mode (Feb 2026)
**Goal**: Replace the unreliable Nifty integration with a self-contained Kanban PM suite. Founder + team manage internal task state without depending on a third-party OAuth that keeps disconnecting.

**Backend (`project_mode_routes.py`):**
- New collections:
  - `pm_projects`: `{id, name, slug, company_id?, client_email?, color, status: active|paused|archived, created_at, updated_at, created_by}`
  - `pm_tasks`: `{id, project_id, title, description, status: todo|in_progress|review|blocked|done, assignee, due_date, priority: low|medium|high|urgent, milestone_id?, order_idx, created_at, updated_at}`
  - `pm_comments`: `{id, task_id, author, body, created_at}`
- All endpoints mounted under `/api/admin/pm/*` (admin-auth):
  - Projects: `GET/POST /projects` · `GET/PATCH/DELETE /projects/{id}` · `GET /projects/{id}/board` (Kanban-grouped tasks)
  - Tasks: `GET/POST /tasks` (filters: `project_id`, `status`, `assignee`) · `PATCH/DELETE /tasks/{id}`
  - Comments: `GET/POST /tasks/{id}/comments`
- Smart behaviours:
  - Project create auto-resolves `company_id` from `client_email` via `companies.primary_email`.
  - Task create auto-assigns the next `order_idx` within its column. Status transitions without a pinned `order_idx` land the card at the bottom of the destination column.
  - **Task → done with a `milestone_id` auto-completes the linked Milestone** (status='complete' + completion_date) — keeps the client-facing animated timeline in sync without manual edits.
  - Task delete cascades to its comments.

**Frontend (`/admin/project-mode`, `ProjectModeAdmin.jsx`):**
- Left rail: project list with accent-color dot, name, client-email prefix, `done/total` progress.
- Main area: 5 Kanban columns (To do / In progress / Review / Blocked / Done) with `+` add buttons per column.
- Click any card → side-by-side detail dialog with status pills (one-click move between columns), editable title/description/priority/assignee/due-date, comments thread with author + timestamp, delete button.
- New-project dialog supports name + optional client_email + color picker.
- Sidebar entry under "Sales" with KanbanSquare icon.

**Tests:** `/app/backend/tests/test_project_mode.py` — 5 pytests (CRUD, task lifecycle with status/priority validation + reordering, task→done auto-completes linked milestone, auth guards, 404 paths). **All green.** Regression: **243/243 backend tests** (incl. the extended brief milestone auto-seed assertions).

### ✅ Brief milestone auto-seed (Feb 2026 — Phase D part 2 polish)
**Goal**: "We already started" moment — when the client approves their AI Project Brief, we seed 5 default milestones (Discovery & Brief Sign-off [in_progress] / Design Language / Build — Core flows / QA & Polish / Launch [is_final_deliverable]) on their account. Client opens the Milestones tab on their very next visit and sees the timeline already lit up.

**Implementation** (`project_brief_routes.py::_seed_milestones_from_brief`):
- Hooks into `POST /clients/me/briefs/{id}/approve` right before the activity log entry.
- Idempotent — keyed by `(client_email, project_name)`. If the client already has milestones for this exact project name, the seed is a no-op.
- Spaced due dates: D+3 / D+10 / D+28 / D+38 / D+45 from approval.
- Test extended in `test_project_brief_e2e.py::test_full_brief_flow` to assert all 5 titles + statuses + is_final_deliverable flag.

### ✅ Phase D part 2 — AI Project Brief flow (Feb 2026)
**Goal**: Compress the gap between onboarding submission and Design kickoff. We auto-translate the client's onboarding answers into 3 ready-to-paste AI prompts (Design Language, Function Language, Company Background), the admin pastes each into Claude → drops the summaries back per phase → sends for approval → client reviews + approves in their portal → brief locks + Design phase begins.

**Backend (`project_brief_routes.py`):**
- New `project_briefs` collection: `{id, company_id?, client_email, project_name, onboarding_id?, phase_summaries: {phase1|2|3: {summary, updated_at}}, status: draft|sent_for_approval|approved|archived, sent_for_approval_at, approved_at, approved_by_email, created_at, updated_at}`
- 3 prompt generators (`generate_design_prompt`, `generate_function_prompt`, `generate_company_prompt`) embed the client's actual phase1/2/3 answers — with graceful `didn't share any references` fallback when phases aren't submitted yet.
- Admin endpoints (auth-guarded):
  - `GET /admin/briefs/prompts/{onboarding_id}` — 3 ready-to-paste prompts + answers + phases_submitted snapshot
  - `GET/POST /admin/briefs` (+ `?client_email=` / `?status=` filters)
  - `GET /admin/briefs/{id}` · `PATCH /admin/briefs/{id}/phase/{phase1|2|3}` · `POST /admin/briefs/{id}/send-for-approval` · `DELETE /admin/briefs/{id}` (archive)
  - Approved briefs are read-only (409 on edit). Send-for-approval refuses to send empty briefs (400).
- Client endpoints (client-auth):
  - `GET /clients/me/briefs/pending` — single brief awaiting approval, or null
  - `GET /clients/me/briefs/approved` — list (for the Orders accordion)
  - `POST /clients/me/briefs/{id}/approve` — only the brief's client can approve (403 for others). Idempotent. Stamps `approved_by_email` + `approved_at` + writes activity log + fires founder email + Slack notification.
- Branded emails: `send_brief_for_approval()` (to client) + `send_brief_approved_to_founder()` (to founder).

**Frontend:**
- `/app/frontend/src/components/admin/ProjectBriefDialog.jsx` — admin's brief composer. Triggered from a Wand2 icon on every `/admin/onboarding` row. 3 phase tabs, each with a Copy-prompt button + summary textarea + Save button. Optional note-to-client + Send-for-approval CTA. Status pill (draft / sent_for_approval / approved).
- `/app/frontend/src/pages/client/ProjectBriefView.jsx` — client-portal Project Brief tab. Renders 3 color-coded section cards (pink/blue/emerald) + an "Awaiting your approval" hero + a big Approve button gated by a shadcn AlertDialog. After approval, the tab disappears and an `ApprovedBriefsAccordion` renders inside the Orders tab (expandable cards with project name + approved-on date + each phase summary).
- `/app/frontend/src/pages/client/ClientPortal.jsx` — fetches `pending` + `approved` briefs alongside the other portal data; conditionally renders the brief tab with a Sparkles icon + amber pulse dot when there's pending work.

**Tests** (`/app/backend/tests/test_project_brief_e2e.py`):
- 4 pytests (full E2E flow, auth guards, send-without-content fails, missing-phase prompt fallback). All green.
- Regression: **238/238 backend tests pass**. 100% frontend verification via testing agent (iteration_20.json).

### ✅ Phase E — Animated Milestone Timeline (Feb 2026)
**Goal**: Turn the static milestone list into a delightful, alive timeline that pushes live updates to clients. Reused inside both the client portal AND the admin CompanyDetailDrawer.

**New shared component** `/app/frontend/src/components/MilestoneTimeline.jsx`:
- **Vertical timeline** with an animated "progress rail" whose filled height grows as phases complete (`gradient: emerald → blue → primary`).
- **Fun status banner** that rotates on every visit. 12 pre-written messages including "Team's brewing your designs 🔮", "Code's compiling, beats are bumping 🎧", "Almost there — sneak peek incoming 👀", "The team ain't chillin', we're getting this done reaaaaal soon!".
- **Per-node states**:
  - `completed` → solid green node + ✓ icon + completion date
  - `in_progress` → pulsing blue ring + spinning loader icon
  - `blocked` → rose node + visible reason card + ETA
  - `pending` → empty slate node
- **One-shot confetti burst** on the most-recently-completed milestone (CSS-only, no library, gated by `localStorage` so it fires once per completion timestamp).
- **Live ETA estimator**: averages duration of completed milestones, projects remaining work to a "Likely shipping ~Mar 12 (4 days out)" line.
- **Expandable cards** — click to reveal recent team updates inline.
- Mobile-friendly (stacks cleanly, no horizontal scroll).

Wired into:
- `/portal?tab=milestones` (client portal — replaces the old static `MilestonesList`)
- `CompanyDetailDrawer` → Milestones tab (admin sees exactly what the client sees)

### ✅ Phase D — PayPal Refunds (Feb 2026 — part 1 of 2)
**Goal**: Issue full or partial refunds from the admin dashboard with a one-click link to the PayPal activity page. AI Project Brief flow (part 2) deferred to next session.

**Backend:**
- `PayPalClient.refund_capture()` + `get_capture()` + `get_refund()` added — wraps PayPal's `/v2/payments/captures/{id}/refund` endpoint.
- Two new admin endpoints in `paypal_routes.py`:
  - `POST /api/paypal/admin/transactions/{order_id}/refund` — full or partial refund. Validates capture is in COMPLETED state, persists `refund_id`/`refund_status`/`refund_amount`/`refund_reason`/`refunded_at`, flips the linked invoice (if any) to `refunded` or `partially_refunded`, writes `refund.issued` activity_log event, fires Slack alert + branded refund email.
  - `GET /api/paypal/admin/transactions/{order_id}/refund-info` — inspector returns `{refundable, has_capture, capture_id, already_refunded}` for the admin UI to pre-validate before showing the button.
- New `invoice_service.mark_invoice_refunded()` helper.
- New `email_service.send_refund_issued()` branded template with reason, amount, partial-vs-full label, PayPal refund id.

**Frontend** (PayPalOrdersPage.jsx):
- Added a **Refund button** next to the launch button (only on COMPLETED + not-yet-refunded captures).
- Refund dialog with: amount (blank = full), reason dropdown (Client Request / Duplicate / Mistake / Quality Issue / Fraud / Other), note-to-payer (visible on PayPal receipt), internal note, "send branded email" toggle.
- Refunded transactions show a rose pill ("Partial refund · USD 1,000" or "Refunded").
- Successful refund → toast offers to open the PayPal activity URL in a new tab.

**Tests:** `test_paypal_refunds.py` (7 tests) — auth guards, 404s, reason validation, refund-info shape, PayPal client signature pinning, email signature pinning. **All green.**

### ✅ Phase C — VIP Support Clearance (Feb 2026)
**Goal**: A complete VIP/Premium/Standard/None support tier system. Auto-generated Support UIDs, central SLA matrix, lookup tool for support agents, subscription auto-upgrade hook, client portal badge.

**Backend** (`support_clearance_routes.py`):
- Generates `BL-SUP-XXXXXX` Support UIDs (6 alphanumeric chars, collision-checked). Every new company gets one at creation; legacy companies are backfilled at warmup.
- 4-tier model (`vip / premium / standard / none`) with a central SLA matrix stored in `app_settings.support_sla` (admin-editable). Defaults include the response-time promise + a ready-to-paste spiel for each tier.
- Endpoints:
  - `GET /admin/support-clearance/lookup?uid=...|email=...` — full clearance package: company, tier, SLA spiel, contacts, recent tickets, active subscriptions.
  - `POST /admin/support-clearance/companies/{id}/tier` — manual override + writes `support.upgraded` activity event.
  - `POST /admin/support-clearance/companies/{id}/regenerate-uid` — rotate (with activity log).
  - `GET/PUT /admin/support-clearance/sla` + `/sla/{tier}` — admin edits the spiel/response time inline.
  - `GET /api/support/clearance/{uid}` — **public, no auth** — returns tier + label + SLA but ZERO PII. Used by chat widgets.
  - `GET /api/clients/me/support/clearance` — client portal shows the badge.
- Auto-upgrade hook in `paypal_webhooks.py`: when `BILLING.SUBSCRIPTION.ACTIVATED` fires, `apply_support_subscription_upgrade()` maps the plan name/id → tier and bumps automatically.

**Frontend** (`SupportClearanceAdmin.jsx`):
- New page `/admin/support-clearance` (in Sales sidebar group).
- Single search box auto-detects UID vs email.
- Result card: company name, tier badge (with crown icon for VIP), Support UID (with copy + rotate), SLA promise, spiel preview, **Copy spiel** button (1-click paste into ThriveDesk).
- Manual override buttons (VIP / Premium / Standard / None).
- Recent tickets + active subscriptions + contacts cards.
- Inline SLA matrix editor at the bottom — click any tier card → edit label / response_time / spiel.

**Client portal**: VIP/Premium tier badge in header (clickable → copies Support UID to clipboard). Hidden for `none` tier.

**Tests:** `test_support_clearance.py` (12 pytests) covering auth guards, UID generation, public verify (PII redaction), lookup-by-email-or-UID, 404 paths, manual override + activity log, tier validation, UID rotation, SLA CRUD, client portal endpoint scoping. **All green.**

### ✅ Phase B — Companies + Contacts foundation (Feb 2026)
**Goal**: Replace the flat `clients` model with a proper Company → Contacts relationship. Build the unified "Client Detail Drawer" — a single tabbed view showing everything we know about a company. Add an `activity_log` that every key event writes to (invoice created, paid, refunded, proposal sent/signed, brief approved, milestone completed, support upgraded, manual notes).

**Backend:**
- New collections: `companies`, `contacts`, `activity_log`.
- New modules: `/app/backend/companies_routes.py` (admin CRUD + nested contacts + activity + notes), `/app/backend/activity_log.py` (single `log_activity()` helper used by every other module).
- Idempotent migration (`migrate_clients_to_companies`) — runs once at warmup, seeds every legacy client into a company with itself as the primary contact. Skips e2e/test-* fixture rows. **47 real companies migrated, 73 test rows filtered out.**
- Activity log already hooked into `invoice_service.create_manual_invoice` (`invoice.created` event). More hooks coming in subsequent phases as the events get more interesting.

**Endpoints:**
- `GET/POST /admin/companies` · `GET/PATCH/DELETE /admin/companies/{id}`
- `GET /admin/companies/{id}/detail` — denormalized "bird's-eye view": company + contacts + invoices + PayPal orders + subscriptions + proposals + onboarding + milestones + tickets + stats (lifetime_paid, outstanding, active_subscriptions, etc.)
- `GET /admin/companies/{id}/activity` + `POST /admin/companies/{id}/notes`
- `GET/POST /admin/companies/{id}/contacts` · `PATCH/DELETE /admin/contacts/{id}` · `POST /admin/contacts/{id}/promote`

**Frontend:**
- New page `CompaniesAdmin.jsx` at `/admin/companies` (sidebar renamed Clients → Companies). Search by name/email/domain, tier filter, stat tiles, new-company dialog.
- New `CompanyDetailDrawer.jsx` — slide-in side sheet with 7 tabs:
  - **Overview** (read/edit name, domain, industry, size, phone, notes)
  - **Contacts** (multi-contact CRUD, primary star, promote/archive)
  - **Projects** (current onboarding phase progress)
  - **Transactions** (invoices, PayPal orders, subscriptions side-by-side)
  - **Milestones** (status pills — Phase E will animate this)
  - **Documents** (BreezeDocs proposals)
  - **Activity** (chronological audit log + Quick Note add)

**Tests:**
- `/app/backend/tests/test_companies.py` — 7 new pytests: auth guards, list, full CRUD+detail, duplicate guard, contact promote/archive, note → activity, archive filtering. **All green.**
- Full pre-existing suite (208 tests) still green.

### ✅ Phase A — Cleanup & quick fixes (Feb 2026)
**Goal**: Strip every removed integration so the codebase is foundation-ready for Phase B (Companies/Contacts). Fix the broken email logo + non-existent portal routes that were causing white screens. Add the missing BreezeDocs credentials field. Cleanup outcome:

**Deletions:**
- AgencyHandy — fully removed. Backend modules (`agencyhandy_client.py`, `agencyhandy_routes.py`, `agencyhandy_webhooks.py`) deleted, server.py imports/state/routers stripped, `.env` keys removed, `client_routes.py` endpoints simplified to no longer call AH, "View invoices in AH" tab removed.
- Approval Studio (Design Approvals admin page) — fully removed. `approval_studio_client.py`, `approval_studio_routes.py`, `ApprovalsAdmin.jsx` deleted, sidebar entry removed, integrations credentials form entry removed, `designer_reminder_cron` removed.
- ThriveDesk API connection — fully removed. `thrivedesk_client.py`, `thrivedesk_routes.py` deleted, `SupportTriageAdmin.jsx` deleted, sidebar entry removed, milestone-routes reverse-sync logic removed, `thrivedesk_retry_cron` removed. (The iframe chatbot widget in `index.html` stays — it's API-free.)
- Test files for removed features: `test_phase11.py`, `test_phase12.py`, `test_phase13.py`, `test_phase15.py`, `test_master_workflow.py`.

**Fixes:**
- Email logo now uses the MASTER (dark-on-light) variant + is **inlined as a `data:` URI** on first send so Gmail/Outlook can never strip it. Same dark variant applied to the public `/pay/invoice/{id}` page.
- Every `hello@bybloomlabs.com` → `support@bybloomlabs.com` (across `.env`, `brand.js`, `Landing.jsx`, `blog_extras_routes.py`, `emailit_client.py`, footer template).
- Email CTAs use `?tab=...` deep-links to the existing `/portal` route + legacy `/portal/{section}` redirects added in `App.js` for emails already in inboxes.
- ClientPortal now reads `?tab=` from URL on load and syncs URL on tab change (refresh-safe, share-safe).
- ClientLogin preserves query string when bouncing back after auth.
- BreezeDocs credentials field added to `/admin/integrations` Credentials form (#13).

**Rewrites:**
- `contact_routes.py` — drops ThriveDesk dependency, now writes to MongoDB + sends a branded founder-notification via Emailit + Slack alert. Auto-generates `BL-YYYY-####` ticket reference per submission (Phase I infra ready).

**Tests:**
- New: `test_email_branding.py` (7) pins logo + deep-link behaviour.
- All `_aio` test helpers hardened against closed-loop races.
- **208/208 backend tests pass.**

### ✅ Phase 18.5 — BreezeDocs auto-invoice + Nifty disconnect UX (Feb 2026)
**Goal**: Wire two improvements requested by the user: (A) collapse "proposal signed → invoice received → payment" into a single click by auto-issuing the invoice the moment a BreezeDocs proposal reaches `completed`, and (B) turn the silent Phase 1 → Nifty sync failure into a visible, 1-click-fixable issue.

**Part A — BreezeDocs completed → auto-invoice + 1-click pay link:**
- New `breezedocs_routes._maybe_auto_invoice_on_completion(db, request, proposal)` helper. Fires when:
  - `proposal.status == "completed"`
  - `amount > 0` (NDAs and zero-priced docs skip)
  - `linked_invoice_id` is not already set (idempotent)
  - `client_email` is present
- Creates the invoice via `invoice_service.create_manual_invoice` with line-item description `"{proposal_title} (BreezeDocs proposal #{breezedocs_id})"` and notes pointing back to the BreezeDoc document.
- Caches the branded PDF, sends the **send_invoice_issued** branded email with `invoice_url={base}/pay/invoice/{id}` (the Phase-18 1-click pay link).
- Persists `linked_invoice_id` on the proposal so the admin sees the link in `/admin/proposals`.
- Wired into both paths:
  - `breezedocs_sync_cron` (every 10 min) — auto-invoices on every detected `completed` transition
  - `POST /admin/breezedocs/proposals/{id}/sync` — admin's manual refresh — response now includes `invoice_created: <id>` when applicable.

**Part B — Phase 1 Onboarding Nifty disconnect UX:**
- Diagnosed root cause: `nifty_errors[].error: "Nifty not connected"`, `status: 0` because no OAuth handshake has completed.
- `_create_nifty_task_safe` now rewrites generic disconnect errors into an actionable string: `"Nifty isn't connected. Open /admin/integrations → Nifty → Connect, then click 'Retry pending tasks' on the onboarding page."` Pattern broadened (Phase-18.5 resilience pass) to catch `nifty not connected`, generic `not connected`, status 0 (non-timeout), and status 401.
- New backend endpoints:
  - `GET /admin/onboarding/health` — snapshot `{nifty_connected, onboardings_with_errors, blocked_by_disconnect: [{id, phase}]}`.
  - `POST /admin/onboarding/replay-failed` — replays every failed phase across every onboarding in a single click. Refuses with 400 when Nifty is still disconnected. Idempotent — clears `nifty_errors` per phase as it backfills.
- `OnboardingAdmin.jsx` updated:
  - Red rose banner: **"Nifty isn't connected — phase tasks aren't syncing"** with prominent **Connect Nifty →** button linking to `/admin/integrations`. Renders only when `nifty_connected: false` AND there are pending tasks.
  - Amber retry banner: **"X onboardings have pending Nifty tasks"** with **Retry pending tasks** button. Renders only when `nifty_connected: true` AND there are errors waiting.
  - Banners disappear automatically once the queue clears.

**Tests:**
- `/app/backend/tests/test_breezedocs_auto_invoice.py` — 5 pytests: happy path + idempotency, zero-amount skip, missing-amount skip, non-completed status skip, missing-email skip.
- `/app/backend/tests/test_onboarding_health.py` — 4 pytests: auth guards × 2, health snapshot shape, replay-failed rejection when disconnected.
- **All 24 new + relevant-module tests pass. 54/54 across the testing-agent's full Phase-18.5 sweep.**

### ✅ Phase 18 — BreezeDocs integration + 1-click invoice pay link (Feb 2026)
**Goal**: Round 4 of the AgencyHandy replacement — proposals + contracts handled in-house with branded sign flow. Also closes the email-to-payment loop with a single click.

**Part 1 — BreezeDocs (proposals & contracts):**
- `/app/backend/breezedocs_client.py` (new) — async wrapper around https://breezedoc.com/api with mock-mode fallback. Mirrors the `approval_studio_client.py` / `thrivedesk_client.py` patterns. JWT bearer auth (Personal Access Token).
- `/app/backend/breezedocs_routes.py` (new):
  - Admin: `GET /admin/breezedocs/templates`, `GET/POST /admin/breezedocs/proposals`, `POST /admin/breezedocs/proposals/{id}/sync`, `POST /admin/breezedocs/proposals/{id}/resend`, `DELETE /admin/breezedocs/proposals/{id}` (soft archive), `GET /admin/breezedocs/mock-log`.
  - Client: `GET /clients/me/breezedocs-proposals` — scoped to caller's email + filters archived.
  - APScheduler `breezedocs_sync_cron` runs every 10 min to refresh open proposals (BreezeDoc has no webhooks).
- `/app/frontend/src/pages/admin/ProposalsAdmin.jsx` (new) — admin overview: 3 stat tiles (total / awaiting / completed), status filter, search by client, **New Proposal** dialog (template picker, client name+email, optional title/amount, send-now checkbox). Per-row actions: Copy sign link, Open, Resend email, Sync status, Archive.
- Client portal **Proposals tab** rewritten to consume the new endpoint. Renders status pills + a **Review & sign** CTA that opens the BreezeDoc-hosted signing page.
- Admin sidebar gained "Proposals" entry (`/admin/proposals`) in the Sales group.
- Credentials wiring: `breezedocs` added to `ALLOWED_CRED_PROVIDERS`, integration health endpoint, and the credentials form. `POST /admin/integrations/breezedocs/test` hits `/me` to verify auth.

**Part 2 — 1-click "Pay this invoice" public link:**
- `invoice_public_router` wired into `server.py` (was created but never mounted in Phase 17.6).
- New `GET /api/public/invoices/{id}/summary` (no auth) returns invoice metadata for the landing page.
- New `GET /api/public/invoices/{id}/pay` (no auth) creates a fresh PayPal order tagged with `custom_id=invoice:{id}` and 302-redirects to the PayPal approval URL.
- `paypal_routes.capture_order` now joins captures back to the invoice via `linked_invoice_id` and marks the invoice paid + re-renders the PDF + sends the receipt.
- New public route `/pay/invoice/:invoiceId` (frontend) — clean unauthenticated landing page: summary, line items, balance, "Pay with PayPal" CTA, paid/voided banners.
- Invoice email template's "Pay invoice" button now points to the public pay link instead of the portal route — clients pay in 1 click without logging in.
- Admin **InvoicesAdmin** gained a per-row **Pay link** button that copies the public link to clipboard.
- Client portal **Invoices** tab gained a **Pay now** button on unpaid invoices.

**Tests:**
- `/app/backend/tests/test_breezedocs.py` (new) — 10 pytests covering auth guards × 4 admin + 1 client, live templates list, proposals list shape, validation guard, 404 paths × 2, mock-log shape, /breezedocs/test endpoint.
- `/app/backend/tests/test_pay_invoice_link.py` (new) — 5 pytests covering summary (no auth), 404 paths × 2, 302 → PayPal redirect, paid-invoice 409 guard.
- Fixed pre-existing string-match assertion in `test_phase10_integrations.py` (Nifty wording changed from "not connected" to "isn't connected").
- **All 248 backend tests green** across 22 test files.

### ✅ Phase 17.7 — PayPal Subscriptions + invoice on every renewal (Feb 2026)
**Goal**: Round 3 of the AgencyHandy replacement — recurring add-on revenue managed in-house.

**Backend additions:**
- `/app/backend/subscription_routes.py` (new):
  - **Client-facing** (token auth via `get_current_client`):
    - `GET /api/clients/subscriptions/plans` — public catalogue of active plan templates
    - `POST /api/clients/subscriptions/subscribe` — start subscription, returns PayPal `approval_url`
    - `GET /api/clients/subscriptions` — list own subscriptions
    - `POST /api/clients/subscriptions/{id}/cancel` — self-service cancel (with PayPal API call)
  - **Admin-facing** (founder JWT):
    - `GET /api/admin/subscriptions` — list all subs, optional `?client_email=` filter
    - `POST /api/admin/subscriptions/assign` — one-click "give a client an add-on" flow. Creates the PayPal sub in `APPROVAL_PENDING`, fires a branded email with the activation link, and surfaces the link in a dialog.
- **Webhook upgrades** (`paypal_webhooks.py`):
  - `BILLING.SUBSCRIPTION.ACTIVATED` now also fires `send_subscription_activated()` branded email + auto-provisions a client.
  - `PAYMENT.SALE.COMPLETED` (recurring renewal) now auto-creates an `Invoice` (source=`subscription_cycle`, status=`paid`), caches the PDF, and sends a branded receipt — every cycle.
- **Logo embedded as data URI** in invoice PDFs via a custom WeasyPrint `url_fetcher` (WeasyPrint silently drops `data:` URIs by default). Logo now appears in a dark-blue header band → high contrast, visually polished. Confirmed via PDF render → image analysis.

**Frontend additions:**
- `/app/frontend/src/pages/admin/SubscriptionsAdmin.jsx` (new) — admin overview: 4 stat tiles (Total / Active / Pending / Estimated MRR), search, list view with status + plan badges, "Manage plans" + "Assign add-on" buttons. Assign dialog: plan picker, client email, email-now checkbox. Result dialog with copy/open approval link.
- Client portal **Subscriptions tab** rewritten to consume the new endpoints. Shows active subs with cancel button + "Add-ons & retainers" catalog with subscribe buttons. Subscribe → redirects to PayPal approval URL.
- Admin sidebar adds "Subscriptions" entry (`/admin/subscriptions`) under "Sales".

**Tests:**
- `/app/backend/tests/test_subscriptions.py` — 7 new pytests (auth guards × 6 endpoints, list/filter, unknown-plan/unknown-client guardrails, logo data-URI sanity check).
- Regression: **85/85 backend tests green** across all suites.

### ✅ Phase 17.6 — In-house Invoices + AgencyHandy removal (Feb 2026)
**Decision**: User confirmed "replace AgencyHandy completely" to consolidate ownership of invoices/proposals/subscriptions in-house and gain full branding control.

**Backend additions:**
- `/app/backend/invoice_service.py` — invoice number generator (`INV-YYYY-NNNN` atomic counter via `app_settings`), branded HTML→PDF rendering via WeasyPrint, idempotent `get_or_create_invoice_for_capture()` linked by `paypal_order_id`, manual create + PDF caching.
- `/app/backend/invoice_routes.py` — full admin CRUD (`/api/admin/invoices` GET/POST + `/admin/invoices/{id}` GET/PATCH/DELETE + `/admin/invoices/{id}/pdf` + `/admin/invoices/{id}/send-email`) and client portal endpoints (`/api/clients/invoices` + `/clients/invoices/{id}` + `/clients/invoices/{id}/pdf` — scoped to caller via `get_current_client`).
- `models.Invoice` + `InvoiceLineItem` + `InvoiceCreateRequest` + `InvoiceUpdateRequest` Pydantic types.
- `capture_order` now auto-generates an Invoice + caches PDF on every COMPLETED PayPal capture.
- AgencyHandy mirror code path removed from `auto_provision_client_from_payment`. The `agencyhandy_client.create_client` method remains in code (in case it's needed elsewhere) but is no longer called from any production path.

**Frontend additions:**
- `/app/frontend/src/pages/admin/InvoicesAdmin.jsx` (new) — list with status filter + email search, four stat tiles (total/outstanding/collected/drafts), per-row actions: PDF download, View, Resend, Edit (status + notes), Void. Plus a full **New Invoice** dialog: client info, multi-line items (add/remove), currency, discount, tax, due date, live subtotal/discount/tax/total summary, notes textarea, "send email now" checkbox.
- Client portal `InvoicesList` rewritten to consume `/api/clients/invoices` (new Invoice shape) + branded **PDF download** button per row + `Status` pill + balance-due hint.
- Admin sidebar gained "Invoices" entry (`/admin/invoices`).
- WeasyPrint installed (with libpango/libcairo backing) + frozen into requirements.txt.

**PDF branding template** (`invoice_service._build_invoice_html`):
- A4 page, 24mm margins
- Header: Bloom Labs logo + legal name + address + tax ID, balanced against `INVOICE` title + number + status pill
- Bill-To block, dates block (Issued/Due/Paid)
- Line items table (Description / Qty / Unit / Amount) with tabular alignment
- Totals rail (subtotal → discount → tax → total → amount paid → balance due) — only renders rows with non-zero values
- Notes block (left blue accent bar)
- Footer with billing email + website
- Status pill color-coded: paid (emerald), issued (blue), draft (grey), overdue/void (rose), partial (amber)

**Tests:**
- `/app/backend/tests/test_invoices.py` — 7 new pytests (counter atomicity, idempotent capture-to-invoice, PDF byte signature, end-to-end CRUD flow, auth guards, empty-line-item validation, client isolation).
- Existing master-workflow tests updated to assert AH mirror is **not** called (Phase 17.6 contract).
- Regression: **78/78 backend tests green** across invoices/email-CRUD/blockers/master-workflow/payment-plans/paypal-clients.

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

### ✅ Phase 16 — Google Calendar OAuth + Calendar API integration (Feb 2026)

**Real OAuth creds wired** (provided by user):
- `client_id` = `728881545908-a752kc3enjgnadmb1c0m6ff90ruick4n.apps.googleusercontent.com`
- Redirect URI = `https://cred-manager-20.preview.emergentagent.com/api/oauth/calendar/callback` (preview) + `https://bybloomlabs.com/api/oauth/calendar/callback` (prod)
- Scope = `https://www.googleapis.com/auth/calendar`

**New backend (`google_calendar_client.py` + `google_calendar_routes.py`):**
- `GoogleCalendarClient` — async wrapper around Calendar v3 REST API. Auto token refresh on each call. Tokens persisted in `integrations.google_calendar`.
- 3 new routers wired into server.py:
  - `calendar_oauth_router` — public `GET /api/oauth/calendar/callback` (always redirects, never 4xx)
  - `calendar_admin_router` — `/start`, `/status`, `/test`, `/disconnect`, `/events` (admin auth)
  - `calendar_milestones_router` — `POST /admin/milestones/{id}/calendar-event` creates a Calendar event from milestone deadline + attendees + persists `calendar_event_id` + `calendar_event_link` back on the milestone.
- Health endpoint now lists 9 providers including `google_calendar`.
- DB-stored credentials store accepts new provider key — masked on read.

**Frontend (`IntegrationCredentialsForm.jsx` + `IntegrationsHealthStrip.jsx`):**
- New "Google Calendar" card with 3 inputs (client_id, client_secret, redirect_uri) + **Connect button** that pops the Google authorization URL in a new tab.
- Health Strip pill with CalendarDays icon — yellow until user completes OAuth handshake, green after.

**Test results:**
- iteration_16 8/8 phase16 backend tests + 55/55 phase 11-15 regression = **63/63 PASS** (1 skipped — legacy Slack-not-configured test).
- iteration_16 100% frontend verification.

**Status:** OAuth client + tokens scaffolded; user must complete the one-time OAuth handshake by clicking "Connect" in `/admin/integrations` → Credentials → Google Calendar.

### ✅ Phase 17 — Payment Plan Split + Launch Balance Billing (Feb 2026)
**Pricing checkout supports two payment plans:**
- **50% now / 50% at launch** (default): charges the first 50% via PayPal today; second 50% is billed when an admin marks the project "Ready for Launch" from `/admin/paypal-orders`.
- **100% upfront**: applies a **$500 discount** to the base price and captures the full balance in a single PayPal order (no remaining balance later).

**Backend (`/app/backend/paypal_routes.py`):**
- `compute_charge(tier, payment_plan)` resolves base/charge_now/charge_later/discount math for express, custom, enterprise.
- `CreateOrderRequest.payment_plan` accepts `split_50_50` or `full_upfront`; invalid values → HTTP 400.
- Transactions persist `payment_plan`, `plan_label`, `base_amount`, `charge_now`, `charge_later`, `discount_applied`, `installment_index`, and `installment_2_status` on the `paypal_transactions` doc.
- Capture pipeline marks the parent's `installment_2_status` → `pending_launch` on first capture, then `paid` when the child installment captures. Skips duplicate client provisioning for installment 2.
- New admin endpoint `POST /api/paypal/admin/transactions/{order_id}/mark-ready-for-launch`:
  - Idempotent (returns the existing child if already billed).
  - Optional `amount_override` body field lets admin re-issue at a different total after a scope change.
  - Creates a second PayPal order for `charge_later`, persists it linked to the parent (`parent_order_id`, `installment_index: 2`), emails the client (best-effort via Emailit), and notifies the admin in the in-app notification feed.
- New admin endpoint `POST /api/paypal/admin/transactions/{order_id}/cancel-installment-2`:
  - Voids an uncaptured launch-balance order locally (`VOIDED_LOCAL`) and resets the parent's `installment_2_status` back to `pending_launch` (clears `installment_2_order_id`).
  - Rejects with 409 if the child has already been captured (admin must refund through the PayPal dashboard — out of scope).

**Frontend:**
- `/app/frontend/src/components/sections/Pricing.jsx` — CheckoutDialog renders a radio group (split_50_50 / full_upfront) with a live summary panel (base, discount line, due today, due at launch). CTA dynamically reflects `charge_now`.
- `/app/frontend/src/components/payment/PayPalCheckoutButton.jsx` — forwards `paymentPlan` to backend.
- `/app/frontend/src/pages/admin/PayPalOrdersPage.jsx` (new) — list view of all PayPal orders with payment-plan badge, installment-2 status, and three actions on COMPLETED 50/50 deposits:
  - **Mark Ready for Launch** — bills the remaining 50% (default).
  - **Re-issue** — voids the current launch order and creates a new one at a different amount (after scope change).
  - **Cancel** — voids the uncaptured launch order locally (with reason), resets the project to `pending_launch`.
- Admin sidebar gained "PayPal Orders" entry (`/admin/paypal-orders`).

**Tests:**
- `/app/backend/tests/test_payment_plans.py` — 19 pytest cases (compute_charge math × 4, payload validation × 3, mark-ready-for-launch guardrails × 4, cancel-installment-2 paths × 6 incl. happy path, amount_override validation × 2). All pass.
- Regression: 27/27 `test_paypal_clients.py` still green = 46/46 backend.
- `iteration_17.json` confirms 100% backend + frontend coverage on the original 10 feature checks (cancel/re-issue UI added after testing-agent run; covered by the new pytest suite + admin smoke test).
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
- **Fix Phase 1 Onboarding → Nifty sync** — `_process_phase1` in `/app/backend/onboarding_routes.py` still emits "1 Nifty error(s)" badge in the admin onboarding panel. Likely root cause is missing default-project setting or expired OAuth token (the UI surfaces the error but doesn't auto-retry). Should be diagnosable via the Phase 9 `is_connected()` + `list_projects()` ping path.

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
- ~~Pricing checkout: 50/50 split vs 100% upfront ($500 discount).~~ ✅ Done (Phase 17, Feb 2026).
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
- PayPal admin (Phase 17): `POST /api/paypal/admin/transactions/{order_id}/mark-ready-for-launch` — bills the remaining 50% for split-payment orders (optional `amount_override`).
- PayPal admin (Phase 17): `POST /api/paypal/admin/transactions/{order_id}/cancel-installment-2` — voids an uncaptured launch-balance order locally and resets the parent.

## MongoDB Collections (cumulative)
- `users`, `daily_routines`, `prospects`, `case_studies`, `testimonials`, `notifications`, `thought_leadership`, `authority_score`
- `clients`, `client_reset_tokens`
- `paypal_transactions`, `paypal_subscriptions`, `paypal_plans`, `paypal_products`, `paypal_webhook_events`
- `blog_posts`
- `onboardings`
- `lead_magnets`, `leads`
- `milestones`, `milestone_sync_history`
