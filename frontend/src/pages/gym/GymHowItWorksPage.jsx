/**
 * Gym Owners — Page 2 (How It Works).
 * URL: /gym-owners/how-it-works
 */
import { Link } from "react-router-dom";
import {
  Activity,
  Bell,
  BarChart3,
  ArrowRight,
  CreditCard,
  Mail,
  Calendar,
  ShieldCheck,
  Database,
  Lock,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import GymLayout from "./GymLayout";
import { buildNicheSeo } from "@/lib/seo";

const TIDYCAL = BRAND.tidycal;

export default function GymHowItWorksPage() {
  return (
    <GymLayout breadcrumb="How It Works" seo={buildNicheSeo("gym", "HowItWorks")}>
      <Hero />
      <DualPathSection />
      <FeaturesSection />
      <IntegrationsSection />
      <JourneySection />
      <SecuritySection />
      <CTASection />
    </GymLayout>
  );
}

function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 text-white py-20 md:py-24 overflow-hidden">
      <div
        className="absolute inset-0 opacity-15 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=1900&q=80')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] max-w-3xl">
          How we prevent <span className="text-emerald-400">member churn</span><br />
          (even if you've tried everything else).
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-2xl leading-relaxed">
          Three connected pieces — a member dashboard, an automated follow-up engine,
          and a real-analytics layer. Built around <em>your</em> workflow, not a
          template. Here's exactly what each one does and how they compound to keep members.
        </p>
      </div>
    </section>
  );
}

function DualPathSection() {
  const paths = [
    {
      label: "Path A",
      tag: "Prototype",
      price: "$2,995",
      timeline: "24 hours",
      tone: "emerald",
      flow: ["Discovery", "Mockup build", "Demo + feedback", "Done"],
      bullets: [
        "Working member-tracking dashboard",
        "1 automated-email template",
        "Discovery + demo session included",
      ],
      footer: "Next: decide to upgrade — we credit $1,000 if you do within 14 days.",
    },
    {
      label: "Path B",
      tag: "Full Build",
      price: "$8,995",
      timeline: "3 weeks",
      tone: "blue",
      flow: ["Discovery", "Skeleton", "Feedback loop", "Full launch", "Training"],
      bullets: [
        "Everything in Path A",
        "Payment integration (Stripe / Square)",
        "Member mobile app",
        "Advanced analytics + churn predictor",
        "60-day support",
      ],
      footer: "Launches in 3 weeks. You approve each phase before payment moves forward.",
    },
  ];
  const tones = {
    emerald: {
      border: "border-emerald-300",
      header: "from-emerald-500 to-teal-600",
      chip: "bg-emerald-100 text-emerald-700",
      arrow: "text-emerald-500",
    },
    blue: {
      border: "border-blue-300",
      header: "from-blue-600 to-indigo-700",
      chip: "bg-blue-100 text-blue-700",
      arrow: "text-blue-500",
    },
  };
  return (
    <section className="py-20 bg-slate-50" data-testid="how-dual-path-section">
      <div className="max-w-6xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            Two paths · one outcome
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 leading-tight">
            Choose your risk level. Both paths start the same way.
          </h2>
          <p className="mt-4 text-base text-slate-600 leading-relaxed">
            Want to see it work in your gym before committing? Start with the
            prototype. Already sold? Skip straight to the full build.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {paths.map((p) => {
            const t = tones[p.tone];
            return (
              <div
                key={p.tag}
                className={`rounded-2xl border-2 ${t.border} bg-white overflow-hidden shadow-sm`}
                data-testid={`how-dual-path-${p.tag.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className={`px-6 py-4 bg-gradient-to-r ${t.header} text-white`}>
                  <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-90">
                    {p.label}
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <h3 className="font-display text-2xl font-bold">{p.tag}</h3>
                    <span className="text-xl font-bold tabular-nums">{p.price}</span>
                  </div>
                  <div className={`inline-flex items-center gap-1 mt-2 text-[11px] uppercase tracking-wider font-bold ${t.chip} px-2 py-0.5 rounded`}>
                    {p.timeline}
                  </div>
                </div>
                <div className="px-6 py-5 border-b border-slate-100">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3">Flow</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.flow.map((step, idx) => (
                      <span key={step} className="inline-flex items-center gap-1.5">
                        <span className="text-sm font-medium text-slate-800 bg-slate-100 px-2 py-1 rounded">
                          {step}
                        </span>
                        {idx < p.flow.length - 1 && (
                          <ArrowRight className={`h-3.5 w-3.5 ${t.arrow}`} />
                        )}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="px-6 py-5">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3">You get</div>
                  <ul className="space-y-2">
                    {p.bullets.map((b, idx) => (
                      <li key={idx} className="flex gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-slate-500 italic mt-4 leading-relaxed">{p.footer}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-xl bg-gradient-to-br from-emerald-50 to-blue-50 border-2 border-dashed border-slate-300 p-5 text-center">
          <p className="text-sm text-slate-700">
            <strong className="text-slate-900">Most owners start with the prototype.</strong>{" "}
            ~90% upgrade to the full build within 2 weeks — and we credit{" "}
            <strong className="text-emerald-700">$1,000</strong> off the full price when they do.
          </p>
          <p className="text-[11px] text-slate-500 italic mt-2">
            Upgrade rate is projected based on our member-management methodology — live customer data coming Q2.
          </p>
        </div>
      </div>
    </section>
  );
}


function FeaturesSection() {
  const features = [
    {
      icon: Activity,
      title: "Member management dashboard",
      tone: "emerald",
      desc: "See every member's engagement status at a glance — green (active), yellow (slipping), red (at-risk). Drill into class attendance, purchase history, signup source, anything that matters to your business.",
      mock: <DashboardMock />,
    },
    {
      icon: Bell,
      title: "Automated follow-up engine",
      tone: "blue",
      desc: "Set it once. Inactive 14 days → re-engagement email. New member → 7-day onboarding sequence. Birthday → custom offer. Runs 24/7 without you touching it.",
      mock: <EmailMock />,
    },
    {
      icon: BarChart3,
      title: "Real-time analytics",
      tone: "orange",
      desc: "Member retention rate. Churn predictors. Class popularity. Revenue per member. Make decisions based on data, not gut. Identify problems weeks before they become crises.",
      mock: <AnalyticsMock />,
    },
  ];

  return (
    <section className="py-20 bg-white" data-testid="how-features-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-24">
        {features.map((f, i) => (
          <FeatureBlock key={i} index={i} {...f} />
        ))}
      </div>
    </section>
  );
}

function FeatureBlock({ icon: Icon, title, desc, mock, tone, index }) {
  const tones = {
    emerald: "from-emerald-500 to-teal-600",
    blue: "from-blue-600 to-indigo-700",
    orange: "from-orange-500 to-amber-600",
  };
  const reverse = index % 2 === 1;
  return (
    <div className={`grid lg:grid-cols-2 gap-10 items-center ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}>
      <div>
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs uppercase tracking-wider font-semibold bg-gradient-to-r ${tones[tone]} text-white mb-5`}>
          <Icon className="h-3.5 w-3.5" />
          Feature {index + 1}
        </div>
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 leading-tight">{title}</h2>
        <p className="mt-5 text-base text-slate-600 leading-relaxed">{desc}</p>
        <ul className="mt-6 space-y-2.5">
          {["Custom-fit to your workflow", "Mobile-first interface", "Real-time data, no refresh needed"].map((p, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-700">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>{mock}</div>
    </div>
  );
}

function DashboardMock() {
  const rows = [
    { name: "Sarah K.", visits: 12, status: "active", color: "emerald" },
    { name: "Mike R.", visits: 2, status: "at-risk", color: "amber" },
    { name: "Jenna L.", visits: 0, status: "churning", color: "rose" },
    { name: "Daniel O.", visits: 9, status: "active", color: "emerald" },
    { name: "Priya N.", visits: 4, status: "watch", color: "amber" },
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-xl" data-testid="how-mock-dashboard">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Members · 247 total</span>
          <span className="text-[10px] text-emerald-600 font-medium">● Live · 2s ago</span>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full bg-${r.color}-500`} />
                <span className="text-sm font-medium text-slate-900">{r.name}</span>
                <span className="text-xs text-slate-500 tabular-nums">{r.visits}× / 30d</span>
              </div>
              <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-${r.color}-100 text-${r.color}-700`}>
                {r.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmailMock() {
  const flows = [
    { trigger: "New signup", action: "Welcome + class schedule", delay: "0 min" },
    { trigger: "Day 3", action: "Trainer intro + intro-class offer", delay: "3 days" },
    { trigger: "Inactive 14d", action: "Re-engagement: \"We miss you\"", delay: "automatic" },
    { trigger: "Inactive 21d", action: "1-on-1 check-in invite", delay: "automatic" },
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-xl" data-testid="how-mock-emails">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Email automation · 4 active flows</div>
        <div className="space-y-2.5">
          {flows.map((f, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-blue-50/50 border border-blue-100">
              <div className="h-8 w-8 rounded-md bg-blue-600 grid place-items-center text-white">
                <Mail className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900">{f.trigger}</div>
                <div className="text-xs text-slate-600">{f.action}</div>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-blue-700 font-bold">{f.delay}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalyticsMock() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-xl" data-testid="how-mock-analytics">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Metric label="Retention" value="82%" delta="+11" tone="emerald" />
          <Metric label="Churn / mo" value="4.2%" delta="−1.8" tone="emerald" />
          <Metric label="MRR" value="$31.4K" delta="+$3.1K" tone="emerald" />
        </div>
        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Retention by cohort</div>
        <div className="flex items-end gap-1 h-24">
          {[55, 68, 72, 76, 79, 82, 80, 84].map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-gradient-to-t from-orange-500 to-orange-400 rounded-t"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate-400">
          <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, delta, tone }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="text-xl font-bold text-slate-900 tabular-nums">{value}</div>
      <div className={`text-[10px] font-semibold tabular-nums text-${tone}-600`}>{delta}</div>
    </div>
  );
}

// --------------------------------------------------------------------------
function IntegrationsSection() {
  const integrations = [
    { name: "Stripe", category: "Payments" },
    { name: "Square", category: "Payments" },
    { name: "Mailchimp", category: "Email" },
    { name: "ConvertKit", category: "Email" },
    { name: "Google Calendar", category: "Booking" },
    { name: "Calendly", category: "Booking" },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="how-integrations-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-1.5 bg-slate-200 text-slate-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <RefreshCw className="h-3.5 w-3.5" />
            Plays well with others
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            Connects with what you already use.
          </h2>
          <p className="mt-4 text-base text-slate-600 leading-relaxed">
            No ripping and replacing. Your payment processor, email tool, calendar —
            we wire them all in during build.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {integrations.map((i) => (
            <div
              key={i.name}
              className="rounded-xl bg-white border border-slate-200 p-5 text-center hover:border-blue-300 hover:shadow-md transition"
            >
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{i.category}</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{i.name}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function JourneySection() {
  const steps = [
    { title: "Member joins", desc: "Sign-up form auto-syncs to your dashboard. They're tagged ACTIVE / day 0." },
    { title: "Onboarding sequence", desc: "Welcome email, class schedule, intro-offer drip over 7 days. Fully automatic." },
    { title: "Engagement tracking", desc: "Every check-in, class booking, purchase logged. Status updates in real time." },
    { title: "At-risk alert", desc: "14 days quiet → flagged AT RISK → re-engagement email sends automatically." },
    { title: "Re-engagement", desc: "Member gets a personalised \"we miss you\" with a one-tap booking link." },
    { title: "Retention achieved", desc: "Most flagged members come back before they ever considered cancelling." },
  ];
  return (
    <section className="py-20 bg-white" data-testid="how-journey-section">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 text-center mb-4">
          The member journey, automated.
        </h2>
        <p className="text-base text-slate-600 text-center max-w-2xl mx-auto mb-12 leading-relaxed">
          From signup to retention — every step is captured, automated, and visible.
          You stay in control without doing the manual work.
        </p>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-4 items-start group" data-testid={`how-journey-step-${i}`}>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-600 to-emerald-500 grid place-items-center text-white font-bold text-sm flex-shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 group-hover:border-blue-300 transition">
                <div className="font-semibold text-slate-900">{s.title}</div>
                <div className="text-sm text-slate-600 mt-1 leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function SecuritySection() {
  const items = [
    { icon: Lock, title: "SSL encryption", desc: "End-to-end TLS on every request." },
    { icon: Database, title: "Daily backups", desc: "Automatic snapshots, 30-day retention." },
    { icon: ShieldCheck, title: "99.9% uptime", desc: "Enterprise-grade infrastructure SLA." },
    { icon: CheckCircle2, title: "GDPR + CCPA", desc: "Compliant member-data handling, by default." },
  ];
  return (
    <section className="py-20 bg-slate-950 text-white" data-testid="how-security-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <ShieldCheck className="h-3.5 w-3.5" />
            Enterprise-grade security
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold leading-tight">
            Your member data is locked down.
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((i) => (
            <div key={i.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/15 grid place-items-center text-emerald-400 mb-3">
                <i.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-base">{i.title}</h3>
              <p className="text-sm text-slate-400 mt-1.5">{i.desc}</p>
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
    <section className="py-20 bg-gradient-to-br from-emerald-50 to-blue-50 border-t border-slate-200">
      <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
          See it in action.
        </h2>
        <p className="mt-4 text-lg text-slate-600">
          15 minutes. Live walkthrough of the dashboard, email engine, and
          analytics built for a gym just like yours.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={TIDYCAL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="how-cta-demo"
            className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-7 py-3.5 rounded-md text-base shadow-lg shadow-orange-500/20 transition"
          >
            <Calendar className="h-4 w-4" />
            Schedule Demo
            <ArrowRight className="h-4 w-4" />
          </a>
          <Link
            to="/gym-owners/process"
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 font-semibold px-7 py-3.5 rounded-md text-base transition"
          >
            See the 3-week build process
          </Link>
        </div>
      </div>
    </section>
  );
}
