/**
 * Coaches & Consultants — Page 3 (Our Process).
 * URL: /coaches/process
 */
import { Link } from "react-router-dom";
import {
  Calendar,
  ArrowRight,
  Sunrise,
  Hammer,
  Sunset,
  Rocket,
  Clock,
  CheckCircle2,
  Shield,
  MessageCircle,
  Headphones,
  TrendingUp,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import CoachLayout from "./CoachLayout";
import { buildNicheSeo } from "@/lib/seo";

const TIDYCAL = BRAND.tidycal;

export default function CoachProcessPage() {
  return (
    <CoachLayout breadcrumb="Our Process" seo={buildNicheSeo("coach", "Process")}>
      <Hero />
      <TimelineSection />
      <CommitmentSection />
      <SupportSection />
      <GuaranteeSection />
      <ChecklistSection />
      <UpgradePathSection />
      <CTASection />
    </CoachLayout>
  );
}

function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-teal-950 via-slate-900 to-slate-950 text-white py-20 md:py-24 overflow-hidden">
      <div className="absolute inset-0 opacity-15 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1280&q=80')" }} />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] max-w-3xl">
          From discovery to live in <span className="text-amber-300">24 hours</span>.
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-2xl leading-relaxed">
          One day. Three checkpoints. Roughly 2 hours of your time. You stay in
          control. <strong className="text-white">We do everything technical.</strong> Next
          morning, you're booking clients.
        </p>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function TimelineSection() {
  const phases = [
    {
      icon: Sunrise,
      tone: "amber",
      time: "Morning · 9–10 AM",
      title: "Discovery call",
      duration: "60 minutes",
      commit: "One phone or video call",
      what: "You walk us through your coaching. Your niche, your offer, your unique approach, what you want clients to see first. We collect bio, testimonials (or draft them), photos, your philosophy.",
      gets: "Complete website specification document.",
      deliverable: "Written plan showing exactly what we'll build.",
    },
    {
      icon: Hammer,
      tone: "teal",
      time: "Afternoon · 10 AM–6 PM",
      title: "Building",
      duration: "6–8 hours",
      commit: "None — go coach clients!",
      what: "We design and build your website, integrate the booking system, create the client dashboard, optimize everything. You get early-preview links as we go.",
      gets: "Live preview as we build.",
      deliverable: "90% complete system, ready for review.",
    },
    {
      icon: Sunset,
      tone: "amber",
      time: "Evening · 6–8 PM",
      title: "Review & feedback",
      duration: "30 minutes",
      commit: "Quick review, give feedback",
      what: "You see your live website. Tweaks? We make them real-time. Anything you want shifted gets adjusted while you watch.",
      gets: "Minor adjustments made instantly.",
      deliverable: "Approval to launch.",
    },
    {
      icon: Rocket,
      tone: "emerald",
      time: "Next morning · before 9 AM",
      title: "Go live + training",
      duration: "45 minutes",
      commit: "Training call",
      what: "We flip the switch. Your site goes live. We train you on the booking system and dashboard. 30-day support clock starts.",
      gets: "Live website. Trained. Ready to book.",
      deliverable: "Production system live. You own it.",
    },
  ];
  return (
    <section className="py-20 bg-white" data-testid="coach-process-timeline">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="space-y-6">
          {phases.map((p, i) => (
            <PhaseBlock key={i} index={i + 1} total={phases.length} {...p} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PhaseBlock({ index, total, icon: Icon, tone, time, title, duration, commit, what, gets, deliverable }) {
  const tones = {
    amber: "from-amber-500 to-orange-600",
    teal: "from-teal-600 to-cyan-700",
    emerald: "from-emerald-500 to-teal-600",
  };
  const progress = (index / total) * 100;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm" data-testid={`coach-process-phase-${index}`}>
      <div className={`h-2 bg-gradient-to-r ${tones[tone]}`} style={{ width: `${progress}%` }} />
      <div className="p-7 md:p-9">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          <div className="flex-shrink-0">
            <div className={`h-16 w-16 rounded-2xl bg-gradient-to-br ${tones[tone]} text-white grid place-items-center shadow-lg`}>
              <Icon className="h-7 w-7" strokeWidth={2.2} />
            </div>
            <div className="mt-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Phase</div>
              <div className="text-3xl font-bold text-slate-900 tabular-nums">{index}<span className="text-slate-300">/{total}</span></div>
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-amber-700 font-bold">{time}</div>
            <div className="flex items-center gap-3 flex-wrap mt-1">
              <h2 className="font-display text-2xl md:text-3xl font-bold text-slate-900">{title}</h2>
              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                <Clock className="h-3 w-3" />
                {duration}
              </span>
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

// --------------------------------------------------------------------------
function CommitmentSection() {
  return (
    <section className="py-20 bg-slate-50" data-testid="coach-process-commitment">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-teal-100 text-teal-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
              <Clock className="h-3.5 w-3.5" />
              Your time
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 leading-tight">
              Total investment: <span className="text-teal-700">~2 hours, 15 min.</span>
            </h2>
            <p className="mt-5 text-base text-slate-600 leading-relaxed">
              That's it. We do everything technical. You just guide us on what to build.{" "}
              <strong className="text-slate-900">You stay in control. We build the system.
              You manage the business.</strong>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-7">
            <div className="space-y-3">
              {[
                { phase: "Morning", time: "60 min", purpose: "Discovery call" },
                { phase: "Evening", time: "30 min", purpose: "Review &amp; feedback" },
                { phase: "Next day", time: "45 min", purpose: "Launch training" },
              ].map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="font-semibold text-slate-900">{r.phase}</div>
                  <div className="text-sm text-slate-600 flex-1 text-center" dangerouslySetInnerHTML={{ __html: r.purpose }} />
                  <div className="text-sm font-bold text-teal-700 tabular-nums">{r.time}</div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="font-bold text-emerald-900">Total</div>
                <div className="text-sm font-bold text-emerald-700 tabular-nums">2 hours, 15 min</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function SupportSection() {
  return (
    <section className="py-20 bg-white" data-testid="coach-process-support">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <Headphones className="h-3.5 w-3.5" />
            Support
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            We don't disappear after launch.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          <Card icon={MessageCircle} title="During build" tone="teal"
            body="Direct email + message support. Quick responses (usually within hours)." />
          <Card icon={Shield} title="30 days post-launch" tone="emerald"
            body="Free support: bug fixes, optimisation calls, training questions. We handle it." />
          <Card icon={Headphones} title="After 30 days" tone="amber"
            body="Ongoing support available at a flat monthly rate. Optional — many coaches go solo." />
        </div>
      </div>
    </section>
  );
}

function Card({ icon: Icon, title, body, tone }) {
  const tones = {
    teal: "border-teal-200 from-teal-50",
    emerald: "border-emerald-200 from-emerald-50",
    amber: "border-amber-200 from-amber-50",
  };
  const iconTones = {
    teal: "bg-teal-100 text-teal-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <div className={`rounded-2xl border ${tones[tone]} bg-gradient-to-br to-white p-6`}>
      <div className={`h-11 w-11 rounded-xl ${iconTones[tone]} grid place-items-center mb-4`}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-semibold text-lg text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600 mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

// --------------------------------------------------------------------------
function GuaranteeSection() {
  return (
    <section className="py-20 bg-slate-950 text-white" data-testid="coach-process-guarantee">
      <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
        <div className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-5">
          <Shield className="h-3.5 w-3.5" />
          Risk-managed
        </div>
        <h2 className="font-display text-3xl md:text-5xl font-bold leading-tight">
          You stay in control at every checkpoint.
        </h2>
        <p className="mt-6 text-lg text-slate-300 leading-relaxed">
          You see the website live before launch. Tweaks happen real-time during review.
          You approve the final build before we flip the switch — so what you see is
          what you get. No surprises, no lock-in, no monthly fees.
        </p>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function ChecklistSection() {
  const items = [
    "Professional custom website (mobile-optimized)",
    "One-click booking system + calendar sync",
    "Payment processing (Stripe/PayPal)",
    "Client dashboard (session notes + resources)",
    "Unlimited design revisions during build",
    "Email automation (confirmations, reminders)",
    "30-day post-launch support",
    "Team training (1 call)",
  ];
  return (
    <section className="py-20 bg-white" data-testid="coach-process-checklist">
      <div className="max-w-4xl mx-auto px-6 lg:px-10">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 text-center mb-3">
          Everything that's included.
        </h2>
        <p className="text-center text-slate-600 max-w-xl mx-auto mb-10">
          No surprise add-ons. No upsells. One price, complete system.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl bg-emerald-50/40 border border-emerald-100 p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <span className="text-sm text-slate-800 font-medium">{it}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function UpgradePathSection() {
  return (
    <section className="py-20 bg-gradient-to-br from-teal-50 via-white to-amber-50/50" data-testid="coach-process-upgrade">
      <div className="max-w-4xl mx-auto px-6 lg:px-10">
        <div className="rounded-3xl bg-white border-2 border-teal-200 p-8 md:p-12 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-teal-600 to-amber-500 grid place-items-center text-white flex-shrink-0">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-wider text-teal-700 font-bold">Upgrade path</div>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-slate-900 leading-tight mt-1">
                Built to <span className="text-teal-700">scale with you.</span>
              </h2>
              <p className="mt-4 text-base text-slate-600 leading-relaxed">
                Most coaches start with Starter ($2,995) to get booking immediately. Then,
                2–4 weeks in, when they want more (video intro, resource library, advanced
                analytics, email automation) — they upgrade to Premium.
              </p>
              <div className="mt-5 grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg bg-teal-50 border border-teal-100 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-teal-700 font-bold">Starter → Premium</div>
                  <div className="text-sm text-slate-800 mt-1">Upgrade within 14 days: <strong>$1,000 credit</strong> applied</div>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-amber-700 font-bold">Net difference</div>
                  <div className="text-sm text-slate-800 mt-1">Pay <strong>$6,000 more</strong> for Premium (instead of $6,000)</div>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500 italic">
                "Prove it works at the fast price. Upgrade when you see the results."
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function CTASection() {
  return (
    <section className="py-20 bg-gradient-to-br from-teal-900 via-slate-950 to-slate-950 text-white">
      <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
        <h2 className="font-display text-3xl md:text-4xl font-bold">
          Lock in your 24-hour build.
        </h2>
        <p className="mt-4 text-lg text-slate-300">
          20-minute discovery call. No pressure. No pitch deck. Just a real conversation
          about your coaching.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={TIDYCAL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="coach-process-cta-book"
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-7 py-3.5 rounded-md text-base shadow-lg shadow-amber-500/20 transition"
          >
            <Calendar className="h-4 w-4" />
            Book Discovery Call
            <ArrowRight className="h-4 w-4" />
          </a>
          <Link
            to="/coaches/results"
            className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-7 py-3.5 rounded-md text-base transition"
          >
            See expected results
          </Link>
        </div>
      </div>
    </section>
  );
}
