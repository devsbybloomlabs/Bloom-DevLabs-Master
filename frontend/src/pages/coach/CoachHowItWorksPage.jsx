/**
 * Coaches & Consultants — Page 2 (How It Works).
 * URL: /coaches/how-it-works
 */
import { Link } from "react-router-dom";
import {
  Globe,
  CalendarCheck,
  LayoutDashboard,
  ArrowRight,
  CreditCard,
  Mail,
  Calendar,
  Video,
  ShieldCheck,
  Database,
  Lock,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import CoachLayout from "./CoachLayout";
import { buildNicheSeo } from "@/lib/seo";

const TIDYCAL = BRAND.tidycal;

export default function CoachHowItWorksPage() {
  return (
    <CoachLayout breadcrumb="How It Works" seo={buildNicheSeo("coach", "HowItWorks")}>
      <Hero />
      <FeaturesSection />
      <IntegrationsSection />
      <JourneySection />
      <SecuritySection />
      <BehindSection />
      <CTASection />
    </CoachLayout>
  );
}

function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-teal-950 via-slate-900 to-slate-950 text-white py-20 md:py-24 overflow-hidden">
      <div className="absolute inset-0 opacity-15 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=1900&q=80')" }} />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] max-w-3xl">
          How your <span className="text-amber-300">24-hour website</span> system works.
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-2xl leading-relaxed">
          Three connected pieces — a professional website, a one-click booking
          engine, and a client dashboard. Built around <em>your</em> coaching, not
          a template. Here's exactly what each one does.
        </p>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function FeaturesSection() {
  const features = [
    {
      icon: Globe,
      title: "Professional website (branded for YOU)",
      tone: "teal",
      desc: "Not generic. Tells YOUR story — your photos, credentials, approach, testimonials. Clients see you as the expert you are. Mobile-optimized so they can find you from their phone.",
      mock: <WebsiteMock />,
      bullets: [
        "Custom branding (your colors, fonts, voice)",
        "Mobile-first design",
        "SEO-optimized so leads find you on Google",
      ],
    },
    {
      icon: CalendarCheck,
      title: "One-click booking system",
      tone: "amber",
      desc: "Clients don't email asking 'when are you available?' They see your calendar, pick a time, enter payment, session booked. Two clicks. You get a confirmation. They get a confirmation. No back-and-forth.",
      mock: <BookingMock />,
      bullets: [
        "Real-time calendar sync (Google / iCal / Outlook)",
        "Payment processed at booking (Stripe / PayPal)",
        "Automatic email confirmations + reminders",
      ],
    },
    {
      icon: LayoutDashboard,
      title: "Client dashboard",
      tone: "emerald",
      desc: "After their first session, clients log into their personal dashboard. They see session notes, download resources, track progress. It makes them feel like they're in a real program — not just getting calls.",
      mock: <DashboardMock />,
      bullets: [
        "Session notes + history",
        "Downloadable resources you share",
        "Progress tracking + rebook with one click",
      ],
    },
  ];

  return (
    <section className="py-20 bg-white" data-testid="coach-how-features">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-24">
        {features.map((f, i) => (
          <FeatureBlock key={i} index={i} {...f} />
        ))}
      </div>
    </section>
  );
}

function FeatureBlock({ icon: Icon, title, desc, mock, bullets, tone, index }) {
  const tones = {
    teal: "from-teal-600 to-cyan-700",
    amber: "from-amber-500 to-orange-600",
    emerald: "from-emerald-500 to-teal-600",
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
          {bullets.map((p, i) => (
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

function WebsiteMock() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-xl" data-testid="coach-mock-website">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 border-b border-slate-200">
          <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <div className="ml-3 text-[10px] text-slate-500 font-mono">yourcoaching.com</div>
        </div>
        <div className="p-5 space-y-3">
          <div className="h-3 w-1/3 bg-teal-700 rounded" />
          <div className="space-y-1.5">
            <div className="h-2 w-3/4 bg-slate-200 rounded" />
            <div className="h-2 w-2/3 bg-slate-200 rounded" />
            <div className="h-2 w-1/2 bg-slate-200 rounded" />
          </div>
          <div className="flex gap-2 pt-2">
            <div className="h-7 w-24 bg-amber-500 rounded text-[10px] text-white grid place-items-center font-semibold">Book a call</div>
            <div className="h-7 w-20 bg-slate-100 border border-slate-200 rounded" />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2">
            <div className="aspect-square bg-slate-100 rounded" />
            <div className="aspect-square bg-slate-100 rounded" />
            <div className="aspect-square bg-slate-100 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingMock() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const slots = ["9:00", "10:30", "1:00", "2:30", "4:00"];
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-xl" data-testid="coach-mock-booking">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Pick a time</span>
          <span className="text-[10px] text-emerald-600 font-medium">● Available</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5 mb-3">
          {days.map((d, i) => (
            <div key={d} className={`text-[10px] text-center font-medium py-2 rounded ${i === 1 ? "bg-amber-500 text-white" : "bg-slate-50 text-slate-700"}`}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {slots.map((s, i) => (
            <div key={s} className={`text-xs text-center py-2 rounded border ${i === 2 ? "border-amber-500 bg-amber-50 text-amber-700 font-bold" : "border-slate-200 text-slate-700"}`}>
              {s} PM
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-600">1-on-1 · $150</span>
          <div className="bg-amber-500 text-white text-xs font-semibold px-3 py-1.5 rounded">Confirm &amp; Pay</div>
        </div>
      </div>
    </div>
  );
}

function DashboardMock() {
  const items = [
    { title: "Session notes — Mar 4", tag: "Notes" },
    { title: "Goal-setting workbook.pdf", tag: "Resource" },
    { title: "Next session: Tue, Mar 12", tag: "Upcoming" },
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-xl" data-testid="coach-mock-dashboard">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Hi Sarah · your portal</span>
          <span className="text-[10px] text-teal-700 font-medium">3 items</span>
        </div>
        <div className="divide-y divide-slate-100">
          {items.map((it, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-slate-900">{it.title}</span>
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-teal-100 text-teal-700">
                {it.tag}
              </span>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <div className="bg-teal-700 text-white text-xs font-semibold px-3 py-2 rounded text-center">
            Rebook a session
          </div>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
function IntegrationsSection() {
  const integrations = [
    { name: "Stripe", category: "Payments", icon: CreditCard },
    { name: "PayPal", category: "Payments", icon: CreditCard },
    { name: "Email", category: "Auto-confirmations", icon: Mail },
    { name: "Google Calendar", category: "Calendar sync", icon: Calendar },
    { name: "iCal / Outlook", category: "Calendar sync", icon: Calendar },
    { name: "Zoom", category: "Video sessions", icon: Video },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="coach-how-integrations">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-1.5 bg-slate-200 text-slate-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <RefreshCw className="h-3.5 w-3.5" />
            Everything works together
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            It all runs automatically.
          </h2>
          <p className="mt-4 text-base text-slate-600 leading-relaxed">
            You don't have to copy/paste anything. Payments process, calendars sync,
            emails fire, video links generate — all hands-off.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {integrations.map((i) => (
            <div key={i.name} className="rounded-xl bg-white border border-slate-200 p-5 hover:border-teal-300 hover:shadow-md transition">
              <div className="h-9 w-9 rounded-lg bg-teal-50 grid place-items-center mb-2">
                <i.icon className="h-4 w-4 text-teal-700" />
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{i.category}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{i.name}</div>
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
    { title: "Client finds you", desc: "Google, LinkedIn, referral — they land on your professional website." },
    { title: "Lands on your site", desc: "Sees your story, credentials, testimonials. Thinks: 'this person is legit.'" },
    { title: "Books a session", desc: "One click → calendar → pay → confirmed. No emails. No friction." },
    { title: "Gets confirmation", desc: "Branded email lands instantly. Calendar invite syncs to their calendar." },
    { title: "Logs into dashboard", desc: "Sees their first session info, prep materials, welcome message from you." },
    { title: "Attends session", desc: "Zoom link auto-generated. You both join. They feel taken care of." },
    { title: "Downloads resources", desc: "Post-session: notes, workbook, recordings — all in their dashboard." },
    { title: "Rebooks next session", desc: "One click. No emails. They stay engaged because the experience is smooth." },
  ];
  return (
    <section className="py-20 bg-white" data-testid="coach-how-journey">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 text-center mb-4">
          The client journey, end to end.
        </h2>
        <p className="text-base text-slate-600 text-center max-w-2xl mx-auto mb-12 leading-relaxed">
          From "they found you" to "they rebooked" — every step is captured,
          automated, and visible. You stay in control without doing the manual work.
        </p>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-4 items-start group" data-testid={`coach-how-journey-step-${i}`}>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-teal-600 to-amber-500 grid place-items-center text-white font-bold text-sm flex-shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 group-hover:border-teal-300 transition">
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
    { icon: CheckCircle2, title: "GDPR + CCPA", desc: "Compliant client-data handling, by default." },
  ];
  return (
    <section className="py-20 bg-slate-950 text-white" data-testid="coach-how-security">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <ShieldCheck className="h-3.5 w-3.5" />
            Bank-level security
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold leading-tight">
            Your client data is locked down.
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
function BehindSection() {
  return (
    <section className="py-20 bg-gradient-to-br from-teal-50 to-amber-50/50">
      <div className="max-w-4xl mx-auto px-6 lg:px-10">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="rounded-2xl bg-white border border-slate-200 p-7">
            <div className="text-xs uppercase tracking-wider text-teal-700 font-bold mb-3">Your job</div>
            <h3 className="font-display text-2xl font-bold text-slate-900">Tell us about your coaching.</h3>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Your niche. Your offer. Your unique approach. The story you want clients to
              hear first. That's it. We translate it into a professional site.
            </p>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200 p-7">
            <div className="text-xs uppercase tracking-wider text-amber-700 font-bold mb-3">Our job</div>
            <h3 className="font-display text-2xl font-bold text-slate-900">Handle the tech.</h3>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Design, build, integrate, test, deploy, train you. You focus on coaching.
              We focus on the website that works 24/7 to book clients for you.
            </p>
          </div>
        </div>
        <p className="mt-8 text-center text-base font-semibold text-slate-700 italic">
          "One day to build. Lifetime to use."
        </p>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
function CTASection() {
  return (
    <section className="py-20 bg-gradient-to-br from-teal-50 to-amber-50 border-t border-slate-200">
      <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
          See it in action.
        </h2>
        <p className="mt-4 text-lg text-slate-600">
          20-minute walkthrough of the website, booking system, and client dashboard
          built for coaches like you.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={TIDYCAL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="coach-how-cta-demo"
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-7 py-3.5 rounded-md text-base shadow-lg shadow-amber-500/20 transition"
          >
            <Calendar className="h-4 w-4" />
            Schedule Demo
            <ArrowRight className="h-4 w-4" />
          </a>
          <Link
            to="/coaches/process"
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 font-semibold px-7 py-3.5 rounded-md text-base transition"
          >
            See the 24-hour build process
          </Link>
        </div>
      </div>
    </section>
  );
}
