/**
 * Gym Owners — Page 1 (Hero / Sales).
 * URL: /gym-owners
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowDown,
  Calendar,
  AlertCircle,
  DollarSign,
  Eye,
  Activity,
  Bell,
  BarChart3,
  Check,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Clock,
  ChevronDown,
  Star,
  Flame,
  CreditCard,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import GymLayout from "./GymLayout";
import { SimpleROICalculator } from "./components/ROICalculator";
import GymCheckoutDialog from "./components/GymCheckoutDialog";

const TIDYCAL = BRAND.tidycal;

// --------------------------------------------------------------------------
export default function GymHeroPage() {
  return (
    <GymLayout breadcrumb="Overview">
      <Hero />
      <ProblemSection />
      <SolutionSection />
      <OfferSection />
      <ROISection />
      <SocialProofSection />
      <FAQSection />
      <FinalCTASection />
    </GymLayout>
  );
}

// --------------------------------------------------------------------------
function Hero() {
  return (
    <section
      className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white"
      data-testid="gym-hero-section"
    >
      {/* Background imagery */}
      <div
        className="absolute inset-0 opacity-25 mix-blend-luminosity bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1900&q=80')",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-10 py-20 md:py-28">
        <div className="max-w-3xl">
          <div
            className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-6"
            data-testid="gym-hero-badge"
          >
            <Flame className="h-3.5 w-3.5" />
            Built for independent gym owners
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
            Stop losing gym members.{" "}
            <span className="text-emerald-400">Build a system that keeps them.</span>
          </h1>
          <p className="mt-6 text-lg text-slate-300 max-w-2xl leading-relaxed">
            Custom software that automates member follow-ups and reduces churn by{" "}
            <strong className="text-white">20–30% in 60 days</strong>. Built specifically for
            your gym — not a template. Ready in 3–4 weeks.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3">
            <a
              href={TIDYCAL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="gym-hero-cta-primary"
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3.5 rounded-md text-base shadow-lg shadow-orange-500/20 transition"
            >
              <Calendar className="h-4 w-4" />
              Schedule Free Strategy Call
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              to="/gym-owners/how-it-works"
              data-testid="gym-hero-cta-secondary"
              className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold px-6 py-3.5 rounded-md text-base transition"
            >
              See how it works
            </Link>
          </div>

          <div className="mt-10 flex items-center gap-6 text-sm text-slate-400">
            <Stat tone="emerald" big="80%" label="retention rate" />
            <Stat tone="emerald" big="2 mo" label="payback" />
            <Stat tone="emerald" big="$2–4K" label="recovered / mo" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ big, label, tone }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`font-bold text-2xl ${tone === "emerald" ? "text-emerald-400" : "text-white"} tabular-nums`}>
        {big}
      </span>
      <span className="text-xs uppercase tracking-wider text-slate-500 leading-tight">{label}</span>
    </div>
  );
}

// --------------------------------------------------------------------------
function ProblemSection() {
  return (
    <section className="py-20 bg-white" data-testid="gym-problem-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <AlertCircle className="h-3.5 w-3.5" />
            The uncomfortable truth
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-slate-900 leading-tight">
            The #1 problem every gym owner faces — but won't admit.
          </h2>
        </div>

        <div className="mt-12 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100/50 border border-rose-200 p-8 md:p-10">
              <div className="text-7xl md:text-8xl font-bold text-rose-600 tabular-nums leading-none">
                30–40%
              </div>
              <p className="mt-3 text-xl text-slate-900 font-semibold">
                of new members cancel in the first 90 days
              </p>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                And in most gyms, nobody notices until the credit-card bounces.
                There's no system catching it. No follow-up. No data.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <PainPoint
              icon={Eye}
              title="No follow-up system"
              body="Members go silent. You never know why. By the time you check in, they've already moved on to your competitor."
            />
            <PainPoint
              icon={DollarSign}
              title="Lost revenue, every month"
              body="$500–$2,000 walks out the door per lost member. Five of those a month and you're down $30K+/year — quietly."
            />
            <PainPoint
              icon={BarChart3}
              title="Flying blind on what works"
              body="No data on engagement, retention, or class performance. You're guessing instead of operating. Decisions feel like coin-flips."
            />
          </div>
        </div>

        {/* Spreadsheet vs Dashboard */}
        <div className="mt-16 grid md:grid-cols-2 gap-6">
          <div className="rounded-xl border-2 border-rose-200 bg-rose-50/30 p-5">
            <div className="text-xs uppercase tracking-wider text-rose-700 font-semibold mb-2">
              How you operate today
            </div>
            <div className="font-mono text-[11px] text-slate-700 space-y-0.5 bg-white border border-rose-100 rounded p-3">
              <div className="text-slate-400">members.xlsx — last saved 14d ago</div>
              <div>A1: Name · B1: Email · C1: Last seen?</div>
              <div className="text-rose-600">A2: Sarah K. · B2: ??? · C2: idk</div>
              <div className="text-rose-600">A3: Mike R. · B3: cancel? · C3: 3wks?</div>
              <div className="text-rose-600">A4: Jenna L. · B4: ??? · C4: ???</div>
              <div>A5: ...</div>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Manual, error-prone, always out of date.
            </p>
          </div>
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/30 p-5">
            <div className="text-xs uppercase tracking-wider text-emerald-700 font-semibold mb-2">
              How it could work
            </div>
            <div className="text-[11px] bg-white border border-emerald-100 rounded p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">Sarah K.</span>
                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-semibold">ACTIVE · 12 visits</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Mike R.</span>
                <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-semibold">AT RISK · 14d quiet</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Jenna L.</span>
                <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] font-semibold">CHURN ALERT · auto-email sent</span>
              </div>
              <div className="flex items-center justify-between text-slate-400 italic">
                <span>23 more rows</span>
                <span>auto-refreshed 2m ago</span>
              </div>
            </div>
            <p className="text-xs text-emerald-700 mt-3 font-medium">
              ✓ Visible. ✓ Automatic. ✓ Always current.
            </p>
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
      icon: Activity,
      title: "Member tracking",
      body: "Live dashboard. Every member tagged green / yellow / red. You see the whole gym in one screen.",
      color: "from-emerald-500 to-teal-600",
    },
    {
      icon: Bell,
      title: "Automated reminders",
      body: "Inactive 14 days → re-engagement email. New member → onboarding sequence. Set once, runs 24/7.",
      color: "from-blue-600 to-indigo-700",
    },
    {
      icon: BarChart3,
      title: "Real analytics",
      body: "Retention rate. Churn predictors. Class popularity. Revenue impact. Decisions based on data, not guesses.",
      color: "from-orange-500 to-amber-600",
    },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="gym-solution-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            What we build
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-slate-900 leading-tight">
            What if you could automate <span className="text-emerald-600">all of it?</span>
          </h2>
          <p className="mt-5 text-lg text-slate-600 max-w-2xl leading-relaxed">
            One custom-built platform that replaces the spreadsheets, the
            sticky-notes, and the dozen browser tabs. Designed around{" "}
            <em>your</em> workflow — not a template you have to bend yourself
            around.
          </p>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="group bg-white rounded-2xl p-7 border border-slate-200 hover:border-blue-300 hover:shadow-xl transition-all duration-300"
              data-testid={`gym-feature-${f.title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div
                className={`h-14 w-14 rounded-xl bg-gradient-to-br ${f.color} text-white grid place-items-center mb-5 group-hover:scale-110 transition-transform`}
              >
                <f.icon className="h-7 w-7" />
              </div>
              <h3 className="font-semibold text-xl text-slate-900">{f.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed mt-2">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/gym-owners/how-it-works"
            className="inline-flex items-center gap-2 text-blue-700 font-semibold hover:gap-3 transition-all"
          >
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
      key: "gym_express",
      name: "Express Launch",
      price: "$5,995",
      timeline: "10–14 days",
      sub: "Perfect for quick wins",
      features: [
        "Member management dashboard",
        "Automated email sequences",
        "Basic analytics",
        "30-day support",
      ],
      featured: false,
    },
    {
      key: "gym_custom",
      name: "Custom Build",
      price: "$8,995",
      timeline: "20–28 days",
      sub: "Complete solution · most popular",
      features: [
        "Everything in Express",
        "Lead-capture funnel",
        "Payment integration (Stripe/Square)",
        "Member mobile app",
        "Advanced analytics + churn predictor",
        "60-day support",
      ],
      featured: true,
    },
    {
      key: "gym_enterprise",
      name: "Enterprise",
      price: "$14,995",
      timeline: "28–35 days",
      sub: "For multi-location operators",
      features: [
        "Everything in Custom Build",
        "Multi-location support",
        "Predictive analytics + cohort modelling",
        "White-label option",
        "Additional revenue-stream module",
      ],
      featured: false,
    },
  ];
  return (
    <section className="py-20 bg-white" data-testid="gym-offer-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <DollarSign className="h-3.5 w-3.5" />
            Investment
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-slate-900 leading-tight">
            Three ways to start. All ship in under 5 weeks.
          </h2>
          <p className="mt-5 text-lg text-slate-600">
            Pick the scope. Pay securely via PayPal. Payback in 1–2 months on every tier.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {tiers.map((t) => (
            <div
              key={t.key}
              className={`rounded-2xl p-7 border-2 relative transition flex flex-col ${
                t.featured
                  ? "border-blue-700 bg-gradient-to-br from-blue-50 to-white shadow-xl scale-[1.02]"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
              data-testid={`gym-tier-${t.key}`}
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
                  data-testid={`gym-tier-pay-${t.key}`}
                  className={`inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-md font-semibold text-sm transition ${
                    t.featured
                      ? "bg-blue-700 hover:bg-blue-800 text-white"
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
                  data-testid={`gym-tier-cta-${t.key}`}
                  className="inline-flex items-center justify-center gap-1.5 w-full px-5 py-2 rounded-md font-medium text-xs text-slate-600 hover:text-slate-900 transition"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Or talk first — book a call
                </a>
              </div>
            </div>
          ))}
        </div>

        <GymCheckoutDialog
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
    <section className="py-20 bg-slate-50" data-testid="gym-roi-section">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <TrendingUp className="h-3.5 w-3.5" />
            Run your own numbers
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            How much is churn quietly costing you?
          </h2>
        </div>
        <SimpleROICalculator />
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function SocialProofSection() {
  return (
    <section className="py-20 bg-white" data-testid="gym-social-proof">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="grid md:grid-cols-3 gap-6 text-center">
          <BigStat
            big="80%"
            label="member retention"
            sub="vs 60% industry average"
            tone="emerald"
          />
          <BigStat
            big="2 mo"
            label="system payback"
            sub="on the Custom Build tier"
            tone="blue"
          />
          <BigStat
            big="$2–4K"
            label="recovered / month"
            sub="typical gym, 60 days post-launch"
            tone="orange"
          />
        </div>

        <div className="mt-16 max-w-3xl mx-auto">
          <div className="rounded-2xl bg-slate-900 text-white p-8 md:p-10 relative">
            <div className="flex gap-0.5 mb-4">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 text-amber-400 fill-amber-400" />
              ))}
            </div>
            <p className="text-lg md:text-xl leading-relaxed">
              "Before: we had no idea why members were leaving. After:
              we're tracking engagement, sending targeted follow-ups,
              and kept{" "}
              <strong className="text-emerald-400">85% of new members</strong>{" "}
              this quarter (vs 60% before)."
            </p>
            <div className="mt-5 text-sm text-slate-400">
              — <em>Composite from launch interviews · representative gym profile</em>
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
    blue: "text-blue-700",
    orange: "text-orange-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8">
      <div className={`text-6xl font-bold tabular-nums ${tones[tone]}`}>{big}</div>
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
      q: "How do I know this will actually work for my gym?",
      a: "We build the software — you run the business model. If you follow up with members systematically (which the system makes automatic), you WILL see results. That's how every gym with a real retention system works. Backed by a 30-day money-back guarantee.",
    },
    {
      q: "What if I'm not happy with it?",
      a: "30-day money-back guarantee. Use the system for a month. If you hate it, we refund your money. No questions, no forms, no salvage-call.",
    },
    {
      q: "How long does it take to build?",
      a: "20–28 days for a complete Custom Build. You see a working prototype in week 2 and go live by week 4. Express tier ships in 10–14 days.",
    },
    {
      q: "Do I need technical skills?",
      a: "No. We handle every line of code, every integration, every deployment. Your only job is to show us how your gym actually works and give feedback at two checkpoints. Roughly 1 hour per week of your time.",
    },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="gym-faq-section">
      <div className="max-w-3xl mx-auto px-6 lg:px-10">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 text-center mb-12">
          Common questions, answered.
        </h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 bg-white overflow-hidden"
              data-testid={`gym-faq-item-${i}`}
            >
              <button
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
                onClick={() => setOpen(open === i ? -1 : i)}
                data-testid={`gym-faq-toggle-${i}`}
              >
                <span className="font-semibold text-slate-900">{f.q}</span>
                <ChevronDown
                  className={`h-5 w-5 text-slate-400 flex-shrink-0 transition-transform ${
                    open === i ? "rotate-180" : ""
                  }`}
                />
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
      className="relative overflow-hidden py-20 bg-gradient-to-br from-blue-900 via-blue-950 to-slate-950 text-white"
      data-testid="gym-final-cta"
    >
      <div className="absolute inset-0 opacity-10 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=1900&q=80')" }} />
      <div className="relative max-w-4xl mx-auto px-6 lg:px-10 text-center">
        <div className="inline-flex items-center gap-1.5 bg-orange-500/20 border border-orange-400/40 text-orange-300 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-5">
          <Flame className="h-3.5 w-3.5" />
          Limited capacity
        </div>
        <h2 className="font-display text-3xl md:text-5xl font-bold leading-tight">
          We're taking <span className="text-emerald-400">3 gym projects</span> this month.<br />
          1 spot left.
        </h2>
        <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto">
          Early-bird rate: <strong className="text-white">$7,995</strong> if we start this week.
          After this month: $9,995+. Summer season starts in 6 weeks —
          implement in May, capture new members in June. Your competition won't wait.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={TIDYCAL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="gym-final-cta-button"
            className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-7 py-4 rounded-md text-base shadow-2xl shadow-orange-500/30 transition"
          >
            <Calendar className="h-5 w-5" />
            Lock In Early-Bird Rate
            <ArrowRight className="h-5 w-5" />
          </a>
          <Link
            to="/gym-owners/process"
            className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold px-7 py-4 rounded-md text-base transition"
          >
            See our 4-week process
          </Link>
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          30-day money-back guarantee · No technical skills required · 1-hour weekly commitment
        </div>
      </div>
    </section>
  );
}
