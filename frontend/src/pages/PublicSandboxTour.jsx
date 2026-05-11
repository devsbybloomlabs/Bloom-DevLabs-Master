/**
 * Public Sandbox Tour — /tour
 *
 * Walks prospects through the Bloom Labs automation flywheel using real demo
 * data fetched from `/api/public/tour/snapshot`. No auth wall — anyone can
 * explore before booking a call.
 *
 * Structure:
 *   Hero  → "See what Bloom Labs builds in 2 minutes"
 *   Scrolling sticky preview panel showing each step:
 *     1. Client kicks off (onboarding wizard preview)
 *     2. Designer ships → Approval Studio (auto-comments to Nifty)
 *     3. Client comments → real-time relay
 *     4. ThriveDesk urgent ticket → escalation timeline
 *     5. Slack alert fires → #urgent-support
 *     6. PM resolves → ticket auto-closes + portal updates
 *   CTA: "This is your future stack. Book a 15-min call."
 *
 * GA4 tracks `tour_step_view` and `tour_cta_click` events.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SeoHead from "@/components/SeoHead";
import { BRAND } from "@/lib/brand";
import {
  Sparkles,
  Send,
  ImagePlus,
  MessageSquare,
  AlertTriangle,
  CheckCheck,
  ArrowRight,
  Calendar,
  Play,
  CheckCircle2,
  Clock,
  Activity,
  ExternalLink,
  Hash,
  X,
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL || "";

// A/B test: assign variant from {header, hero, sticky} on first visit
const AB_EXPERIMENT = "tour_cta_position";
const AB_VARIANTS = ["header", "hero", "sticky"];
const AB_STORAGE_KEY = "bloom_ab_tour_cta";

function getAbVariant() {
  if (typeof window === "undefined") return "hero";
  try {
    const cached = window.localStorage.getItem(AB_STORAGE_KEY);
    if (cached && AB_VARIANTS.includes(cached)) return cached;
    const v = AB_VARIANTS[Math.floor(Math.random() * AB_VARIANTS.length)];
    window.localStorage.setItem(AB_STORAGE_KEY, v);
    return v;
  } catch {
    return "hero";
  }
}

async function trackAb(variant, kind, ctaLocation) {
  try {
    await axios.post(`${API}/api/public/ab/track`, {
      experiment: AB_EXPERIMENT,
      variant,
      kind,
      cta_location: ctaLocation,
    });
  } catch {
    // Silent fail — A/B tracking is best-effort
  }
}

// ----------------------------------------------------------------------
// Step definitions — each maps to a preview rendered in the sticky panel
// ----------------------------------------------------------------------
const STEPS = [
  {
    id: "kickoff",
    title: "Client signs the proposal → onboarding kicks off",
    body:
      "The moment payment captures via PayPal, we provision a portal account, send a magic-link email, and surface a guided wizard. Zero manual ops on your side.",
    badge: "Step 1",
    icon: Send,
    color: "#3B82F6",
    preview: "onboarding",
  },
  {
    id: "design",
    title: "Designer ships → Approval Studio auto-syncs to Nifty",
    body:
      "Push a Figma URL via /admin/approvals → we create an Approval Studio project, post the review link as a Nifty PM task comment, set status to 'In Review', and email the client. Versioning is automatic.",
    badge: "Step 2",
    icon: ImagePlus,
    color: "#8B5CF6",
    preview: "approval",
  },
  {
    id: "feedback",
    title: "Client comments → Nifty + designer notified",
    body:
      "Annotations land in Approval Studio → webhook fires → we relay every comment to the linked Nifty task as `[Feedback from <name>] <text>`. Designer sees it instantly. No status meetings.",
    badge: "Step 3",
    icon: MessageSquare,
    color: "#0EA5E9",
    preview: "feedback",
  },
  {
    id: "urgent",
    title: "Urgent ticket lands in ThriveDesk → escalation in <1s",
    body:
      "Our rule engine catches keywords (urgent / blocked / asap) + tags (High Priority). Instantly creates a Nifty task assigned to your PM team with custom field `ThriveDesk_Ticket_ID`, due today.",
    badge: "Step 4",
    icon: AlertTriangle,
    color: "#F43F5E",
    preview: "urgent",
  },
  {
    id: "slack",
    title: "Slack alert fires in #urgent-support",
    body:
      "Same moment, a Slack notification with `View in ThriveDesk` + `View in Nifty` deep links lands in #urgent-support so your on-call PM sees it before the customer even gets the auto-acknowledgement email.",
    badge: "Step 5",
    icon: Hash,
    color: "#7C3AED",
    preview: "slack",
  },
  {
    id: "resolve",
    title: "PM marks Nifty complete → ticket auto-closes",
    body:
      "When the Nifty task closes, we post a public reply on the ThriveDesk ticket and update the client portal milestone. Set custom field `Close Ticket: Yes` and we close the ticket too.",
    badge: "Step 6",
    icon: CheckCheck,
    color: "#10B981",
    preview: "resolve",
  },
];

export default function PublicSandboxTour() {
  const [data, setData] = useState(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const sectionsRef = useRef([]);
  // Stable A/B variant per visitor
  const variant = useMemo(() => getAbVariant(), []);
  // Record one impression when the page loads
  useEffect(() => {
    trackAb(variant, "impression");
  }, [variant]);

  // Fetch snapshot on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get(`${API}/api/public/tour/snapshot`);
        if (!cancelled) setData(r.data);
      } catch {
        if (!cancelled) setData({ stats: {} });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // IntersectionObserver to drive the sticky preview
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = Number(e.target.dataset.idx);
            if (!Number.isNaN(idx)) {
              setActive(idx);
              // GA4 event
              if (typeof window.gtag === "function") {
                window.gtag("event", "tour_step_view", {
                  step_id: STEPS[idx]?.id,
                  step_index: idx,
                });
              }
            }
          }
        });
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );
    sectionsRef.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const onCtaClick = (location) => {
    trackAb(variant, "cta_click", location);
    if (typeof window.gtag === "function") {
      window.gtag("event", "tour_cta_click", { location, variant });
    }
  };

  return (
    <main className="bg-background text-foreground" data-testid="tour-page">
      <SeoHead
        title="Bloom Labs · Live Sandbox Tour"
        description="Walk through a real Bloom Labs project in 2 minutes — onboarding → design review → urgent support escalation → automatic resolution. No login required."
        keywords="agency demo, design approval workflow, customer support automation, project management automation"
        url="https://bybloomlabs.com/tour"
        type="website"
      />

      {/* Slim header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link to="/" data-testid="tour-logo-link" className="flex items-center gap-2">
            <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-6 sm:h-7" />
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground border-l border-border pl-3 ml-1">
              <Play className="h-3 w-3" />
              Live Sandbox Tour
            </span>
          </Link>
          <Button
            asChild
            size="sm"
            className={`bg-[#1E3A8A] hover:bg-[#1A3278] text-white ${
              variant === "header" ? "" : "hidden sm:hidden"
            }`}
            data-testid="tour-header-cta"
            onClick={() => onCtaClick("header")}
          >
            <a href="/#book">
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              Book a 15-min call
            </a>
          </Button>
          {variant !== "header" && (
            <span
              className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground"
              data-testid={`tour-variant-${variant}`}
              aria-hidden="true"
            >
              variant: {variant}
            </span>
          )}
        </div>
      </div>

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#0F172A] via-[#1E3A8A] to-[#1E40AF] text-white">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <Badge className="bg-white/10 text-white border-white/20 mb-5" data-testid="tour-hero-badge">
            <Sparkles className="h-3 w-3 mr-1.5" />
            Live sandbox · {data?.stats?.milestones || 2} active projects
          </Badge>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05] max-w-3xl">
            Watch an entire client engagement run itself.
          </h1>
          <p className="mt-5 text-base sm:text-lg text-white/80 max-w-2xl leading-relaxed">
            Real flows. Real automations. Designer ships → Approval Studio →
            Nifty PM → ThriveDesk → Slack → client portal — all without you
            touching Zapier. Scroll to start.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href="#step-kickoff"
              className="inline-flex items-center gap-2 rounded-full bg-white text-[#0F172A] px-5 py-3 font-medium text-sm hover:bg-white/90 transition-colors"
              data-testid="tour-hero-start-button"
            >
              Start the tour
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="/#book"
              onClick={() => onCtaClick("hero")}
              className={`inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 text-white px-5 py-3 font-medium text-sm hover:bg-white/20 transition-colors ${
                variant === "hero" ? "" : "hidden"
              }`}
              data-testid="tour-hero-cta"
            >
              <Calendar className="h-4 w-4" />
              Skip — talk to founder
            </a>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-6 text-xs uppercase tracking-[0.18em] text-white/60">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
              No login required
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-amber-300" />
              ~2 minute walkthrough
            </span>
            <span className="inline-flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-blue-300" />
              Real production stack
            </span>
          </div>
        </div>
      </section>

      {/* Scroll-driven tour */}
      <section className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
          {/* Steps column (scrolling) */}
          <div className="space-y-24">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.id}
                  id={`step-${step.id}`}
                  data-idx={idx}
                  ref={(el) => (sectionsRef.current[idx] = el)}
                  className="scroll-mt-24"
                  data-testid={`tour-step-${step.id}`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="h-10 w-10 rounded-xl text-white flex items-center justify-center"
                      style={{ background: step.color }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
                      {step.badge}
                    </Badge>
                  </div>
                  <h2 className="font-display text-2xl sm:text-3xl font-semibold leading-tight">
                    {step.title}
                  </h2>
                  <p className="mt-3 text-base text-muted-foreground leading-relaxed">
                    {step.body}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Sticky preview panel */}
          <div className="lg:sticky lg:top-24 lg:self-start lg:h-[calc(100vh-7rem)] lg:flex lg:items-center">
            <div className="w-full">
              <PreviewPanel step={STEPS[active]} data={data} loading={loading} />
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-secondary/40 border-t border-border">
        <div className="mx-auto max-w-[1080px] px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
          <Badge className="bg-[#1E3A8A] text-white border-0 mb-5" data-testid="tour-final-badge">
            This is your new normal
          </Badge>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight">
            Your future agency runs itself.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Every flow you just watched is production-ready, version-controlled,
            and shipping for real Bloom Labs clients. Book 15 minutes — we&apos;ll
            scope your fit + ballpark price live on the call.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-12 px-6"
              data-testid="tour-final-book-button"
              onClick={() => onCtaClick("footer")}
            >
              <a href="/#book">
                <Calendar className="h-4 w-4 mr-2" />
                Book a 15-min call
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 px-6 border-[#1E3A8A]/30 text-[#1E3A8A] hover:bg-[#1E3A8A]/5"
              data-testid="tour-final-pricing-button"
            >
              <a href="/#pricing">
                See pricing
                <ArrowRight className="h-4 w-4 ml-2" />
              </a>
            </Button>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            All sandbox data is synthetic. Real customer information stays in our
            secure portal.
          </p>
        </div>
      </section>
      {/* Sticky bottom CTA bar — only for the 'sticky' A/B variant */}
      {variant === "sticky" && !stickyDismissed && (
        <div
          className="fixed bottom-0 inset-x-0 z-40 bg-[#0F172A] text-white shadow-2xl border-t border-white/10"
          data-testid="tour-sticky-cta"
        >
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Sparkles className="h-5 w-5 text-amber-300 flex-shrink-0" />
              <div className="text-sm min-w-0">
                <div className="font-medium hidden sm:block">
                  Ready to see this running for your agency?
                </div>
                <div className="text-xs text-white/70 truncate">
                  15-min scoping call · we ballpark price live
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                asChild
                size="sm"
                className="bg-white text-[#0F172A] hover:bg-white/90"
                data-testid="tour-sticky-book-button"
                onClick={() => onCtaClick("sticky")}
              >
                <a href="/#book">
                  <Calendar className="h-3.5 w-3.5 mr-1.5" />
                  Book a call
                </a>
              </Button>
              <button
                type="button"
                onClick={() => setStickyDismissed(true)}
                aria-label="Dismiss sticky CTA"
                className="text-white/60 hover:text-white p-1.5"
                data-testid="tour-sticky-dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ============================================================
// PreviewPanel — sticky right-side card that swaps content per step
// ============================================================
function PreviewPanel({ step, data, loading }) {
  if (loading) {
    return (
      <Card className="border-2 border-border" data-testid="tour-preview-loading">
        <CardContent className="p-6 h-[460px] flex items-center justify-center">
          <div className="text-muted-foreground text-sm">Loading sandbox…</div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card
      className="border-2 border-[#1E3A8A]/15 shadow-xl bg-white overflow-hidden"
      data-testid="tour-preview-panel"
    >
      <div className="bg-gradient-to-r from-[#1E3A8A] to-[#3B82F6] px-5 py-2.5 flex items-center justify-between text-white text-xs">
        <div className="flex items-center gap-2 font-mono">
          <span className="h-2 w-2 rounded-full bg-rose-400" />
          <span className="h-2 w-2 rounded-full bg-amber-300" />
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="ml-2 opacity-80">bybloomlabs.com</span>
        </div>
        <span className="font-mono opacity-80">{step.badge}</span>
      </div>
      <CardContent className="p-5 sm:p-6">{renderPreview(step.preview, data)}</CardContent>
    </Card>
  );
}

function renderPreview(kind, data) {
  if (kind === "onboarding") return <OnboardingPreview data={data} />;
  if (kind === "approval") return <ApprovalPreview data={data} />;
  if (kind === "feedback") return <FeedbackPreview data={data} />;
  if (kind === "urgent") return <UrgentPreview data={data} />;
  if (kind === "slack") return <SlackPreview data={data} />;
  if (kind === "resolve") return <ResolvePreview data={data} />;
  return null;
}

function OnboardingPreview({ data }) {
  const o = data?.onboarding;
  const responses = o?.responses || {};
  return (
    <div className="space-y-3" data-testid="tour-preview-onboarding">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">
        Onboarding wizard · step 3 of 4
      </div>
      <div className="font-display text-lg font-semibold">
        {o?.company_name || "NorthPeak Outdoor"} kickoff
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <Field label="Project type" value={o?.project_type || "Brand identity + website"} />
        <Field label="Budget" value={o?.budget_range || "$15k - $30k"} />
        <Field label="Timeline" value={o?.timeline || "6-8 weeks"} />
        <Field label="Goal" value={responses.primary_goal || "Launch DTC within 8 weeks"} />
      </div>
      <div className="text-xs text-muted-foreground pt-2 border-t border-border">
        <CheckCircle2 className="h-3 w-3 inline mr-1 text-emerald-600" />
        Auto-creates Nifty PM task on submit · auto-emails the team · client receives a "We&apos;ll be in touch" confirmation.
      </div>
    </div>
  );
}

function ApprovalPreview({ data }) {
  const a =
    data?.featured?.approval ||
    (data?.approvals || []).find((x) => x.status === "in_review") ||
    (data?.approvals || [])[0];
  return (
    <div className="space-y-3" data-testid="tour-preview-approval">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          Approval Studio · live review
        </div>
        <Badge className="bg-blue-100 text-blue-900 border-0 text-[10px]">In review</Badge>
      </div>
      <div className="font-display text-lg font-semibold">{a?.asset_name || "Logo concept v3"}</div>
      <div className="text-xs text-muted-foreground">
        {a?.project_name || "Acme rebrand"} · v{a?.version || 3}
      </div>
      <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
          Auto-comment sent to Nifty task
        </div>
        <div className="font-mono text-foreground/80">
          📐 Design uploaded to Approval Studio (v{a?.version || 3}).<br />
          Review link: {a?.review_url?.slice(0, 36) || "https://approval.studio/r/demo_…"}…
          <br />
          Source: figma.com/file/…
        </div>
      </div>
      <div className="text-xs text-muted-foreground pt-2 border-t border-border">
        <CheckCircle2 className="h-3 w-3 inline mr-1 text-emerald-600" />
        Nifty status auto-flipped to <code className="text-[10px] bg-secondary px-1 rounded">In Review</code> · linked milestone bumped to <code className="text-[10px] bg-secondary px-1 rounded">in_progress</code>.
      </div>
    </div>
  );
}

function FeedbackPreview({ data }) {
  const revisions = (data?.approvals || []).filter((a) => a.status === "revision");
  const a = revisions[0] || data?.approvals?.[1];
  return (
    <div className="space-y-3" data-testid="tour-preview-feedback">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          Client comment thread
        </div>
        <Badge className="bg-amber-100 text-amber-900 border-0 text-[10px]">Revision</Badge>
      </div>
      <div className="font-display text-base font-semibold">
        {a?.asset_name || "Hero illustration"}
      </div>
      <div className="space-y-2">
        <CommentBubble
          who="Sienna · Acme Studios"
          time="3 hrs ago"
          text="Love the direction — can we try a warmer palette? The current blue feels too corporate."
        />
        <div className="pl-4 text-[11px] text-muted-foreground font-mono">
          → Relayed to Nifty:{" "}
          <code className="bg-secondary px-1 rounded">
            [Feedback from Sienna] Love the direction — can we try a warmer palette? …
          </code>
        </div>
        <CommentBubble
          who="Designer (you)"
          time="just now"
          text="On it — uploading v3 with a sunset-toned palette in 15."
          mine
        />
      </div>
      <div className="text-xs text-muted-foreground pt-2 border-t border-border">
        Approval Studio webhook → us → Nifty task comment, in &lt;1.5s.
      </div>
    </div>
  );
}

function UrgentPreview({ data }) {
  const u =
    data?.featured?.urgent ||
    (data?.escalations || []).find(
      (e) => e.escalation_type === "urgent" && e.status === "open"
    );
  return (
    <div className="space-y-3" data-testid="tour-preview-urgent">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          /admin/support-triage · live
        </div>
        <Badge className="bg-rose-100 text-rose-900 border-0 text-[10px]">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Urgent
        </Badge>
      </div>
      <div className="font-display text-base font-semibold">
        🚨 URGENT SUPPORT — {u?.subject || "Checkout broken on Safari mobile"}
      </div>
      <div className="text-xs text-muted-foreground">
        {u?.client_name || "Sienna at Acme Studios"} · 47 seconds ago
      </div>
      <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 text-xs space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-rose-900 font-mono">
          Auto-created Nifty task
        </div>
        <div className="font-medium">Title: 🚨 URGENT SUPPORT — {u?.subject?.slice(0, 40) || "…"}</div>
        <div className="text-muted-foreground">Assignee: PM Team · Due: today · Custom field: <code>ThriveDesk_Ticket_ID = {u?.ticket_id || "td_72184"}</code></div>
      </div>
      <div className="text-xs text-muted-foreground pt-2 border-t border-border">
        Rule engine: subject contains <code className="text-[10px] bg-secondary px-1 rounded">urgent</code> OR tag <code className="text-[10px] bg-secondary px-1 rounded">High Priority</code> → escalate.
      </div>
    </div>
  );
}

function SlackPreview() {
  return (
    <div className="space-y-3" data-testid="tour-preview-slack">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          # urgent-support · Slack
        </div>
        <Badge className="bg-[#4A154B] text-white border-0 text-[10px]">
          <Hash className="h-3 w-3 mr-1" />
          Live
        </Badge>
      </div>
      <div className="rounded-lg border border-border bg-[#1A1D21] text-white p-3 space-y-2 text-xs">
        <div className="flex items-baseline gap-2">
          <div className="h-7 w-7 rounded bg-gradient-to-br from-[#1E3A8A] to-[#3B82F6] flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            BL
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">Bloom Labs Alerts</span>
              <span className="text-[10px] text-white/40">APP · just now</span>
            </div>
            <div className="mt-1 leading-relaxed">
              🚨 URGENT: <strong>Sienna at Acme Studios</strong> — Checkout broken on Safari mobile
            </div>
            <div className="mt-1.5 text-[#36C5F0]">
              <a className="underline hover:text-white" href="#">View in ThriveDesk</a>
              <span className="mx-1.5 text-white/40">·</span>
              <a className="underline hover:text-white" href="#">View in Nifty</a>
            </div>
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground pt-2 border-t border-border">
        Median delivery time: <strong className="text-foreground">820ms</strong> from ticket creation. Your on-call PM acks before the customer&apos;s auto-acknowledgement email even renders.
      </div>
    </div>
  );
}

function ResolvePreview({ data }) {
  const r =
    (data?.escalations || []).find((e) => e.status === "closed") ||
    (data?.escalations || []).find((e) => e.status === "resolved");
  return (
    <div className="space-y-3" data-testid="tour-preview-resolve">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          Resolution timeline · escalation
        </div>
        <Badge className="bg-emerald-100 text-emerald-900 border-0 text-[10px]">
          <CheckCheck className="h-3 w-3 mr-1" />
          Closed
        </Badge>
      </div>
      <div className="font-display text-base font-semibold">
        {r?.subject || "Invoice question — fixed already"}
      </div>
      <ol className="relative border-l border-border ml-3 space-y-3 text-xs">
        <TimelineDot color="rose">PM merged the fix in Nifty</TimelineDot>
        <TimelineDot color="violet">Auto-reply posted in ThriveDesk: <em>&quot;We&apos;ve resolved your request! …&quot;</em></TimelineDot>
        <TimelineDot color="emerald">Client portal milestone → <strong>complete</strong></TimelineDot>
        <TimelineDot color="blue">ThriveDesk ticket → <strong>closed</strong></TimelineDot>
      </ol>
      <div className="text-xs text-muted-foreground pt-2 border-t border-border">
        Nifty custom field <code className="text-[10px] bg-secondary px-1 rounded">Close Ticket: Yes</code> auto-closes the ticket. Otherwise, ticket stays open for follow-up.
      </div>
    </div>
  );
}

function CommentBubble({ who, time, text, mine }) {
  return (
    <div
      className={`rounded-xl p-2.5 text-xs ${
        mine
          ? "bg-[#1E3A8A]/10 border border-[#1E3A8A]/20"
          : "bg-secondary border border-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{who}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{time}</span>
      </div>
      <div className="mt-1 text-foreground/80">{text}</div>
    </div>
  );
}

function TimelineDot({ children, color }) {
  const colors = {
    rose: "bg-rose-500",
    violet: "bg-violet-500",
    emerald: "bg-emerald-500",
    blue: "bg-blue-500",
  };
  return (
    <li className="pl-4 relative">
      <span
        className={`absolute -left-1.5 top-1.5 h-3 w-3 rounded-full ${colors[color]} ring-2 ring-background`}
      />
      <span className="text-foreground/80">{children}</span>
    </li>
  );
}

function Field({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
