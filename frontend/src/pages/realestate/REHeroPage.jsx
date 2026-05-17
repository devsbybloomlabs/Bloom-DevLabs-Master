/**
 * Real Estate — Page 1 (Hero / Sales). URL: /real-estate
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Calendar, AlertCircle, DollarSign, Database, Inbox, LayoutDashboard,
  Check, ShieldCheck, Sparkles, TrendingUp, Clock, ChevronDown, Star, Flame, CreditCard, MapPin, MessageSquareOff
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import RELayout from "./RELayout";
import { SimpleREROICalculator } from "./components/REROICalculator";
import RECheckoutDialog from "./components/RECheckoutDialog";

const TIDYCAL = BRAND.tidycal;

export default function REHeroPage() {
  return (
    <RELayout breadcrumb="Overview">
      <Hero /><PreQual /><Problem /><Solution /><Offer /><ROI /><SocialProof /><FAQ /><FinalCTA />
    </RELayout>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white" data-testid="re-hero-section">
      <div className="absolute inset-0 opacity-25 mix-blend-luminosity bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1900&q=80')" }} />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10 py-20 md:py-28">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 bg-amber-500/15 border border-amber-400/40 text-amber-300 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-6" data-testid="re-hero-badge">
            <Flame className="h-3.5 w-3.5" />Built for individual agents &amp; small teams
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
            Your real-estate website just became your <span className="text-amber-300">best lead machine.</span>
          </h1>
          <p className="mt-6 text-lg text-slate-300 max-w-2xl leading-relaxed">
            <strong className="text-white">24-hour MLS-integrated site</strong> + automated lead capture. Stop losing deals to competitors. Go live tomorrow.
          </p>
          <div className="mt-7 grid sm:grid-cols-2 gap-3 max-w-2xl">
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4" data-testid="re-hero-path-starter">
              <div className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">Path A · starter</div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">$2,995</div>
              <div className="text-xs text-slate-300 mt-0.5">Live in 24 hours</div>
            </div>
            <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-4" data-testid="re-hero-path-premium">
              <div className="text-[10px] uppercase tracking-wider text-indigo-300 font-bold">Path B · premium</div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">$8,995</div>
              <div className="text-xs text-slate-300 mt-0.5">CRM + drip + SMS</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            → or start with Starter, upgrade later ($1,000 credit applied if within 14 days).
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <a href="#offer" data-testid="re-hero-cta-primary"
              className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3.5 rounded-md text-base shadow-lg shadow-amber-500/20 transition">
              See your 24-hour Starter<ArrowRight className="h-4 w-4" />
            </a>
            <a href={TIDYCAL} target="_blank" rel="noopener noreferrer" data-testid="re-hero-cta-secondary"
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3.5 rounded-md text-base shadow-lg shadow-orange-500/20 transition">
              <Calendar className="h-4 w-4" />Talk first — book walkthrough
            </a>
          </div>
          <div className="mt-10 flex items-center gap-6 text-sm text-slate-400">
            <S big="20–60" label="qualified leads / mo" /><S big="24 hrs" label="to launch" /><S big="~3 wks" label="to 100% ROI" />
          </div>
        </div>
      </div>
    </section>
  );
}
function S({ big, label }) {
  return <div className="flex items-center gap-2"><span className="font-bold text-2xl text-amber-300 tabular-nums">{big}</span><span className="text-xs uppercase tracking-wider text-slate-500 leading-tight">{label}</span></div>;
}

function PreQual() {
  const items = [
    "You're spending $500–$2,000/mo on Zillow / leads / ads (but capturing nowhere)",
    "You're ready to launch a real MLS-integrated presence this month",
    "You're an individual agent or a small team (1–5 agents)",
  ];
  return (
    <section className="py-16 bg-white" data-testid="re-prequal-section">
      <div className="max-w-4xl mx-auto px-6 lg:px-10">
        <div className="rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 p-8 md:p-12">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-slate-900 leading-tight">Before we go further — is this right for you?</h2>
          <p className="mt-3 text-base text-slate-600">This works best for agents who check all three boxes:</p>
          <ul className="mt-6 space-y-3">
            {items.map((it, i) => (
              <li key={i} className="flex gap-3 items-start text-slate-800" data-testid={`re-prequal-item-${i}`}>
                <div className="h-6 w-6 rounded-full bg-emerald-100 grid place-items-center flex-shrink-0">
                  <Check className="h-3.5 w-3.5 text-emerald-700" strokeWidth={3} />
                </div>
                <span className="text-base leading-relaxed pt-0.5">{it}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section className="py-20 bg-white" data-testid="re-problem-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <AlertCircle className="h-3.5 w-3.5" />Most agent websites are leaking deals
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-slate-900 leading-tight">
            You've got great listings. You've got great skills.<br />
            So why is your website <span className="text-rose-600">costing you deals?</span>
          </h2>
        </div>
        <div className="mt-12 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100/50 border border-rose-200 p-8 md:p-10">
              <div className="text-7xl md:text-8xl font-bold text-rose-600 tabular-nums leading-none">3–4×</div>
              <p className="mt-3 text-xl text-slate-900 font-semibold">more lead conversions go to agents with pro MLS-connected sites</p>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Most agent sites are digital brochures. Pretty. Static. Terrible at capturing leads. Meanwhile, competitors with MLS-integrated sites + lead capture are pulling 30–50 qualified leads a month.
              </p>
            </div>
          </div>
          <div className="space-y-5">
            <PP icon={Database} title="Poor MLS visibility" body="Your best listings sit buried on broker sites — not on your branded presence. Buyers find your competitors instead." />
            <PP icon={MessageSquareOff} title="Lead capture crisis" body="$500–$2,000/mo on ads → leads have nowhere to land. Form-less sites = leads bounce. Bounces = competitor sales." />
            <PP icon={DollarSign} title="Lost deals, quietly" body="One extra deal per month = $4,000–$8,000 in commission. Five missed deals a year = a five-figure mistake you never see." />
          </div>
        </div>
      </div>
    </section>
  );
}
function PP({ icon: Icon, title, body }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="h-11 w-11 rounded-xl bg-slate-900 grid place-items-center text-white flex-shrink-0"><Icon className="h-5 w-5" /></div>
      <div><h3 className="font-semibold text-lg text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed mt-1">{body}</p></div>
    </div>
  );
}

function Solution() {
  const features = [
    { icon: Database, title: "MLS integration that actually works", body: "Your listings pull directly from your MLS. No manual updates. No sync delays. Add a property → it shows up on your site within minutes.", color: "from-indigo-700 to-blue-700" },
    { icon: Inbox, title: "Lead capture on every page", body: "Homepage market-analysis form. Listing inquiry forms. Mortgage calculator. Seller valuation. You capture leads in your sleep.", color: "from-amber-500 to-orange-600" },
    { icon: LayoutDashboard, title: "Live in 24 hours", body: "Friday call at 3pm. Monday morning 9am, your site is live and generating leads. No 6-week timelines. No design meetings.", color: "from-emerald-500 to-teal-600" },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="re-solution-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <Sparkles className="h-3.5 w-3.5" />What we build
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-slate-900 leading-tight">
            MLS integration + lead capture + automation = <span className="text-indigo-800">market dominance.</span>
          </h2>
        </div>
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="group bg-white rounded-2xl p-7 border border-slate-200 hover:border-indigo-300 hover:shadow-xl transition-all duration-300"
              data-testid={`re-feature-${f.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
              <div className={`h-14 w-14 rounded-xl bg-gradient-to-br ${f.color} text-white grid place-items-center mb-5 group-hover:scale-110 transition-transform`}>
                <f.icon className="h-7 w-7" />
              </div>
              <h3 className="font-semibold text-xl text-slate-900">{f.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed mt-2">{f.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link to="/real-estate/how-it-works" className="inline-flex items-center gap-2 text-indigo-800 font-semibold hover:gap-3 transition-all">
            See exactly how each layer works<ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Offer() {
  const [checkoutTier, setCheckoutTier] = useState(null);
  const tiers = [
    { key: "realestate_starter", name: "Starter Website", price: "$2,995", timeline: "24 hours", sub: "Fast. MLS-integrated. Lead-capturing.",
      features: ["MLS-integrated website (mobile-optimized)", "Auto-syncing listings", "Lead-capture on every page", "Email lead dashboard", "30-day support + $1K credit toward Premium (14 days)"], featured: false },
    { key: "realestate_premium", name: "Premium Website", price: "$8,995", timeline: "4 weeks", sub: "Full-funnel · most popular",
      features: ["Everything in Starter", "Advanced CRM + lead scoring", "Drip campaigns (buyer/seller/inquiry)", "SMS follow-up automation", "Video hosting + listing tours", "Custom integrations (Zillow, Realtor.com)", "60-day support"], featured: true },
    { key: "realestate_enterprise", name: "Enterprise / Team", price: "$14,995", timeline: "5–6 weeks", sub: "For brokerages + 5+ agents",
      features: ["Everything in Premium", "Multi-agent / team routing", "White-label branding", "Multi-location support", "Dedicated account manager"], featured: false },
  ];
  return (
    <section id="offer" className="py-20 bg-white" data-testid="re-offer-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <DollarSign className="h-3.5 w-3.5" />Investment
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-slate-900 leading-tight">
            Less than one month of Zillow ads.<br />Way more deals captured.
          </h2>
          <p className="mt-5 text-lg text-slate-600">
            Start with the <strong>Starter</strong> ($2,995) — live in 24 hours, MLS-integrated, lead-capturing. Upgrade to Premium ($8,995) within 14 days with a <strong className="text-emerald-700">$1,000 credit</strong>.
          </p>
        </div>
        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {tiers.map((t) => (
            <div key={t.key} className={`rounded-2xl p-7 border-2 relative transition flex flex-col ${t.featured ? "border-indigo-800 bg-gradient-to-br from-indigo-50 to-white shadow-xl scale-[1.02]" : "border-slate-200 bg-white hover:border-slate-300"}`}
              data-testid={`re-tier-${t.key}`}>
              {t.featured && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-md">Most popular</div>}
              <h3 className="font-semibold text-lg text-slate-900">{t.name}</h3>
              <div className="mt-3 flex items-baseline gap-2"><span className="text-4xl font-bold text-slate-900 tabular-nums">{t.price}</span><span className="text-sm text-slate-500">one-time</span></div>
              <div className="mt-1 flex items-center gap-2 text-sm"><Clock className="h-3.5 w-3.5 text-slate-500" /><span className="text-slate-700 font-medium">{t.timeline}</span></div>
              <p className="text-xs text-slate-500 mt-1">{t.sub}</p>
              <ul className="mt-6 space-y-2.5 flex-1">
                {t.features.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700"><Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" /><span>{f}</span></li>
                ))}
              </ul>
              <div className="mt-7 space-y-2">
                <button type="button" onClick={() => setCheckoutTier(t.key)} data-testid={`re-tier-pay-${t.key}`}
                  className={`inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-md font-semibold text-sm transition ${t.featured ? "bg-indigo-800 hover:bg-indigo-900 text-white" : "bg-slate-900 hover:bg-slate-800 text-white"}`}>
                  <CreditCard className="h-4 w-4" />Pay with PayPal · {t.price}
                </button>
                <a href={TIDYCAL} target="_blank" rel="noopener noreferrer" data-testid={`re-tier-cta-${t.key}`}
                  className="inline-flex items-center justify-center gap-1.5 w-full px-5 py-2 rounded-md font-medium text-xs text-slate-600 hover:text-slate-900 transition">
                  <Calendar className="h-3.5 w-3.5" />Or talk first — book a walkthrough
                </a>
              </div>
            </div>
          ))}
        </div>
        <RECheckoutDialog open={Boolean(checkoutTier)} onOpenChange={(o) => !o && setCheckoutTier(null)} tierKey={checkoutTier} />
      </div>
    </section>
  );
}

function ROI() {
  return (
    <section className="py-20 bg-slate-50" data-testid="re-roi-section">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <TrendingUp className="h-3.5 w-3.5" />Run your own numbers
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">One extra deal pays for the entire system.</h2>
        </div>
        <SimpleREROICalculator />
      </div>
    </section>
  );
}

function SocialProof() {
  const cards = [
    { quote: "My first lead came through my new website 6 hours after launch. Closed $89,000 in commission that first month.", who: "Sarah M., Denver CO" },
    { quote: "I was hemorrhaging leads to competitors. New website paid for itself in 10 days.", who: "Marcus T., Austin TX" },
    { quote: "Best decision I made this year. The lead capture is insane. I went from 2-3 leads/month to 40+.", who: "Jessica L., Phoenix AZ" },
  ];
  return (
    <section className="py-20 bg-white" data-testid="re-social-proof">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="grid md:grid-cols-3 gap-6 text-center mb-12">
          <Big big="20–60" label="qualified leads / month" tone="emerald" />
          <Big big="$4–8K" label="commission per extra deal" tone="indigo" />
          <Big big="~3 wks" label="to 100% ROI" tone="amber" />
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {cards.map((c, i) => (
            <div key={i} className="rounded-2xl bg-slate-900 text-white p-7 relative">
              <div className="flex gap-0.5 mb-3">{[...Array(5)].map((_, i) => <Star key={i} className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />)}</div>
              <p className="text-sm leading-relaxed">"{c.quote}"</p>
              <div className="mt-4 text-xs text-slate-400 flex items-center gap-1.5"><MapPin className="h-3 w-3" />{c.who}</div>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-slate-500 mt-6 italic max-w-2xl mx-auto">
          Composite quotes drawn from launch interviews — representative agent profiles. Your results will vary by market.
        </p>
      </div>
    </section>
  );
}
function Big({ big, label, tone }) {
  const tones = { emerald: "text-emerald-600", indigo: "text-indigo-700", amber: "text-amber-600" };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8">
      <div className={`text-5xl md:text-6xl font-bold tabular-nums ${tones[tone]}`}>{big}</div>
      <div className="mt-2 text-base font-semibold text-slate-900">{label}</div>
    </div>
  );
}

function FAQ() {
  const [open, setOpen] = useState(0);
  const faqs = [
    { q: "Does this work with my MLS?", a: "If your MLS exposes an API (most modern MLSs do — REcolorado, CRMLS, MLSPIN, NWMLS, etc.), yes. We map it during your discovery call. If your MLS is API-locked, we'll tell you upfront." },
    { q: "Is 24 hours actually real?", a: "Yes. Friday 3pm call → Saturday build → Sunday review → Monday 9am live. We've built this process to compress without sacrificing quality." },
    { q: "What if I want to upgrade later?", a: "Starter ($2,995) → Premium ($8,995) with a $1,000 credit if you upgrade within 14 days. You only pay $5,000 more — and you get advanced CRM, drip campaigns, SMS, and custom integrations." },
    { q: "Will the leads be qualified?", a: "Lead capture forms ask the right questions (budget, timeline, neighborhood). Automated follow-up nurtures cold leads into warm. You spend time on prospects who are ready, not tire-kickers." },
    { q: "What's the ROI timeline?", a: "Most agents recoup the $2,995 in their first deal closed from website leads — typically within weeks 2–4. After that, every deal is pure margin on top of the system." },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="re-faq-section">
      <div className="max-w-3xl mx-auto px-6 lg:px-10">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 text-center mb-12">Common questions, answered.</h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white overflow-hidden" data-testid={`re-faq-item-${i}`}>
              <button className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
                onClick={() => setOpen(open === i ? -1 : i)} data-testid={`re-faq-toggle-${i}`}>
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
    <section className="relative overflow-hidden py-20 bg-gradient-to-br from-indigo-950 via-slate-950 to-slate-950 text-white" data-testid="re-final-cta">
      <div className="absolute inset-0 opacity-10 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&w=1900&q=80')" }} />
      <div className="relative max-w-4xl mx-auto px-6 lg:px-10 text-center">
        <div className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/40 text-amber-300 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-5">
          <Flame className="h-3.5 w-3.5" />Limited capacity
        </div>
        <h2 className="font-display text-3xl md:text-5xl font-bold leading-tight">
          We have <span className="text-amber-300">3 spots this week</span> for 24-hour builds.
        </h2>
        <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto">
          After that, wait time goes to 1–2 weeks. Your MLS-integrated site is 24 hours away.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
          <a href={TIDYCAL} target="_blank" rel="noopener noreferrer" data-testid="re-final-cta-button"
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-7 py-4 rounded-md text-base shadow-2xl shadow-amber-500/30 transition">
            <Calendar className="h-5 w-5" />Yes, build my MLS website<ArrowRight className="h-5 w-5" />
          </a>
          <Link to="/real-estate/process"
            className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold px-7 py-4 rounded-md text-base transition">
            See our 24-hour process
          </Link>
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />Approve each phase before payment · No long-term contracts
        </div>
      </div>
    </section>
  );
}
