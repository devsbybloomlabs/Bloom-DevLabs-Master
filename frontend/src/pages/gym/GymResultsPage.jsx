/**
 * Gym Owners — Page 4 (Customer Journey / Results).
 * URL: /gym-owners/results
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  ArrowRight,
  TrendingUp,
  Clock,
  Users,
  DollarSign,
  ChevronDown,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Zap,
  Target,
  BarChart3,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import GymLayout from "./GymLayout";
import { buildNicheSeo } from "@/lib/seo";
import { DetailedROICalculator } from "./components/ROICalculator";

const TIDYCAL = BRAND.tidycal;

export default function GymResultsPage() {
  return (
    <GymLayout breadcrumb="Results" seo={buildNicheSeo("gym", "Results")}>
      <Hero />
      <ArchetypesSection />
      <NumbersSection />
      <DominoSection />
      <MemberJourneySection />
      <GymTypesSection />
      <ROISection />
      <NextStepsSection />
      <FAQSection />
      <FinalCTA />
    </GymLayout>
  );
}

function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-emerald-950 via-blue-950 to-slate-950 text-white py-20 md:py-24 overflow-hidden">
      <div className="absolute inset-0 opacity-15 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1900&q=80')" }} />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] max-w-3xl">
          What happens when gyms{" "}
          <span className="text-emerald-400">stop losing members</span>.
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-2xl leading-relaxed">
          Three archetypes. The same uncomfortable starting line. Very
          different finish lines 30 days after launch. See where you fit.
        </p>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function ArchetypesSection() {
  const archetypes = [
    {
      name: "The Overwhelmed Owner",
      tone: "rose-to-emerald",
      before: {
        feeling: "I'm drowning in manual work.",
        bullets: [
          "Spreadsheets everywhere",
          "Manual emails (or none)",
          "No idea why members leave",
          "Admin: 8 hours / week",
          "Churn: 40%",
        ],
      },
      after: {
        feeling: "I can finally run my gym instead of drowning in admin.",
        bullets: [
          "Everything in one dashboard",
          "Automated follow-ups running 24/7",
          "Clear visibility into engagement",
          "Admin: 2 hours / week (6 saved!)",
          "Churn: 25%",
        ],
        impact: "$1,200 / month in recovered members",
      },
    },
    {
      name: "The Data-Driven Owner",
      tone: "amber-to-blue",
      before: {
        feeling: "I'm guessing at what actually drives retention.",
        bullets: [
          "Can't see trends",
          "Guessing on retention drivers",
          "No engagement data",
          "Marketing spend: inefficient",
          "Member LTV: unknown",
        ],
      },
      after: {
        feeling: "Every decision is data-backed now.",
        bullets: [
          "Real-time retention analytics",
          "Sees which classes / trainers drive engagement",
          "Tracks signup → cancellation journey",
          "Marketing spend optimised on data",
          "Member LTV quantified & growing",
        ],
        impact: "+15% member value through better targeting",
      },
    },
    {
      name: "The Growth-Focused Owner",
      tone: "slate-to-emerald",
      before: {
        feeling: "Growth feels unsustainable — I'm running on a treadmill.",
        bullets: [
          "High acquisition, high churn",
          "New members leave before ROI",
          "No retention system",
          "Growth feels unsustainable",
        ],
      },
      after: {
        feeling: "Growth feels predictable and scalable.",
        bullets: [
          "Lower acquisition needed (retaining more)",
          "New members in engagement system day 1",
          "Retention compounds member value",
          "Predictable growth curve",
        ],
        impact: "$4,000+ / month in sustainable recurring revenue",
      },
    },
  ];

  return (
    <section className="py-20 bg-white" data-testid="results-archetypes-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <Users className="h-3.5 w-3.5" />
            Three transformations
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            Which one feels like you?
          </h2>
        </div>
        <div className="space-y-10">
          {archetypes.map((a, i) => (
            <ArchetypeCard key={i} {...a} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ArchetypeCard({ name, before, after, index }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm" data-testid={`results-archetype-${index}`}>
      <div className="px-7 md:px-10 py-5 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-slate-900 text-white grid place-items-center font-bold text-sm">
            {index + 1}
          </div>
          <h3 className="font-display text-2xl font-bold text-slate-900">{name}</h3>
        </div>
      </div>
      <div className="grid md:grid-cols-2">
        <div className="p-7 md:p-9 bg-rose-50/30 border-r border-slate-100">
          <div className="flex items-center gap-2 text-rose-700 mb-4">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider font-bold">Before</span>
          </div>
          <p className="text-lg italic text-slate-800 mb-5 leading-relaxed">"{before.feeling}"</p>
          <ul className="space-y-2">
            {before.bullets.map((b, j) => (
              <li key={j} className="flex gap-2 text-sm text-slate-700">
                <span className="text-rose-500 mt-1">·</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-7 md:p-9 bg-emerald-50/30">
          <div className="flex items-center gap-2 text-emerald-700 mb-4">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider font-bold">After · 30 days</span>
          </div>
          <p className="text-lg italic text-slate-800 mb-5 leading-relaxed">"{after.feeling}"</p>
          <ul className="space-y-2">
            {after.bullets.map((b, j) => (
              <li key={j} className="flex gap-2 text-sm text-slate-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {after.impact && (
            <div className="mt-5 inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold px-4 py-2 rounded-lg text-sm shadow-md">
              <DollarSign className="h-4 w-4" />
              {after.impact}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
function NumbersSection() {
  const stats = [
    { big: "47%", label: "avg. churn reduction", sub: "across the methodology", tone: "emerald" },
    { big: "3 mo", label: "average payback period", sub: "from go-live", tone: "blue" },
    { big: "92%", label: "go-live success rate", sub: "projects shipped on time", tone: "orange" },
    { big: "~5 hr / wk", label: "admin time saved", sub: "typical, per owner", tone: "slate" },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="results-numbers-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <BarChart3 className="h-3.5 w-3.5" />
            The numbers
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            What "stops losing members" looks like, in raw math.
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map((s) => (
            <BigNumber key={s.label} {...s} />
          ))}
        </div>
        <p className="text-center text-xs text-slate-500 mt-6 italic max-w-2xl mx-auto">
          Projected based on our member-management methodology and category
          benchmarks · live customer results coming Q2.
        </p>
      </div>
    </section>
  );
}

function BigNumber({ big, label, sub, tone }) {
  const tones = {
    emerald: "text-emerald-600",
    blue: "text-blue-700",
    orange: "text-orange-600",
    slate: "text-slate-900",
  };
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-7 hover:shadow-lg transition" data-testid={`results-stat-${label.replace(/\s+/g, "-")}`}>
      <div className={`text-5xl md:text-6xl font-bold tabular-nums ${tones[tone]} leading-none`}>{big}</div>
      <div className="mt-3 text-base font-semibold text-slate-900">{label}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

// --------------------------------------------------------------------------
function DominoSection() {
  const steps = [
    { icon: BarChart3, title: "System launches", body: "You have visibility into every member, every day." },
    { icon: Target, title: "Visibility", body: "You spot members at risk before they leave." },
    { icon: Zap, title: "Spot early", body: "Automated reminder reaches them in time." },
    { icon: CheckCircle2, title: "Reminder works", body: "They come back, stay engaged." },
    { icon: TrendingUp, title: "More members stay", body: "Monthly revenue increases $2K–$4K." },
    { icon: DollarSign, title: "Revenue increases", body: "You invest in growth, confidently." },
    { icon: Sparkles, title: "Growth accelerates", body: "Business becomes predictable and scalable." },
  ];
  return (
    <section className="py-20 bg-white" data-testid="results-domino-section">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            How one small change creates big results.
          </h2>
          <p className="mt-4 text-base text-slate-600 leading-relaxed">
            Each link in the chain is small. The compounding effect is anything but.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-4 items-start rounded-xl bg-slate-50 border border-slate-100 p-5 hover:border-emerald-300 transition">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-500 grid place-items-center text-white flex-shrink-0 font-bold text-sm">
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <s.icon className="h-4 w-4 text-slate-500" />
                  <h3 className="font-semibold text-slate-900">{s.title}</h3>
                </div>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function MemberJourneySection() {
  const phases = [
    {
      when: "Day 1",
      title: "New member signs up",
      experience: "Welcome email from you (automated)",
      system: "Adds them to engagement tracking",
      outcome: "First touchpoint in their journey",
    },
    {
      when: "Days 2–7",
      title: "Onboarding sequence",
      experience: "Helpful emails: class schedule, intro offer, trainer bios",
      system: "Pre-set sequence fires automatically",
      outcome: "Member feels welcomed and oriented",
    },
    {
      when: "Week 2–4",
      title: "Engagement monitoring",
      experience: "They attend classes; you notice they're engaged",
      system: "Dashboard shows green (ACTIVE) status",
      outcome: "You know they're happy without asking",
    },
    {
      when: "Week 5–8",
      title: "Early-warning system",
      experience: "2 weeks quiet → re-engagement email from you",
      system: "Flagged automatically, email sent",
      outcome: "Most come back before considering cancelling",
    },
    {
      when: "Month 3+",
      title: "Long-term retention",
      experience: "Consistent engagement, community, results",
      system: "Tracks journey, identifies VIPs, surfaces success stories",
      outcome: "Long-term customer + organic referrals",
    },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="results-journey-section">
      <div className="max-w-6xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            How your members experience the system.
          </h2>
          <p className="mt-4 text-base text-slate-600 leading-relaxed">
            Five phases. Each one shows what the member feels, what the system
            does, and what you get out of it.
          </p>
        </div>
        <div className="space-y-3">
          {phases.map((p, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 grid md:grid-cols-4 gap-4 items-start">
              <div>
                <div className="text-xs uppercase tracking-wider text-orange-700 font-bold">{p.when}</div>
                <div className="font-display text-lg font-bold text-slate-900 mt-1">{p.title}</div>
              </div>
              <JourneyCell label="Member experience" body={p.experience} />
              <JourneyCell label="What the system does" body={p.system} />
              <JourneyCell label="Outcome for you" body={p.outcome} highlight />
            </div>
          ))}
        </div>
        <div className="mt-10 rounded-2xl bg-slate-900 text-white p-7 md:p-9">
          <p className="text-base md:text-lg leading-relaxed">
            <Sparkles className="inline h-5 w-5 text-emerald-400 mr-1.5" />
            <strong className="text-emerald-400">Financial impact:</strong>{" "}
            One retained member stays for 2+ years instead of 3 months. That's{" "}
            <strong className="text-white">$1,200–$2,400 in recurring revenue</strong>{" "}
            from a single saved relationship. Multiply across your monthly intake.
          </p>
        </div>
      </div>
    </section>
  );
}

function JourneyCell({ label, body, highlight }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-emerald-50 border border-emerald-100" : "bg-slate-50 border border-slate-100"}`}>
      <div className={`text-[10px] uppercase tracking-wider font-bold ${highlight ? "text-emerald-700" : "text-slate-500"}`}>{label}</div>
      <div className="text-sm text-slate-800 mt-1 leading-relaxed">{body}</div>
    </div>
  );
}

// --------------------------------------------------------------------------
function GymTypesSection() {
  const gyms = [
    {
      type: "Mid-size CrossFit Box",
      result: "Reduces churn from 35% to ~12% over 90 days",
    },
    {
      type: "24-hour / Big-box Gym",
      result: "Recovers ~$6,000 / month in would-be cancellations",
    },
    {
      type: "Boutique Training Studio",
      result: "Cuts admin time in half, frees owner to focus on growth",
    },
    {
      type: "Multi-location Franchise",
      result: "Unifies the member experience across every location",
    },
  ];
  return (
    <section className="py-20 bg-white" data-testid="results-types-section">
      <div className="max-w-6xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            Built for every shape of gym.
          </h2>
          <p className="mt-4 text-base text-slate-600">
            From single-room studios to multi-state franchises — the
            principles are the same, the execution adapts.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {gyms.map((g, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 hover:border-blue-300 hover:shadow-lg transition">
              <div className="text-xs uppercase tracking-wider text-blue-700 font-bold mb-2">{g.type}</div>
              <div className="font-display text-lg font-semibold text-slate-900 leading-snug">{g.result}</div>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-slate-500 mt-8 italic">
          Composite results based on launch interviews and category benchmarks. Your numbers will vary.
        </p>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function ROISection() {
  return (
    <section className="py-20 bg-slate-50" data-testid="results-roi-section">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <TrendingUp className="h-3.5 w-3.5" />
            The math
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            Run your gym through the model.
          </h2>
        </div>
        <DetailedROICalculator />
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function NextStepsSection() {
  const steps = [
    "Schedule a discovery call (60 min, on Calendly)",
    "We talk about your gym for an hour",
    "You decide if it's a fit",
    "If yes — we start building",
    "3 weeks later, you have a live system",
  ];
  return (
    <section className="py-20 bg-white" data-testid="results-next-steps">
      <div className="max-w-3xl mx-auto px-6 lg:px-10">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 text-center mb-3">
          What happens next.
        </h2>
        <p className="text-center text-slate-600 mb-10">
          No pressure, no pitch. Just an honest conversation about your gym.
        </p>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-600 to-emerald-500 grid place-items-center text-white font-bold flex-shrink-0">
                {i + 1}
              </div>
              <span className="text-base text-slate-800 font-medium">{s}</span>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <a
            href={TIDYCAL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="results-next-cta"
            className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-7 py-3.5 rounded-md text-base shadow-lg shadow-orange-500/20 transition"
          >
            <Calendar className="h-4 w-4" />
            Schedule Free Strategy Call
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function FAQSection() {
  const [open, setOpen] = useState(0);
  const faqs = [
    {
      q: "Will this actually work for MY gym?",
      a: "Different gyms have different workflows — which is why we custom-build for YOU instead of using templates. We map out your specific process in discovery and tailor every screen, every email, every automation to fit. You approve each phase before we move on, so you always know what you're getting before final payment.",
    },
    {
      q: "How much training will my team need?",
      a: "Minimal. The interface is intuitive (your members will use a slice of it themselves). We do a 1-hour training call, send video walkthroughs of every feature, and stay on-call during the first weeks. Most teams are comfortable within a few days.",
    },
    {
      q: "What if your tech breaks?",
      a: "Enterprise-grade infrastructure with a 99.9% uptime guarantee. Daily backups. If something breaks (rare), we fix it within hours — you have direct support access in your build channel.",
    },
    {
      q: "Can I integrate with my existing tools?",
      a: "Yes. Payment processing (Stripe, Square), email (Mailchimp, ConvertKit), calendar/booking (Google Calendar, Calendly), and most major gym-specific tools. We map out integrations in the discovery call.",
    },
    {
      q: "What if I want to cancel?",
      a: "You approve each phase before we move on, and the 50/50 split means the second half is only due once the system is live and signed off. After launch, you own the software outright — no monthly fee required. Ongoing support is optional and month-to-month, cancellable anytime.",
    },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="results-faq-section">
      <div className="max-w-3xl mx-auto px-6 lg:px-10">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 text-center mb-12">
          Common concerns, answered.
        </h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <button
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
                onClick={() => setOpen(open === i ? -1 : i)}
                data-testid={`results-faq-toggle-${i}`}
              >
                <span className="font-semibold text-slate-900">{f.q}</span>
                <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${open === i ? "rotate-180" : ""}`} />
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
function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-20 bg-gradient-to-br from-emerald-900 via-blue-950 to-slate-950 text-white">
      <div className="absolute inset-0 opacity-10 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1900&q=80')" }} />
      <div className="relative max-w-4xl mx-auto px-6 lg:px-10 text-center">
        <h2 className="font-display text-3xl md:text-5xl font-bold leading-tight">
          Stop losing members.<br />
          Start building something scalable.
        </h2>
        <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto">
          Your custom gym system is 3 weeks away.
        </p>
        <div className="mt-9">
          <a
            href={TIDYCAL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="results-final-cta"
            className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-4 rounded-md text-base shadow-2xl shadow-orange-500/30 transition"
          >
            <Calendar className="h-5 w-5" />
            Lock In Your Spot Today
            <ArrowRight className="h-5 w-5" />
          </a>
        </div>
      </div>
    </section>
  );
}
