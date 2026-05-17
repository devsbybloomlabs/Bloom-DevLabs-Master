/**
 * Real Estate — Page 3 (Our Process). URL: /real-estate/process
 */
import { Link } from "react-router-dom";
import { Calendar, ArrowRight, PhoneCall, Hammer, Sunset, Rocket, Clock, CheckCircle2, Shield, Headphones, TrendingUp, MessageCircle } from "lucide-react";
import { BRAND } from "@/lib/brand";
import RELayout from "./RELayout";
import { buildNicheSeo } from "@/lib/seo";

const TIDYCAL = BRAND.tidycal;

export default function REProcessPage() {
  return (
    <RELayout breadcrumb="Our Process" seo={buildNicheSeo("re", "Process")}>
      <Hero /><Timeline /><Commitment /><Support /><Risk /><Checklist /><Upgrade /><CTA />
    </RELayout>
  );
}

function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white py-20 md:py-24 overflow-hidden">
      <div className="absolute inset-0 opacity-15 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=1900&q=80')" }} />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] max-w-3xl">
          Friday call → <span className="text-amber-300">Monday morning live.</span>
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-2xl leading-relaxed">
          A predictable 3-step weekend build. ~2 hours of your time. You stay in control. Leads land on day 1.
        </p>
      </div>
    </section>
  );
}

function Timeline() {
  const phases = [
    { icon: PhoneCall, tone: "amber", time: "Friday · 3:00–3:45 PM", title: "Information-gathering call", duration: "30 minutes", commit: "One discovery call", what: "We ask 5 simple questions about your market, neighborhoods, brand colors, and MLS setup. You send a few photos and listing examples. We start building immediately while you're still on the call.", gets: "Complete build spec + we're already coding.", deliverable: "Written plan + branding sheet." },
    { icon: Hammer, tone: "indigo", time: "Friday eve / Saturday · 8–12 hours", title: "The build (while you sleep)", duration: "8 hours", commit: "None — go sell!", what: "Our team builds your website. MLS integration configured. Lead-capture forms set up. Email system connected. We pull real data from your MLS and populate the site. By Saturday afternoon: 95% complete.", gets: "Live preview link + same-day tweaks.", deliverable: "95% complete system, ready for review." },
    { icon: Sunset, tone: "amber", time: "Saturday eve / Sunday · 30 min", title: "Review & feedback", duration: "30 minutes", commit: "Quick walkthrough", what: "You click around the preview. Any tweaks (colors, photos, copy)? We make them real-time. By Sunday night: everything ready to launch.", gets: "Final tweaks made real-time.", deliverable: "Approval to launch." },
    { icon: Rocket, tone: "emerald", time: "Monday · before 9 AM", title: "Go live + training", duration: "20 minutes", commit: "Training call", what: "Your domain points to the new site. We train you on the lead dashboard, how leads will come through, automated follow-up, and listing management. By 10 AM Monday: live + operational.", gets: "Live website + trained team.", deliverable: "Production system live. You own it. Leads start coming through by day 2." },
  ];
  return (
    <section className="py-20 bg-white" data-testid="re-process-timeline">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="space-y-6">
          {phases.map((p, i) => <PhaseBlock key={i} index={i + 1} total={phases.length} {...p} />)}
        </div>
      </div>
    </section>
  );
}

function PhaseBlock({ index, total, icon: Icon, tone, time, title, duration, commit, what, gets, deliverable }) {
  const tones = { amber: "from-amber-500 to-orange-600", indigo: "from-indigo-700 to-blue-700", emerald: "from-emerald-500 to-teal-600" };
  const progress = (index / total) * 100;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm" data-testid={`re-process-phase-${index}`}>
      <div className={`h-2 bg-gradient-to-r ${tones[tone]}`} style={{ width: `${progress}%` }} />
      <div className="p-7 md:p-9">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          <div className="flex-shrink-0">
            <div className={`h-16 w-16 rounded-2xl bg-gradient-to-br ${tones[tone]} text-white grid place-items-center shadow-lg`}><Icon className="h-7 w-7" strokeWidth={2.2} /></div>
            <div className="mt-3 text-center"><div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Phase</div><div className="text-3xl font-bold text-slate-900 tabular-nums">{index}<span className="text-slate-300">/{total}</span></div></div>
          </div>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-amber-700 font-bold">{time}</div>
            <div className="flex items-center gap-3 flex-wrap mt-1">
              <h2 className="font-display text-2xl md:text-3xl font-bold text-slate-900">{title}</h2>
              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-xs font-semibold"><Clock className="h-3 w-3" />{duration}</span>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
              <Box label="Your commitment" body={commit} />
              <Box label="What happens" body={what} />
              <Box label="What you get" body={gets} />
              <Box label="Deliverable" body={deliverable} highlight />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Box({ label, body, highlight }) {
  return (
    <div className={`rounded-lg p-3.5 ${highlight ? "bg-emerald-50 border border-emerald-100" : "bg-slate-50 border border-slate-100"}`}>
      <div className={`text-[10px] uppercase tracking-wider font-bold ${highlight ? "text-emerald-700" : "text-slate-500"}`}>{label}</div>
      <div className="text-sm text-slate-800 leading-relaxed mt-1">{body}</div>
    </div>
  );
}

function Commitment() {
  return (
    <section className="py-20 bg-slate-50" data-testid="re-process-commitment">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4"><Clock className="h-3.5 w-3.5" />Your time</div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 leading-tight">
              Total investment: <span className="text-indigo-800">~80 minutes over the weekend.</span>
            </h2>
            <p className="mt-5 text-base text-slate-600 leading-relaxed">
              We do everything technical. You just guide us on what to build. By Monday at 10 AM, you're live and leads start coming through within 24 hours.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-7">
            <div className="space-y-3">
              {[
                { phase: "Friday 3 PM", time: "30 min", purpose: "Discovery call" },
                { phase: "Saturday eve", time: "30 min", purpose: "Preview review" },
                { phase: "Monday 9 AM", time: "20 min", purpose: "Launch + training" },
              ].map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="font-semibold text-slate-900">{r.phase}</div><div className="text-sm text-slate-600 flex-1 text-center">{r.purpose}</div><div className="text-sm font-bold text-indigo-700 tabular-nums">{r.time}</div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200"><div className="font-bold text-emerald-900">Total</div><div className="text-sm font-bold text-emerald-700 tabular-nums">~80 minutes</div></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Support() {
  return (
    <section className="py-20 bg-white" data-testid="re-process-support">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4"><Headphones className="h-3.5 w-3.5" />Support</div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">We don't disappear after launch.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          <Card icon={MessageCircle} title="During build" tone="indigo" body="Email + SMS support. Quick responses (usually within hours)." />
          <Card icon={Shield} title="30 days post-launch" tone="emerald" body="Free support: bug fixes, optimization, training, MLS sync questions." />
          <Card icon={Headphones} title="After 30 days" tone="amber" body="Ongoing support available at a flat monthly rate. Optional — many agents go solo." />
        </div>
      </div>
    </section>
  );
}
function Card({ icon: Icon, title, body, tone }) {
  const tones = { indigo: "border-indigo-200 from-indigo-50", emerald: "border-emerald-200 from-emerald-50", amber: "border-amber-200 from-amber-50" };
  const iconTones = { indigo: "bg-indigo-100 text-indigo-700", emerald: "bg-emerald-100 text-emerald-700", amber: "bg-amber-100 text-amber-700" };
  return (
    <div className={`rounded-2xl border ${tones[tone]} bg-gradient-to-br to-white p-6`}>
      <div className={`h-11 w-11 rounded-xl ${iconTones[tone]} grid place-items-center mb-4`}><Icon className="h-5 w-5" /></div>
      <h3 className="font-semibold text-lg text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600 mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

function Risk() {
  return (
    <section className="py-20 bg-slate-950 text-white" data-testid="re-process-risk">
      <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
        <div className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-5"><Shield className="h-3.5 w-3.5" />Risk-managed</div>
        <h2 className="font-display text-3xl md:text-5xl font-bold leading-tight">You stay in control at every checkpoint.</h2>
        <p className="mt-6 text-lg text-slate-300 leading-relaxed">
          You preview the website Saturday before launch. Tweaks happen real-time. You approve the final build before we flip the switch on Monday — so what you see is what you launch with. No surprises, no lock-in.
        </p>
      </div>
    </section>
  );
}

function Checklist() {
  const items = [
    "MLS-integrated website (mobile-optimized)",
    "Auto-syncing listings from your MLS",
    "Lead-capture forms on 6+ surfaces",
    "Email lead dashboard",
    "Custom domain or use your existing",
    "Unlimited design revisions during build",
    "Launch-day training call",
    "30-day post-launch support",
    "(Free first month) email follow-up system",
  ];
  return (
    <section className="py-20 bg-white" data-testid="re-process-checklist">
      <div className="max-w-4xl mx-auto px-6 lg:px-10">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 text-center mb-3">Everything that's included.</h2>
        <p className="text-center text-slate-600 max-w-xl mx-auto mb-10">No surprise add-ons. No upsells. One price, complete system.</p>
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

function Upgrade() {
  return (
    <section className="py-20 bg-gradient-to-br from-indigo-50 via-white to-amber-50/50" data-testid="re-process-upgrade">
      <div className="max-w-4xl mx-auto px-6 lg:px-10">
        <div className="rounded-3xl bg-white border-2 border-indigo-200 p-8 md:p-12 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-800 to-amber-500 grid place-items-center text-white flex-shrink-0"><TrendingUp className="h-6 w-6" /></div>
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-wider text-indigo-700 font-bold">Upgrade path</div>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-slate-900 leading-tight mt-1">Built to <span className="text-indigo-800">scale with your business.</span></h2>
              <p className="mt-4 text-base text-slate-600 leading-relaxed">
                Most agents start with Starter ($2,995) to launch in 24 hours. Once leads are flowing (week 2-3), they upgrade to Premium ($8,995) for advanced CRM, drip campaigns, SMS, and custom integrations.
              </p>
              <div className="mt-5 grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3"><div className="text-[10px] uppercase tracking-wider text-indigo-700 font-bold">Starter → Premium</div><div className="text-sm text-slate-800 mt-1">Upgrade within 14 days: <strong>$1,000 credit</strong> applied</div></div>
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-3"><div className="text-[10px] uppercase tracking-wider text-amber-700 font-bold">Net difference</div><div className="text-sm text-slate-800 mt-1">Pay <strong>$5,000 more</strong> (instead of $6,000)</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-20 bg-gradient-to-br from-indigo-900 via-slate-950 to-slate-950 text-white">
      <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
        <h2 className="font-display text-3xl md:text-4xl font-bold">Lock in your 24-hour build.</h2>
        <p className="mt-4 text-lg text-slate-300">20-minute discovery call. No pressure. Just a real conversation about your market.</p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <a href={TIDYCAL} target="_blank" rel="noopener noreferrer" data-testid="re-process-cta-book"
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-7 py-3.5 rounded-md text-base shadow-lg shadow-amber-500/20 transition">
            <Calendar className="h-4 w-4" />Book Walkthrough<ArrowRight className="h-4 w-4" />
          </a>
          <Link to="/real-estate/results" className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-7 py-3.5 rounded-md text-base transition">See expected results</Link>
        </div>
      </div>
    </section>
  );
}
