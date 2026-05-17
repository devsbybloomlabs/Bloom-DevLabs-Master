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
      <PreQualSection />
      <ProblemSection />
      <SolutionSection />
      <OfferSection />
      <ReferralSection />
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
            Stop losing <span className="text-emerald-400">$500–$2,000/month</span> to member churn.
          </h1>
          <p className="mt-6 text-lg text-slate-300 max-w-2xl leading-relaxed">
            Choose your path: <strong className="text-white">test-drive in 1 day</strong> or{" "}
            <strong className="text-white">full system in 3 weeks</strong>. Built specifically
            for your gym — not a template.
          </p>

          {/* Dual-path mini cards */}
          <div className="mt-7 grid sm:grid-cols-2 gap-3 max-w-2xl">
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4" data-testid="gym-hero-path-prototype">
              <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold">Path A · prototype</div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">$2,995</div>
              <div className="text-xs text-slate-300 mt-0.5">See it in 24 hours</div>
            </div>
            <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 p-4" data-testid="gym-hero-path-full">
              <div className="text-[10px] uppercase tracking-wider text-blue-300 font-bold">Path B · full build</div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">$8,995</div>
              <div className="text-xs text-slate-300 mt-0.5">Launch in 3 weeks</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            → or start with the prototype, upgrade later (we credit $1,000 if you do, within 14 days).
          </p>

          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <a
              href="#offer"
              data-testid="gym-hero-cta-primary"
              className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-6 py-3.5 rounded-md text-base shadow-lg shadow-emerald-500/20 transition"
            >
              See the prototype first
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={TIDYCAL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="gym-hero-cta-secondary"
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3.5 rounded-md text-base shadow-lg shadow-orange-500/20 transition"
            >
              <Calendar className="h-4 w-4" />
              Build full system — book call
            </a>
          </div>

          <div className="mt-10 flex items-center gap-6 text-sm text-slate-400">
            <Stat tone="emerald" big="20-30%" label="churn reduction" />
            <Stat tone="emerald" big="3 mo" label="payback" />
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
function PreQualSection() {
  const items = [
    "You're losing $1K+ monthly to member churn (real, recoverable revenue)",
    "You're ready to launch a system by end of May",
    "You're willing to invest $2,995–$8,995 depending on your needs",
  ];
  return (
    <section className="py-16 bg-white" data-testid="gym-prequal-section">
      <div className="max-w-4xl mx-auto px-6 lg:px-10">
        <div className="rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 p-8 md:p-12">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
            Before we go further — is this right for you?
          </h2>
          <p className="mt-3 text-base text-slate-600">
            This system works best if you check all three boxes:
          </p>
          <ul className="mt-6 space-y-3">
            {items.map((it, i) => (
              <li
                key={i}
                className="flex gap-3 items-start text-slate-800"
                data-testid={`gym-prequal-item-${i}`}
              >
                <div className="h-6 w-6 rounded-full bg-emerald-100 grid place-items-center flex-shrink-0">
                  <Check className="h-3.5 w-3.5 text-emerald-700" strokeWidth={3} />
                </div>
                <span className="text-base leading-relaxed pt-0.5">{it}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-slate-500 italic leading-relaxed">
            If that's you, keep reading. If not — no hard feelings, good luck
            with your gym. We'd rather you find the right tool than burn
            your time.
          </p>
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
      key: "gym_prototype",
      name: "Prototype",
      price: "$2,995",
      timeline: "24 hours",
      sub: "Test-drive risk-free",
      features: [
        "Working dashboard (member tracking)",
        "1 automated-email template",
        "Discovery call + demo session",
        "$1,000 credit toward full build if upgrading within 14 days",
      ],
      featured: false,
    },
    {
      key: "gym_custom",
      name: "Full Build",
      price: "$8,995",
      timeline: "3 weeks",
      sub: "Complete solution · most popular",
      features: [
        "Custom member-management dashboard",
        "Full email automation engine",
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
      timeline: "4–5 weeks",
      sub: "For multi-location operators",
      features: [
        "Everything in Full Build",
        "Multi-location support",
        "Predictive analytics + cohort modelling",
        "White-label option",
        "Additional revenue-stream module",
      ],
      featured: false,
    },
  ];
  return (
    <section id="offer" className="py-20 bg-white" data-testid="gym-offer-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <DollarSign className="h-3.5 w-3.5" />
            Investment
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-slate-900 leading-tight">
            Choose your path. Both launch by end of May.
          </h2>
          <p className="mt-5 text-lg text-slate-600">
            Start with the <strong>prototype</strong> ($2,995) to see it work in
            your gym — then upgrade with a <strong className="text-emerald-700">$1,000 credit</strong>.
            Or go straight to the <strong>full build</strong> ($8,995). Both
            include Year 1 build + training + 60-day support.
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

        {/* Year-1 / Year-2+ callout */}
        <div className="mt-14 grid md:grid-cols-2 gap-4 max-w-4xl mx-auto" data-testid="gym-year-model">
          <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-6">
            <div className="text-[10px] uppercase tracking-wider text-blue-700 font-bold">Year 1 — what's included</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> Custom build + deployment</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> Team training session</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> 60-day optimisation + support</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> 12 months of system access</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6">
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">Year 2+ — maintenance retainer</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> System stays live + updated</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> Access to every feature you built</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> Dashboard-based feature upgrades</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> Ongoing support, no surprises</li>
            </ul>
            <p className="text-xs text-slate-500 italic mt-3">Retainer is a fraction of Year-1 build cost. Cancel anytime.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function ReferralSection() {
  return (
    <section className="py-20 bg-gradient-to-br from-emerald-50 via-white to-blue-50" data-testid="gym-referral-section">
      <div className="max-w-4xl mx-auto px-6 lg:px-10">
        <div className="rounded-3xl bg-white border-2 border-emerald-200 p-8 md:p-12 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center text-white flex-shrink-0">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">Referral program</div>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-slate-900 leading-tight mt-1">
                Refer a gym. Get <span className="text-emerald-600">$1,000 credit</span>.
              </h2>
              <p className="mt-4 text-base text-slate-600 leading-relaxed">
                Once your system launches, you'll know 2–3 other gym owners with
                the same churn problem. Here's the deal:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li className="flex gap-2"><span className="text-emerald-600 font-bold">1.</span> You mention us. That's it.</li>
                <li className="flex gap-2"><span className="text-emerald-600 font-bold">2.</span> They book a discovery call.</li>
                <li className="flex gap-2"><span className="text-emerald-600 font-bold">3.</span> If they sign this month, we credit your next month's fee <strong>$1,000</strong>.</li>
              </ul>
              <div className="mt-5 grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">Prototype path</div>
                  <div className="text-sm text-slate-800 mt-1">$2,995 → <strong>basically free</strong> with one referral</div>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">Full Build path</div>
                  <div className="text-sm text-slate-800 mt-1">$8,995 → <strong>$7,995</strong> per referral</div>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500 italic">
                No limits. Refer as many as you want. We'll track it for you.
              </p>
            </div>
          </div>
        </div>
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
            big="47%"
            label="avg. churn reduction"
            sub="across the member-management methodology"
            tone="emerald"
          />
          <BigStat
            big="3 mo"
            label="average payback period"
            sub="on the Custom Build tier"
            tone="blue"
          />
          <BigStat
            big="92%"
            label="go-live success rate"
            sub="of projects launch on schedule"
            tone="orange"
          />
        </div>

        <p className="text-center text-xs text-slate-500 mt-6 italic max-w-2xl mx-auto">
          Projected based on our member-management methodology and category
          benchmarks · live customer results coming Q2.
        </p>

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
              and going from losing 8 members a month to 2 — that's
              <strong className="text-emerald-400"> $4,000 in new recurring revenue</strong>."
            </p>
            <div className="mt-5 text-sm text-slate-400">
              — <em>Composite quote drawn from launch interviews · representative gym profile</em>
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
      q: "Why is the prototype so cheap?",
      a: "We use that 1 day to understand your gym. You see how we work. Most say yes to the full build because they see it works — it's a proof-of-concept, not the full product. Think of it as paid due diligence on both sides.",
    },
    {
      q: "Can I upgrade from the prototype to the full system later?",
      a: "Yes — and we'll credit $1,000 toward the full build if you upgrade within 14 days of receiving the prototype. After that, full price ($8,995). So decide fast if you want the discount.",
    },
    {
      q: "What if the prototype doesn't work for my gym?",
      a: "Then you've spent $2,995 to find out. You still keep the prototype — it does basic member tracking + email automations, which is more than most gyms have. But realistically, if the prototype doesn't earn its keep, the full build won't either, and we'll tell you on the upgrade call.",
    },
    {
      q: "What if I do the prototype and don't upgrade?",
      a: "No pressure. You keep the prototype system. It still tracks members and sends automated emails. Just less powerful than the full build. Many gyms run on just the prototype and get decent results — but most see enough potential to upgrade.",
    },
    {
      q: "This looks expensive — is it worth it?",
      a: "For every 5 members you keep that would've otherwise left, that's $500–$1,000 / month in new recurring revenue. The prototype pays back in <1 month, the full build in 1–2 months. After that, it's pure margin — year 2+ is recurring upside on a small maintenance retainer.",
    },
    {
      q: "What happens after Year 1?",
      a: "Your system stays live. You pay an annual maintenance retainer (a fraction of the Year-1 build cost) which keeps it updated + gives you access to dashboard-based feature upgrades. Many clients add features as their gym grows — multi-location, advanced analytics, marketing automation.",
    },
    {
      q: "Will this work with my existing software (Mindbody, Zen Planner, ClassPass)?",
      a: "Most gyms run on one of those plus a payment processor. We integrate directly — no manual data entry, no ripping out what works. It plugs into what you already use during the Week-1 discovery.",
    },
    {
      q: "What if I'm not happy with it?",
      a: "You approve each phase before we move forward, and the 50/50 split protects you — the second half is only due once the system is live and you've signed off. If we ever can't deliver what we scoped, we refund the unfulfilled portion. Prototype-to-full-build upgraders get their $2,995 rolled forward as $1,000 credit applied to the full build.",
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
          We're taking only <span className="text-emerald-400">3–4 gym projects</span> this month.
        </h2>
        <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto">
          Early-bird rate locked in if we start this week. After{" "}
          <strong className="text-white">May 31</strong>, pricing increases.
          Summer's coming — gyms that launch by end of May are ready for peak
          season. Those waiting until July miss the window.
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
            Schedule a 30-min Discovery Call
            <ArrowRight className="h-5 w-5" />
          </a>
          <Link
            to="/gym-owners/process"
            className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold px-7 py-4 rounded-md text-base transition"
          >
            See our 3-week process
          </Link>
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          No sales pitch · Approve each phase before paying · 1-hour weekly commitment
        </div>
      </div>
    </section>
  );
}
