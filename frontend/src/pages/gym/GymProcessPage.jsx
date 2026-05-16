/**
 * Gym Owners — Page 3 (Our Process).
 * URL: /gym-owners/process
 */
import { Link } from "react-router-dom";
import {
  Calendar,
  ArrowRight,
  Compass,
  Layers,
  Hammer,
  Rocket,
  Clock,
  CheckCircle2,
  Shield,
  MessageCircle,
  Headphones,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import GymLayout from "./GymLayout";

const TIDYCAL = BRAND.tidycal;

export default function GymProcessPage() {
  return (
    <GymLayout breadcrumb="Our Process">
      <Hero />
      <TimelineSection />
      <CommitmentSection />
      <SupportSection />
      <GuaranteeSection />
      <ChecklistSection />
      <CTASection />
    </GymLayout>
  );
}

function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 text-white py-20 md:py-24 overflow-hidden">
      <div className="absolute inset-0 opacity-15 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1900&q=80')" }} />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] max-w-3xl">
          From discovery to launch in <span className="text-emerald-400">4 weeks</span>.
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-2xl leading-relaxed">
          A predictable 4-week build with two checkpoints, one launch, and
          roughly an hour a week of your time. Here's exactly what each
          week looks like.
        </p>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function TimelineSection() {
  const weeks = [
    {
      icon: Compass,
      tone: "emerald",
      title: "Discovery & Design",
      duration: "5 days",
      commit: "One 60-min discovery call",
      what: "You walk us through your gym. We learn: how you sign up members, how you run classes, what data matters, which processes feel broken.",
      gets: "Custom system spec tailored to YOUR workflow.",
      deliverable: "Detailed written specification document.",
    },
    {
      icon: Layers,
      tone: "blue",
      title: "Skeleton & Feedback",
      duration: "7 days",
      commit: "One 45-min feedback session",
      what: "We build a working skeleton with the core features — dashboard, automated emails, analytics. You click around. You tell us what to change.",
      gets: "Hands-on preview of your system.",
      deliverable: "Interactive prototype, live URL.",
    },
    {
      icon: Hammer,
      tone: "orange",
      title: "Full Build",
      duration: "7 days",
      commit: "One 30-min check-in (optional)",
      what: "Heavy development week. Payment processing, member mobile app, advanced features, every integration goes in.",
      gets: "Near-complete system.",
      deliverable: "Full system 90% complete + staging URL.",
    },
    {
      icon: Rocket,
      tone: "emerald",
      title: "Launch & Training",
      duration: "7 days",
      commit: "Final 60-min training call",
      what: "Final testing. Go live on your domain. Train your team. Hand-over the playbook.",
      gets: "Live system + trained team + 60-day support starts.",
      deliverable: "Production system live. Team owns it.",
    },
  ];
  return (
    <section className="py-20 bg-white" data-testid="process-timeline-section">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="space-y-8">
          {weeks.map((w, i) => (
            <WeekBlock key={i} index={i + 1} total={weeks.length} {...w} />
          ))}
        </div>
      </div>
    </section>
  );
}

function WeekBlock({ index, total, icon: Icon, tone, title, duration, commit, what, gets, deliverable }) {
  const tones = {
    emerald: "from-emerald-500 to-teal-600",
    blue: "from-blue-600 to-indigo-700",
    orange: "from-orange-500 to-amber-600",
  };
  const progress = (index / total) * 100;
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm"
      data-testid={`process-week-${index}`}
    >
      <div className={`h-2 bg-gradient-to-r ${tones[tone]}`} style={{ width: `${progress}%` }} />
      <div className="p-7 md:p-9">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          <div className="flex-shrink-0">
            <div className={`h-16 w-16 rounded-2xl bg-gradient-to-br ${tones[tone]} text-white grid place-items-center shadow-lg`}>
              <Icon className="h-7 w-7" strokeWidth={2.2} />
            </div>
            <div className="mt-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Week</div>
              <div className="text-3xl font-bold text-slate-900 tabular-nums">{index}<span className="text-slate-300">/{total}</span></div>
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
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
    <section className="py-20 bg-slate-50" data-testid="process-commitment-section">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
              <Clock className="h-3.5 w-3.5" />
              Your time
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 leading-tight">
              Total investment: <span className="text-emerald-600">~3 hours over 4 weeks.</span>
            </h2>
            <p className="mt-5 text-base text-slate-600 leading-relaxed">
              That's less than 1 hour per week. We handle every technical
              decision, every integration, every line of code. You bring the
              gym-owner perspective.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-7">
            <div className="space-y-3">
              {[
                { week: "Week 1", time: "60 min", purpose: "Discovery call" },
                { week: "Week 2", time: "45 min", purpose: "Prototype feedback" },
                { week: "Week 3", time: "30 min", purpose: "Optional check-in" },
                { week: "Week 4", time: "60 min", purpose: "Launch training" },
              ].map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="font-semibold text-slate-900">{r.week}</div>
                  <div className="text-sm text-slate-600 flex-1 text-center">{r.purpose}</div>
                  <div className="text-sm font-bold text-blue-700 tabular-nums">{r.time}</div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="font-bold text-emerald-900">Total</div>
                <div className="text-sm font-bold text-emerald-700 tabular-nums">3 hours, 15 min</div>
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
    <section className="py-20 bg-white" data-testid="process-support-section">
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
          <Card icon={MessageCircle} title="During build" tone="blue"
            body="Direct Slack access. Email replies inside 4 business hours. Weekly video check-ins." />
          <Card icon={Shield} title="60 days post-launch" tone="emerald"
            body="Bug fixes, optimisation, training questions. Anything that comes up — we handle it." />
          <Card icon={Headphones} title="After 60 days" tone="orange"
            body="Ongoing support available on a flat monthly plan. Optional, never required." />
        </div>
      </div>
    </section>
  );
}

function Card({ icon: Icon, title, body, tone }) {
  const tones = {
    blue: "border-blue-200 from-blue-50",
    emerald: "border-emerald-200 from-emerald-50",
    orange: "border-orange-200 from-orange-50",
  };
  const iconTones = {
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
    orange: "bg-orange-100 text-orange-700",
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
    <section className="py-20 bg-slate-950 text-white" data-testid="process-guarantee-section">
      <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
        <div className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-5">
          <Shield className="h-3.5 w-3.5" />
          Risk-free
        </div>
        <h2 className="font-display text-3xl md:text-5xl font-bold leading-tight">
          30-day money-back guarantee.
        </h2>
        <p className="mt-6 text-lg text-slate-300 leading-relaxed">
          If you're not satisfied within 30 days of going live, we refund your
          investment. No questions, no forms, no salvage-call. That's how
          confident we are in this system.
        </p>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function ChecklistSection() {
  const items = [
    "Unlimited design revisions",
    "Member mobile app",
    "Payment processing integration",
    "Email automation setup",
    "Analytics dashboard",
    "Team training session",
    "60-day post-launch support",
    "30-day money-back guarantee",
  ];
  return (
    <section className="py-20 bg-white" data-testid="process-checklist-section">
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
function CTASection() {
  return (
    <section className="py-20 bg-gradient-to-br from-blue-900 via-blue-950 to-slate-950 text-white">
      <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
        <h2 className="font-display text-3xl md:text-4xl font-bold">
          See if we're a good fit.
        </h2>
        <p className="mt-4 text-lg text-slate-300">
          60-minute discovery call. No pressure. No pitch deck. Just a real
          conversation about your gym.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={TIDYCAL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="process-cta-book"
            className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-7 py-3.5 rounded-md text-base shadow-lg shadow-orange-500/20 transition"
          >
            <Calendar className="h-4 w-4" />
            Book Discovery Call
            <ArrowRight className="h-4 w-4" />
          </a>
          <Link
            to="/gym-owners/results"
            className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-7 py-3.5 rounded-md text-base transition"
          >
            See expected results
          </Link>
        </div>
      </div>
    </section>
  );
}
