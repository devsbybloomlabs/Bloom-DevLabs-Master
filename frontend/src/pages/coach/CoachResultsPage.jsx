/**
 * Coaches & Consultants — Page 4 (Client Success / Results).
 * URL: /coaches/results
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  ArrowRight,
  TrendingUp,
  Users,
  DollarSign,
  ChevronDown,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Zap,
  Target,
  BarChart3,
  MapPin,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import CoachLayout from "./CoachLayout";
import { DetailedCoachROICalculator } from "./components/CoachROICalculator";
import { buildNicheSeo } from "@/lib/seo";

const TIDYCAL = BRAND.tidycal;

export default function CoachResultsPage() {
  return (
    <CoachLayout breadcrumb="Results" seo={buildNicheSeo("coach", "Results")}>
      <Hero />
      <ArchetypesSection />
      <NumbersSection />
      <DominoSection />
      <CoachTypesSection />
      <ROISection />
      <NextStepsSection />
      <FAQSection />
      <FinalCTA />
    </CoachLayout>
  );
}

function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-950 text-white py-20 md:py-24 overflow-hidden">
      <div className="absolute inset-0 opacity-15 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=1900&q=80')" }} />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] max-w-3xl">
          How coaches leverage their platform to{" "}
          <span className="text-amber-300">book more clients.</span>
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-2xl leading-relaxed">
          Three coach archetypes. The same starting line: leads going dark. Very
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
      name: "The solopreneur who wants to scale",
      before: {
        feeling: "I could be making 2x what I'm making but I have no system.",
        bullets: [
          "No website (LinkedIn profile only)",
          "Booking: clients text/call/email back-and-forth",
          "Credibility: looks like everyone else",
          "Admin: 5+ hours per week managing calendars",
          "Bookings: 8–10 per month",
        ],
      },
      after: {
        feeling: "I finally look like the expert I am. Clients book me confidently.",
        bullets: [
          "Professional website showing your authority",
          "Booking: client clicks, books, pays, confirms — done",
          "Credibility: premium positioning",
          "Admin: 30 minutes per week",
          "Bookings: 12–15 per month (30–50% increase)",
        ],
        impact: "$1,000–$1,500 / month in new recurring revenue",
      },
    },
    {
      name: "The coach building multiple offerings",
      before: {
        feeling: "I have 1-on-1, group, workshops — but no way to present them.",
        bullets: [
          "Different prices, no clear packaging",
          "Can't track which service clients prefer",
          "Website (if exists) doesn't show packages",
          "Feels scattered",
        ],
      },
      after: {
        feeling: "Each service has its showcase. Clients self-select what's right for them.",
        bullets: [
          "Each service has its own showcase section",
          "Clients book any service, pay corresponding rate",
          "Dashboard shows which services generate revenue",
          "Optimize based on data",
        ],
        impact: "25–40% increase in average revenue per client",
      },
    },
    {
      name: "The consultant converting more leads",
      before: {
        feeling: "Lots of discovery calls, but my close rate is 20–30%.",
        bullets: [
          "Leads go dark after first call",
          "Manual follow-ups (email, text, calls)",
          "Can't tell who's hot vs. cold",
          "Lots of effort, mediocre ROI",
        ],
      },
      after: {
        feeling: "Booking system itself builds credibility. Close rate is now 40–50%.",
        bullets: [
          "Leads book straight from website",
          "Booking flow builds trust before the call",
          "Dashboard onboards new clients automatically",
          "Follow-ups partially automated",
        ],
        impact: "$2,000–$5,000 / month in new consulting contracts",
      },
    },
  ];

  return (
    <section className="py-20 bg-white" data-testid="coach-results-archetypes">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 bg-teal-100 text-teal-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
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
    <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm" data-testid={`coach-archetype-${index}`}>
      <div className="px-7 md:px-10 py-5 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-slate-900 text-white grid place-items-center font-bold text-sm">{index + 1}</div>
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
    { big: "3–5", label: "extra bookings / month", sub: "average increase", tone: "emerald" },
    { big: "24 hrs", label: "to launch", sub: "from discovery to live", tone: "teal" },
    { big: "$1K–$3K", label: "monthly revenue increase", sub: "per coach", tone: "amber" },
    { big: "2 wks", label: "payback period", sub: "system pays for itself", tone: "slate" },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="coach-results-numbers">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <BarChart3 className="h-3.5 w-3.5" />
            The numbers
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            What "more bookings" looks like, in raw math.
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map((s) => (
            <BigNumber key={s.label} {...s} />
          ))}
        </div>
        <p className="text-center text-xs text-slate-500 mt-6 italic max-w-2xl mx-auto">
          Projected based on industry conversion benchmarks for one-click booking
          systems · live customer results coming Q2.
        </p>
      </div>
    </section>
  );
}

function BigNumber({ big, label, sub, tone }) {
  const tones = {
    emerald: "text-emerald-600",
    teal: "text-teal-700",
    amber: "text-amber-600",
    slate: "text-slate-900",
  };
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-7 hover:shadow-lg transition" data-testid={`coach-stat-${label.replace(/\s+/g, "-")}`}>
      <div className={`text-5xl md:text-6xl font-bold tabular-nums ${tones[tone]} leading-none`}>{big}</div>
      <div className="mt-3 text-base font-semibold text-slate-900">{label}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

// --------------------------------------------------------------------------
function DominoSection() {
  const steps = [
    { icon: BarChart3, title: "Website launches", body: "Client finds you and thinks: 'this person is legitimate.'" },
    { icon: Target, title: "Booking works", body: "Client doesn't have to chase you down to book a session." },
    { icon: Zap, title: "Client books", body: "You get paid upfront. No payment friction. Calendar confirmed." },
    { icon: CheckCircle2, title: "Client onboards", body: "Dashboard makes them feel like they're in a real program." },
    { icon: Sparkles, title: "Session happens", body: "Client sees notes, progress, resources in one place." },
    { icon: TrendingUp, title: "Client rebooks", body: "They rebook directly. No email back-and-forth." },
    { icon: Users, title: "Retention improves", body: "Clients stay longer because the experience is smooth." },
    { icon: DollarSign, title: "Revenue grows", body: "More bookings + longer retention = compounding growth." },
  ];
  return (
    <section className="py-20 bg-white" data-testid="coach-results-domino">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            The domino effect of a professional website.
          </h2>
          <p className="mt-4 text-base text-slate-600 leading-relaxed">
            Each link in the chain is small. The compounding effect is anything but.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-4 items-start rounded-xl bg-slate-50 border border-slate-100 p-5 hover:border-teal-300 transition">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-teal-600 to-amber-500 grid place-items-center text-white flex-shrink-0 font-bold text-sm">
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
function CoachTypesSection() {
  const coaches = [
    { type: "Life Coach · Miami", result: "Went from 6 clients to 12 in 60 days after website launch" },
    { type: "Executive Coach · SF", result: "Closed 3 consulting contracts in first month (normally takes 2 months)" },
    { type: "Wellness Coach · Austin", result: "Cut admin time in half, increased rates 25% because positioning improved" },
    { type: "Business Coach · NYC", result: "Built group program on top of 1-on-1 coaching, doubled revenue" },
    { type: "Fitness Coach · LA", result: "Automated client follow-ups, improved retention by 40%" },
    { type: "Career Coach · Chicago", result: "Booking flow alone lifted lead-to-client conversion from 25% to 48%" },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="coach-results-types">
      <div className="max-w-6xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            Built for every kind of coach.
          </h2>
          <p className="mt-4 text-base text-slate-600">
            From life coaches to executive consultants — the principles are the same,
            the execution adapts to your niche.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {coaches.map((g, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 hover:border-teal-300 hover:shadow-lg transition">
              <div className="flex items-center gap-2 text-teal-700 text-xs uppercase tracking-wider font-bold mb-2">
                <MapPin className="h-3.5 w-3.5" />
                {g.type}
              </div>
              <div className="font-display text-base font-semibold text-slate-900 leading-snug">{g.result}</div>
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
    <section className="py-20 bg-white" data-testid="coach-results-roi">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <TrendingUp className="h-3.5 w-3.5" />
            The math
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            Run your coaching practice through the model.
          </h2>
        </div>
        <DetailedCoachROICalculator />
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function NextStepsSection() {
  const steps = [
    "Schedule a discovery call (20 min on Calendly)",
    "We talk about your coaching, your goals, your niche",
    "You decide if you want to move forward",
    "If yes, we build your site that day",
    "Next morning, you're live and booking clients",
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="coach-results-next">
      <div className="max-w-3xl mx-auto px-6 lg:px-10">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 text-center mb-3">
          Your next step.
        </h2>
        <p className="text-center text-slate-600 mb-10">
          No pressure. No contracts. Just a conversation. If it's not right, no problem.
        </p>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-teal-600 to-amber-500 grid place-items-center text-white font-bold flex-shrink-0">
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
            data-testid="coach-results-next-cta"
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-7 py-3.5 rounded-md text-base shadow-lg shadow-amber-500/20 transition"
          >
            <Calendar className="h-4 w-4" />
            Schedule Free Discovery Call
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
      q: "Will a 24-hour website really work?",
      a: "Yes — because it's not generic. We customize it entirely to your coaching: your photos, your voice, your unique approach. It's fast because we focus on what matters: a professional site that converts leads into bookings. Everything else is a luxury feature you can add later.",
    },
    {
      q: "What if clients have issues using the booking system?",
      a: "They won't. It's designed for simplicity — clients see your calendar, pick a time, enter payment. Two clicks. If your clients can text, they can absolutely handle a calendar tool. Plus 30-day support if questions pop up.",
    },
    {
      q: "Can I change things after it's live?",
      a: "Absolutely. Some changes are easy (copy, photos, colors) and you can update those yourself. Bigger changes (new services, system rebuilds) we handle at our support rate. Most coaches use it as-is for 3–6 months, then make bigger tweaks when they scale.",
    },
    {
      q: "What if my business model changes?",
      a: "Website is flexible. Want to add a group program? We can rebuild in a couple weeks. Want different packages? Easy. The foundation is solid; we just adjust what sits on top.",
    },
    {
      q: "What's the $1K credit for Premium?",
      a: "If you start with Starter ($2,995) and want to upgrade to Premium ($8,995) within 14 days, we apply $1K of the Starter cost as credit. You pay $6,000 more (not the full $6,000 difference). You get advanced features — video intro, resource library, analytics, automation.",
    },
  ];
  return (
    <section className="py-20 bg-white" data-testid="coach-results-faq">
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
                data-testid={`coach-results-faq-toggle-${i}`}
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
    <section className="relative overflow-hidden py-20 bg-gradient-to-br from-emerald-900 via-teal-950 to-slate-950 text-white">
      <div className="absolute inset-0 opacity-10 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1521737852567-6949f3f9f2b5?auto=format&fit=crop&w=1900&q=80')" }} />
      <div className="relative max-w-4xl mx-auto px-6 lg:px-10 text-center">
        <h2 className="font-display text-3xl md:text-5xl font-bold leading-tight">
          Stop being invisible online.<br />
          <span className="text-amber-300">Start booking clients.</span>
        </h2>
        <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto">
          Your professional website is 24 hours away.
        </p>
        <div className="mt-9">
          <a
            href={TIDYCAL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="coach-results-final-cta"
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-8 py-4 rounded-md text-base shadow-2xl shadow-amber-500/30 transition"
          >
            <Calendar className="h-5 w-5" />
            Launch Your Website Today
            <ArrowRight className="h-5 w-5" />
          </a>
        </div>
      </div>
    </section>
  );
}
