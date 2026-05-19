/**
 * Real Estate — Page 4 (Client Success / Results). URL: /real-estate/results
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, ArrowRight, TrendingUp, Users, DollarSign, ChevronDown, Sparkles, AlertCircle, CheckCircle2, MapPin, BarChart3 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import RELayout from "./RELayout";
import { DetailedREROICalculator } from "./components/REROICalculator";
import { buildNicheSeo } from "@/lib/seo";

const TIDYCAL = BRAND.tidycal;

export default function REResultsPage() {
  return (
    <RELayout breadcrumb="Results" seo={buildNicheSeo("re", "Results")}>
      <Hero /><Cases /><Numbers /><Roadmap /><ROI /><Next /><FAQ /><FinalCTA />
    </RELayout>
  );
}

function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-emerald-950 via-indigo-950 to-slate-950 text-white py-20 md:py-24 overflow-hidden">
      <div className="absolute inset-0 opacity-15 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1280&q=80')" }} />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] max-w-3xl">
          Real results from <span className="text-amber-300">real estate agents.</span>
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-2xl leading-relaxed">
          See what's possible when your website works for you, not against you. Three case studies, three different starting points.
        </p>
      </div>
    </section>
  );
}

function Cases() {
  const cases = [
    {
      name: "Sarah M. — Denver, residential specialist",
      before: { feeling: "I was getting 1-2 leads per month from my old website. Most never replied to follow-up.", bullets: ["Old website, 4 years out of date", "1–2 leads / mo, mostly cold", "3–5 deals / quarter from sphere only"] },
      after: { feeling: "My first lead came 6 hours after launch. Now I'm booking $40K+ commission per quarter from the website alone.", bullets: ["Month 1: 32 leads, 4 showings, 1 sold", "Month 2: 45 leads, 3 showings, 1 sold", "Month 3: 52 leads, 5 showings, 2 sold"], impact: "$120,000+ year 1 commission from website leads" },
    },
    {
      name: "Marcus T. — Austin, team lead (3 agents)",
      before: { feeling: "Each agent had their own site (or none). Agents fought for the same Zillow leads. No team consistency.", bullets: ["3 fragmented sites", "Agents competing for ad-generated leads", "No central lead-routing system"] },
      after: { feeling: "Now agents get a steady stream of pre-qualified leads from our central site. Everyone wins.", bullets: ["Central site: 60–80 leads / mo", "Leads auto-routed to agents by territory", "Team efficiency +40%"], impact: "22% YoY team-revenue lift from website leads" },
    },
    {
      name: "Jessica L. — Phoenix, new agent (8 months in)",
      before: { feeling: "Nobody took me seriously. Limited sphere. No leads. I was about to leave the business.", bullets: ["No website", "Limited credibility", "Struggling to hit 1 deal / quarter"] },
      after: { feeling: "My website made me look like I'd been here for 10 years. Buyers felt confident working with me.", bullets: ["First 30d: 20 website leads", "First 90d: 3 deals from website (5 total)", "Professional positioning instantly"], impact: "From rookie struggling → quarter-1 deal production above average" },
    },
  ];
  return (
    <section className="py-20 bg-white" data-testid="re-results-cases">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <Users className="h-3.5 w-3.5" />Three transformations
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">Which one feels like you?</h2>
        </div>
        <div className="space-y-10">
          {cases.map((c, i) => <CaseCard key={i} {...c} index={i} />)}
        </div>
      </div>
    </section>
  );
}

function CaseCard({ name, before, after, index }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm" data-testid={`re-results-case-${index}`}>
      <div className="px-7 md:px-10 py-5 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-slate-900 text-white grid place-items-center font-bold text-sm">{index + 1}</div>
          <h3 className="font-display text-2xl font-bold text-slate-900">{name}</h3>
        </div>
      </div>
      <div className="grid md:grid-cols-2">
        <div className="p-7 md:p-9 bg-rose-50/30 border-r border-slate-100">
          <div className="flex items-center gap-2 text-rose-700 mb-4"><AlertCircle className="h-4 w-4" /><span className="text-xs uppercase tracking-wider font-bold">Before</span></div>
          <p className="text-lg italic text-slate-800 mb-5 leading-relaxed">"{before.feeling}"</p>
          <ul className="space-y-2">
            {before.bullets.map((b, j) => <li key={j} className="flex gap-2 text-sm text-slate-700"><span className="text-rose-500 mt-1">·</span><span>{b}</span></li>)}
          </ul>
        </div>
        <div className="p-7 md:p-9 bg-emerald-50/30">
          <div className="flex items-center gap-2 text-emerald-700 mb-4"><Sparkles className="h-4 w-4" /><span className="text-xs uppercase tracking-wider font-bold">After</span></div>
          <p className="text-lg italic text-slate-800 mb-5 leading-relaxed">"{after.feeling}"</p>
          <ul className="space-y-2">
            {after.bullets.map((b, j) => <li key={j} className="flex gap-2 text-sm text-slate-700"><CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" /><span>{b}</span></li>)}
          </ul>
          {after.impact && (
            <div className="mt-5 inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold px-4 py-2 rounded-lg text-sm shadow-md">
              <DollarSign className="h-4 w-4" />{after.impact}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Numbers() {
  const stats = [
    { big: "20–60", label: "qualified leads / month", sub: "from your own website", tone: "emerald" },
    { big: "24 hrs", label: "to launch", sub: "Friday call → Monday live", tone: "indigo" },
    { big: "1 deal", label: "pays for the system", sub: "ROI typically by week 3", tone: "amber" },
    { big: "3–4×", label: "more lead conversions", sub: "vs. static agent sites", tone: "slate" },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="re-results-numbers">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4"><BarChart3 className="h-3.5 w-3.5" />The numbers</div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">What "leads on autopilot" looks like in raw math.</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">{stats.map((s) => <BigNumber key={s.label} {...s} />)}</div>
        <p className="text-center text-xs text-slate-500 mt-6 italic max-w-2xl mx-auto">
          Composite results from launch interviews + category benchmarks. Your numbers vary by market.
        </p>
      </div>
    </section>
  );
}
function BigNumber({ big, label, sub, tone }) {
  const tones = { emerald: "text-emerald-600", indigo: "text-indigo-700", amber: "text-amber-600", slate: "text-slate-900" };
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-7 hover:shadow-lg transition" data-testid={`re-stat-${label.replace(/\s+/g, "-")}`}>
      <div className={`text-5xl md:text-6xl font-bold tabular-nums ${tones[tone]} leading-none`}>{big}</div>
      <div className="mt-3 text-base font-semibold text-slate-900">{label}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function Roadmap() {
  const items = [
    "30-day support window — bug fixes, optimization, training questions",
    "Real results tracking — most agents see 15–35 leads in first 30 days",
    "We win when you win — that's why we build lead capture aggressively",
    "$1,000 upgrade credit — Starter → Premium within 14 days",
  ];
  return (
    <section className="py-20 bg-white" data-testid="re-results-roadmap">
      <div className="max-w-4xl mx-auto px-6 lg:px-10">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 text-center mb-3">What happens after launch.</h2>
        <p className="text-center text-slate-600 max-w-xl mx-auto mb-10">We don't ship and disappear. Here's the post-launch experience.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl bg-emerald-50/40 border border-emerald-100 p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" /><span className="text-sm text-slate-800 font-medium">{it}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ROI() {
  return (
    <section className="py-20 bg-slate-50" data-testid="re-results-roi">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4"><TrendingUp className="h-3.5 w-3.5" />The math</div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">Run your market through the model.</h2>
        </div>
        <DetailedREROICalculator />
      </div>
    </section>
  );
}

function Next() {
  const steps = [
    "Schedule a 20-minute walkthrough (on Calendly)",
    "We talk about your market, your MLS, your goals",
    "You decide if you want to move forward",
    "Friday afternoon call → we start that same hour",
    "Monday morning at 9 AM, you're live and capturing leads",
  ];
  return (
    <section className="py-20 bg-white" data-testid="re-results-next">
      <div className="max-w-3xl mx-auto px-6 lg:px-10">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 text-center mb-3">Your next step.</h2>
        <p className="text-center text-slate-600 mb-10">No pressure. No contracts. Just a conversation.</p>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-800 to-amber-500 grid place-items-center text-white font-bold flex-shrink-0">{i + 1}</div>
              <span className="text-base text-slate-800 font-medium">{s}</span>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <a href={TIDYCAL} target="_blank" rel="noopener noreferrer" data-testid="re-results-next-cta"
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-7 py-3.5 rounded-md text-base shadow-lg shadow-amber-500/20 transition">
            <Calendar className="h-4 w-4" />Schedule Free Walkthrough<ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState(0);
  const faqs = [
    { q: "Will leads actually be qualified?", a: "Lead-capture forms ask for budget, timeline, neighborhoods — so leads come pre-scored. Automated drip nurtures cold leads. By the time they reply, they're warm. You spend time on prospects who are ready." },
    { q: "What if my MLS doesn't have an API?", a: "We tell you upfront on the discovery call. Most modern MLSs (REcolorado, CRMLS, MLSPIN, NWMLS, etc.) have APIs. If yours is locked, we have IDX-vendor fallbacks." },
    { q: "Can I change things after it's live?", a: "Yes. Copy, photos, neighborhoods — easy, you can update yourself. Bigger structural changes we handle at our support rate. Most agents use it as-is for 3-6 months, then evolve." },
    { q: "What if I'm a brand-new agent?", a: "Even better — a professional site fast-tracks credibility. You compete with veterans because your online presence looks established. See Jessica L.'s case study above." },
    { q: "What's the $1K upgrade credit?", a: "Start with Starter ($2,995). Upgrade to Premium ($8,995) within 14 days → we apply $1,000 of your Starter spend as credit. Net difference: $5,000 (instead of $6,000)." },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="re-results-faq">
      <div className="max-w-3xl mx-auto px-6 lg:px-10">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 text-center mb-12">Common concerns, answered.</h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <button className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
                onClick={() => setOpen(open === i ? -1 : i)} data-testid={`re-results-faq-toggle-${i}`}>
                <span className="font-semibold text-slate-900">{f.q}</span>
                <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && <div className="px-5 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">{f.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-20 bg-gradient-to-br from-emerald-900 via-indigo-950 to-slate-950 text-white">
      <div className="absolute inset-0 opacity-10 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1280&q=80')" }} />
      <div className="relative max-w-4xl mx-auto px-6 lg:px-10 text-center">
        <h2 className="font-display text-3xl md:text-5xl font-bold leading-tight">
          Stop losing deals.<br /><span className="text-amber-300">Own your market.</span>
        </h2>
        <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto">
          Your MLS-integrated site is 24 hours away.
        </p>
        <div className="mt-9">
          <a href={TIDYCAL} target="_blank" rel="noopener noreferrer" data-testid="re-results-final-cta"
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-8 py-4 rounded-md text-base shadow-2xl shadow-amber-500/30 transition">
            <Calendar className="h-5 w-5" />Launch My MLS Website<ArrowRight className="h-5 w-5" />
          </a>
        </div>
      </div>
    </section>
  );
}
