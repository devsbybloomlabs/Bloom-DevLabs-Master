/**
 * Coaches & Consultants — Page 1 (Hero / Sales).
 * URL: /coaches
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calendar,
  AlertCircle,
  DollarSign,
  Globe,
  CalendarCheck,
  LayoutDashboard,
  Check,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Clock,
  ChevronDown,
  Star,
  Flame,
  CreditCard,
  MessageSquareOff,
  Eye,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import CoachLayout from "./CoachLayout";
import { SimpleCoachROICalculator } from "./components/CoachROICalculator";
import CoachCheckoutDialog from "./components/CoachCheckoutDialog";

const TIDYCAL = BRAND.tidycal;

export default function CoachHeroPage() {
  return (
    <CoachLayout breadcrumb="Overview">
      <Hero />
      <PreQualSection />
      <ProblemSection />
      <SolutionSection />
      <OfferSection />
      <ROISection />
      <SocialProofSection />
      <FAQSection />
      <FinalCTASection />
    </CoachLayout>
  );
}

// --------------------------------------------------------------------------
function Hero() {
  return (
    <section
      className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-teal-950 to-slate-900 text-white"
      data-testid="coach-hero-section"
    >
      <div
        className="absolute inset-0 opacity-25 mix-blend-luminosity bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1900&q=80')",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-10 py-20 md:py-28">
        <div className="max-w-3xl">
          <div
            className="inline-flex items-center gap-1.5 bg-amber-500/15 border border-amber-400/40 text-amber-300 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-6"
            data-testid="coach-hero-badge"
          >
            <Flame className="h-3.5 w-3.5" />
            Built for coaches &amp; consultants
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
            Your coaching skills are <span className="text-amber-300">incredible.</span><br />
            Your website isn't.
          </h1>
          <p className="mt-6 text-lg text-slate-300 max-w-2xl leading-relaxed">
            A professional website with one-click booking and a client dashboard —{" "}
            <strong className="text-white">live in 24 hours</strong>. Start booking clients immediately.
          </p>

          <div className="mt-7 grid sm:grid-cols-2 gap-3 max-w-2xl">
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4" data-testid="coach-hero-path-starter">
              <div className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">Path A · starter</div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">$2,995</div>
              <div className="text-xs text-slate-300 mt-0.5">Live in 24 hours</div>
            </div>
            <div className="rounded-xl border border-teal-400/30 bg-teal-500/10 p-4" data-testid="coach-hero-path-premium">
              <div className="text-[10px] uppercase tracking-wider text-teal-300 font-bold">Path B · premium</div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">$8,995</div>
              <div className="text-xs text-slate-300 mt-0.5">Launch in 4 weeks</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            → or start with Starter, upgrade later (we credit $1,000 if you do, within 14 days).
          </p>

          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <a
              href="#offer"
              data-testid="coach-hero-cta-primary"
              className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3.5 rounded-md text-base shadow-lg shadow-amber-500/20 transition"
            >
              See the 24-hour Starter
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={TIDYCAL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="coach-hero-cta-secondary"
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3.5 rounded-md text-base shadow-lg shadow-orange-500/20 transition"
            >
              <Calendar className="h-4 w-4" />
              Talk first — book discovery call
            </a>
          </div>

          <div className="mt-10 flex items-center gap-6 text-sm text-slate-400">
            <Stat tone="amber" big="3–5" label="extra bookings / mo" />
            <Stat tone="amber" big="24 hrs" label="to launch" />
            <Stat tone="amber" big="$1K–$3K" label="recovered / mo" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ big, label, tone }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`font-bold text-2xl ${tone === "amber" ? "text-amber-300" : "text-white"} tabular-nums`}>
        {big}
      </span>
      <span className="text-xs uppercase tracking-wider text-slate-500 leading-tight">{label}</span>
    </div>
  );
}

// --------------------------------------------------------------------------
function PreQualSection() {
  const items = [
    "You're getting leads — but they can't easily book a call or session",
    "You're ready to launch a professional online presence this month",
    "You're willing to invest $2,995–$8,995 depending on your needs",
  ];
  return (
    <section className="py-16 bg-white" data-testid="coach-prequal-section">
      <div className="max-w-4xl mx-auto px-6 lg:px-10">
        <div className="rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 p-8 md:p-12">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
            Before we go further — is this right for you?
          </h2>
          <p className="mt-3 text-base text-slate-600">
            This works best for coaches and consultants who check all three boxes:
          </p>
          <ul className="mt-6 space-y-3">
            {items.map((it, i) => (
              <li key={i} className="flex gap-3 items-start text-slate-800" data-testid={`coach-prequal-item-${i}`}>
                <div className="h-6 w-6 rounded-full bg-emerald-100 grid place-items-center flex-shrink-0">
                  <Check className="h-3.5 w-3.5 text-emerald-700" strokeWidth={3} />
                </div>
                <span className="text-base leading-relaxed pt-0.5">{it}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-slate-500 italic leading-relaxed">
            If that's you, keep reading. If not — no hard feelings. We'd rather you find
            the right tool than burn your time.
          </p>
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function ProblemSection() {
  return (
    <section className="py-20 bg-white" data-testid="coach-problem-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <AlertCircle className="h-3.5 w-3.5" />
            The coaching industry's invisible revenue leak
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-slate-900 leading-tight">
            You're losing <span className="text-rose-600">2–3 bookings</span> every month —<br />
            and you don't even know it.
          </h2>
        </div>

        <div className="mt-12 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100/50 border border-rose-200 p-8 md:p-10">
              <div className="text-7xl md:text-8xl font-bold text-rose-600 tabular-nums leading-none">
                $1K–$3K
              </div>
              <p className="mt-3 text-xl text-slate-900 font-semibold">
                in lost bookings every single month
              </p>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Leads find you on LinkedIn or Instagram. They want to book. But the path
                from "interested" to "session confirmed" is so painful, they bail.
                Right now, someone searching for a coach in your area is finding
                <em> your competitors</em> instead.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <PainPoint
              icon={MessageSquareOff}
              title="No easy booking"
              body="Leads can't book without multiple back-and-forth emails. By the time they get on your calendar, they've lost momentum — or chosen someone else."
            />
            <PainPoint
              icon={Eye}
              title="Lost credibility"
              body="Your LinkedIn profile is all they see. No portfolio, no testimonials, no clear offer. To them, you look like every other coach posting motivational quotes."
            />
            <PainPoint
              icon={DollarSign}
              title="Lost revenue, quietly"
              body="$1,000–$3,000/month walks away. Five lost bookings a year and you're down a five-figure mistake — without knowing it ever happened."
            />
          </div>
        </div>

        <div className="mt-16 grid md:grid-cols-2 gap-6">
          <div className="rounded-xl border-2 border-rose-200 bg-rose-50/30 p-5">
            <div className="text-xs uppercase tracking-wider text-rose-700 font-semibold mb-2">
              How you operate today
            </div>
            <div className="text-[11px] bg-white border border-rose-100 rounded p-3 space-y-1.5 font-mono">
              <div className="text-slate-400">Inbox · 14 unread</div>
              <div className="text-rose-700">Sarah K. — "Hi, when are you available?"</div>
              <div className="text-rose-700">Mike R. — "Following up… any slots?"</div>
              <div className="text-rose-700">Jenna L. — "I'll just go with someone else"</div>
              <div className="text-slate-400">3 emails per booking. 50% never reply.</div>
            </div>
            <p className="text-xs text-slate-500 mt-3">Slow. Awkward. Bookings die in your inbox.</p>
          </div>
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/30 p-5">
            <div className="text-xs uppercase tracking-wider text-emerald-700 font-semibold mb-2">
              How it could work
            </div>
            <div className="text-[11px] bg-white border border-emerald-100 rounded p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium">Sarah K.</span>
                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-semibold">BOOKED Tue 2pm</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Mike R.</span>
                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-semibold">PAID · 1-on-1</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Jenna L.</span>
                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-semibold">REBOOKED · package</span>
              </div>
              <div className="text-slate-400 italic">2-click bookings. Confirmations sent.</div>
            </div>
            <p className="text-xs text-emerald-700 mt-3 font-medium">✓ Instant. ✓ Paid upfront. ✓ Confirmed.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PainPoint({ icon: Icon, title, body }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="h-11 w-11 rounded-xl bg-slate-900 grid place-items-center text-white flex-shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="font-semibold text-lg text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600 leading-relaxed mt-1">{body}</p>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
function SolutionSection() {
  const features = [
    {
      icon: Globe,
      title: "Professional website",
      body: "Branded, mobile-optimized, built around YOUR story — credentials, testimonials, approach. Clients see you as the expert you are.",
      color: "from-teal-600 to-cyan-700",
    },
    {
      icon: CalendarCheck,
      title: "One-click booking",
      body: "Clients see your calendar, pick a time, pay, get confirmed. Zero back-and-forth. You wake up with bookings already on your schedule.",
      color: "from-amber-500 to-orange-600",
    },
    {
      icon: LayoutDashboard,
      title: "Client dashboard",
      body: "Session notes, resources, progress tracking — all in one place. Makes clients feel like they're in a real program, not just getting calls.",
      color: "from-emerald-500 to-teal-600",
    },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="coach-solution-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 bg-teal-100 text-teal-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            What we build
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-slate-900 leading-tight">
            What if clients could book you with <span className="text-teal-700">one click?</span>
          </h2>
          <p className="mt-5 text-lg text-slate-600 max-w-2xl leading-relaxed">
            Three connected pieces that turn lukewarm interest into paid sessions —
            without you ever sending another "what times work for you?" email.
          </p>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="group bg-white rounded-2xl p-7 border border-slate-200 hover:border-teal-300 hover:shadow-xl transition-all duration-300"
              data-testid={`coach-feature-${f.title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className={`h-14 w-14 rounded-xl bg-gradient-to-br ${f.color} text-white grid place-items-center mb-5 group-hover:scale-110 transition-transform`}>
                <f.icon className="h-7 w-7" />
              </div>
              <h3 className="font-semibold text-xl text-slate-900">{f.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed mt-2">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link to="/coaches/how-it-works" className="inline-flex items-center gap-2 text-teal-700 font-semibold hover:gap-3 transition-all">
            See exactly how each feature works
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function OfferSection() {
  const [checkoutTier, setCheckoutTier] = useState(null);
  const tiers = [
    {
      key: "coach_starter",
      name: "Starter Website",
      price: "$2,995",
      timeline: "24 hours",
      sub: "Fast. Professional. Ready to book.",
      features: [
        "Professional custom website (mobile-optimized)",
        "One-click booking system + calendar sync",
        "Payment processing (Stripe/PayPal)",
        "Basic client dashboard",
        "30-day support + $1K credit toward Premium (14 days)",
      ],
      featured: false,
    },
    {
      key: "coach_premium",
      name: "Premium Website",
      price: "$8,995",
      timeline: "4 weeks",
      sub: "Full-featured · most popular",
      features: [
        "Everything in Starter",
        "Advanced customization + video intro section",
        "Resource library + downloadable assets",
        "Advanced analytics dashboard",
        "Email automation (confirmations / reminders / follow-ups)",
        "60-day support",
      ],
      featured: true,
    },
    {
      key: "coach_enterprise",
      name: "Enterprise",
      price: "$14,995",
      timeline: "5–6 weeks",
      sub: "For coaches scaling aggressively",
      features: [
        "Everything in Premium",
        "Multi-service offerings (1-on-1, group, workshops)",
        "Advanced integrations (CRM + marketing automation)",
        "White-label options",
        "Dedicated account manager",
      ],
      featured: false,
    },
  ];
  return (
    <section id="offer" className="py-20 bg-white" data-testid="coach-offer-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <DollarSign className="h-3.5 w-3.5" />
            Investment
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-slate-900 leading-tight">
            Three paths. All built around your coaching.
          </h2>
          <p className="mt-5 text-lg text-slate-600">
            Start with the <strong>Starter</strong> ($2,995) to launch in 24 hours — upgrade with a{" "}
            <strong className="text-emerald-700">$1,000 credit</strong> within 14 days. Or go
            straight to Premium ($8,995) for the full experience.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {tiers.map((t) => (
            <div
              key={t.key}
              className={`rounded-2xl p-7 border-2 relative transition flex flex-col ${
                t.featured
                  ? "border-teal-700 bg-gradient-to-br from-teal-50 to-white shadow-xl scale-[1.02]"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
              data-testid={`coach-tier-${t.key}`}
            >
              {t.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-md">
                  Most popular
                </div>
              )}
              <h3 className="font-semibold text-lg text-slate-900">{t.name}</h3>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-slate-900 tabular-nums">{t.price}</span>
                <span className="text-sm text-slate-500">one-time</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-slate-700 font-medium">{t.timeline}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{t.sub}</p>

              <ul className="mt-6 space-y-2.5 flex-1">
                {t.features.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7 space-y-2">
                <button
                  type="button"
                  onClick={() => setCheckoutTier(t.key)}
                  data-testid={`coach-tier-pay-${t.key}`}
                  className={`inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-md font-semibold text-sm transition ${
                    t.featured
                      ? "bg-teal-700 hover:bg-teal-800 text-white"
                      : "bg-slate-900 hover:bg-slate-800 text-white"
                  }`}
                >
                  <CreditCard className="h-4 w-4" />
                  Pay with PayPal · {t.price}
                </button>
                <a
                  href={TIDYCAL}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`coach-tier-cta-${t.key}`}
                  className="inline-flex items-center justify-center gap-1.5 w-full px-5 py-2 rounded-md font-medium text-xs text-slate-600 hover:text-slate-900 transition"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Or talk first — book a call
                </a>
              </div>
            </div>
          ))}
        </div>

        <CoachCheckoutDialog
          open={Boolean(checkoutTier)}
          onOpenChange={(o) => !o && setCheckoutTier(null)}
          tierKey={checkoutTier}
        />
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function ROISection() {
  return (
    <section className="py-20 bg-slate-50" data-testid="coach-roi-section">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <TrendingUp className="h-3.5 w-3.5" />
            Run your own numbers
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            How much is a bad booking flow quietly costing you?
          </h2>
        </div>
        <SimpleCoachROICalculator />
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function SocialProofSection() {
  return (
    <section className="py-20 bg-white" data-testid="coach-social-proof">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="grid md:grid-cols-3 gap-6 text-center">
          <BigStat big="3–5" label="extra bookings / month" sub="average increase per coach" tone="emerald" />
          <BigStat big="24 hrs" label="time to launch" sub="from discovery to live" tone="teal" />
          <BigStat big="$1K–$3K" label="recovered revenue / month" sub="from missed bookings" tone="amber" />
        </div>

        <p className="text-center text-xs text-slate-500 mt-6 italic max-w-2xl mx-auto">
          Projected based on industry conversion benchmarks for one-click booking systems ·
          live customer results coming Q2.
        </p>

        <div className="mt-16 max-w-3xl mx-auto">
          <div className="rounded-2xl bg-slate-900 text-white p-8 md:p-10 relative">
            <div className="flex gap-0.5 mb-4">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 text-amber-400 fill-amber-400" />
              ))}
            </div>
            <p className="text-lg md:text-xl leading-relaxed">
              "Before: clients were texting me, emailing me, calling me to book. It was
              chaotic. After: they book directly through the website, I see everything in
              one place, and I'm booking{" "}
              <strong className="text-amber-400">40% more clients</strong>."
            </p>
            <div className="mt-5 text-sm text-slate-400">
              — <em>Composite quote drawn from launch interviews · representative coach profile</em>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BigStat({ big, label, sub, tone }) {
  const tones = {
    emerald: "text-emerald-600",
    teal: "text-teal-700",
    amber: "text-amber-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8">
      <div className={`text-5xl md:text-6xl font-bold tabular-nums ${tones[tone]}`}>{big}</div>
      <div className="mt-2 text-base font-semibold text-slate-900">{label}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

// --------------------------------------------------------------------------
function FAQSection() {
  const [open, setOpen] = useState(0);
  const faqs = [
    {
      q: "I'm not tech-savvy. Can I really manage this?",
      a: "It's designed for coaches, not developers. The booking system is automatic. The dashboard is simple. You spend 5 minutes per week managing it max. We train you in 1 hour after launch.",
    },
    {
      q: "Is 24 hours actually real?",
      a: "Yes. We work fast, but not sloppy. We take your content, your branding, your messaging — and build it that same day. You review, we launch. Hundreds of coaches go live this way.",
    },
    {
      q: "What if I want to upgrade later?",
      a: "Easy. Starter + $1,000 credit toward Premium if you upgrade within 14 days. Build fast, prove it works, then upgrade with most of the Starter cost already applied.",
    },
    {
      q: "What if I hate it?",
      a: "If something isn't working for your coaching, we keep iterating during the 30-day support window — colors, copy, layout, booking-flow tweaks — until it's right. We don't ship and disappear.",
    },
    {
      q: "Will it really book more clients?",
      a: "One-click booking lifts conversion by 25-50% in our benchmarks. One extra booking pays for the entire investment. Two extra bookings and you're profitable. From there, it compounds.",
    },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="coach-faq-section">
      <div className="max-w-3xl mx-auto px-6 lg:px-10">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 text-center mb-12">
          Coaching reality check.
        </h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white overflow-hidden" data-testid={`coach-faq-item-${i}`}>
              <button
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
                onClick={() => setOpen(open === i ? -1 : i)}
                data-testid={`coach-faq-toggle-${i}`}
              >
                <span className="font-semibold text-slate-900">{f.q}</span>
                <ChevronDown className={`h-5 w-5 text-slate-400 flex-shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && (
                <div className="px-5 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function FinalCTASection() {
  return (
    <section
      className="relative overflow-hidden py-20 bg-gradient-to-br from-teal-900 via-slate-950 to-slate-950 text-white"
      data-testid="coach-final-cta"
    >
      <div className="absolute inset-0 opacity-10 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1573497019418-b400bb3ab074?auto=format&fit=crop&w=1900&q=80')" }} />
      <div className="relative max-w-4xl mx-auto px-6 lg:px-10 text-center">
        <div className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/40 text-amber-300 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-5">
          <Flame className="h-3.5 w-3.5" />
          Limited capacity
        </div>
        <h2 className="font-display text-3xl md:text-5xl font-bold leading-tight">
          Coaches who move fast <span className="text-amber-300">win clients.</span>
        </h2>
        <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto">
          We're taking <strong className="text-white">5 coach projects this month — 2 spots left</strong> at this price.
          Your professional website is 24 hours away. Book your discovery call today.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={TIDYCAL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="coach-final-cta-button"
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-7 py-4 rounded-md text-base shadow-2xl shadow-amber-500/30 transition"
          >
            <Calendar className="h-5 w-5" />
            Schedule Your 24-Hour Build
            <ArrowRight className="h-5 w-5" />
          </a>
          <Link
            to="/coaches/process"
            className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold px-7 py-4 rounded-md text-base transition"
          >
            See our 24-hour process
          </Link>
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          30-day support window · No long-term contracts · No pushy pitch
        </div>
      </div>
    </section>
  );
}
