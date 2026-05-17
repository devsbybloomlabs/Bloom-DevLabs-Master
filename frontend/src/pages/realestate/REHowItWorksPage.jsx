/**
 * Real Estate — Page 2 (How It Works). URL: /real-estate/how-it-works
 */
import { Link } from "react-router-dom";
import { Database, Inbox, Mail, BarChart3, ArrowRight, Calendar, ShieldCheck, Lock, RefreshCw, CheckCircle2, Phone } from "lucide-react";
import { BRAND } from "@/lib/brand";
import RELayout from "./RELayout";
import { buildNicheSeo } from "@/lib/seo";

const TIDYCAL = BRAND.tidycal;

export default function REHowItWorksPage() {
  return (
    <RELayout breadcrumb="How It Works" seo={buildNicheSeo("re", "HowItWorks")}>
      <Hero /><Layers /><Integrations /><Journey /><Security /><CTA />
    </RELayout>
  );
}

function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white py-20 md:py-24 overflow-hidden">
      <div className="absolute inset-0 opacity-15 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1900&q=80')" }} />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] max-w-3xl">
          How your MLS-integrated site <span className="text-amber-300">turns visitors into deals.</span>
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-2xl leading-relaxed">
          Four connected layers: MLS sync → Lead capture → Automated follow-up → Lead management. Each one compounds the next.
        </p>
      </div>
    </section>
  );
}

function Layers() {
  const layers = [
    { icon: Database, tone: "indigo", title: "Layer 1: MLS Integration", desc: "Your chosen MLS connects to your website via API. Listings auto-populate within minutes of being added to your MLS. Your site always shows current inventory — full details, photos, virtual tours.", bullets: ["Works with any MLS that exposes an API", "Auto-sync within minutes of MLS changes", "Full listing detail pages (photos, beds/baths, days on market)"] },
    { icon: Inbox, tone: "amber", title: "Layer 2: Lead Capture", desc: "Every page is optimized to convert visitors. Homepage 'Get a free market analysis' captures buyer leads. Listing pages capture inquiry leads. Mortgage calculator + buyer's guide capture warm leads via email gate.", bullets: ["6+ lead-capture surfaces (home, listings, search, resources, about, calculator)", "Forms tuned for high opt-in rate (mobile-first, 3-field max)", "20–60 qualified leads per month from your own site"] },
    { icon: Mail, tone: "emerald", title: "Layer 3: Automated Follow-Up", desc: "Every lead is dropped into triggered email sequences. Buyer leads get neighborhood guides + new-listing alerts. Seller leads get market analyses + comparable sales. 5–7 touchpoints over 14 days. Hands-off.", bullets: ["Buyer / seller / inquiry track separation", "Built-in cadences for each lead type", "Premium tier adds SMS + custom drip workflows"] },
    { icon: BarChart3, tone: "indigo", title: "Layer 4: Lead Management", desc: "Your dashboard shows every lead, when captured, what they want, email open + click rates, and the next-best action. You see opportunities instead of chaos. You follow up strategically.", bullets: ["Lead-by-lead activity feed", "Lead-scoring (hot / warm / cold)", "Premium tier integrates with your CRM (Salesforce, FollowUpBoss, etc.)"] },
  ];
  return (
    <section className="py-20 bg-white" data-testid="re-how-layers">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-24">
        {layers.map((l, i) => <LayerBlock key={i} index={i} {...l} />)}
      </div>
    </section>
  );
}

function LayerBlock({ icon: Icon, title, desc, bullets, tone, index }) {
  const tones = { indigo: "from-indigo-700 to-blue-700", amber: "from-amber-500 to-orange-600", emerald: "from-emerald-500 to-teal-600" };
  const reverse = index % 2 === 1;
  return (
    <div className={`grid lg:grid-cols-2 gap-10 items-start ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}>
      <div>
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs uppercase tracking-wider font-semibold bg-gradient-to-r ${tones[tone]} text-white mb-5`}>
          <Icon className="h-3.5 w-3.5" />Layer {index + 1}
        </div>
        <h2 className="font-display text-2xl md:text-3xl font-bold text-slate-900 leading-tight">{title}</h2>
        <p className="mt-5 text-base text-slate-600 leading-relaxed">{desc}</p>
      </div>
      <ul className="space-y-2.5 rounded-2xl bg-slate-50 border border-slate-200 p-6">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-700">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" /><span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Integrations() {
  const items = [
    { name: "REcolorado", category: "MLS" }, { name: "CRMLS", category: "MLS" }, { name: "MLSPIN", category: "MLS" },
    { name: "Zillow", category: "Listing syndication" }, { name: "Realtor.com", category: "Listing syndication" },
    { name: "FollowUpBoss", category: "CRM" }, { name: "kvCORE", category: "CRM" }, { name: "Salesforce", category: "CRM" },
    { name: "Mailchimp", category: "Email" }, { name: "Twilio", category: "SMS" }, { name: "Calendly", category: "Booking" }, { name: "Stripe", category: "Payments" },
  ];
  return (
    <section className="py-20 bg-slate-50" data-testid="re-how-integrations">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-1.5 bg-slate-200 text-slate-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <RefreshCw className="h-3.5 w-3.5" />Plays well with the tools you already use
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            Your MLS. Your CRM. Your tools.
          </h2>
          <p className="mt-4 text-base text-slate-600 leading-relaxed">
            No ripping out. We wire your existing stack into the new site during build.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((i) => (
            <div key={i.name} className="rounded-xl bg-white border border-slate-200 p-4 hover:border-indigo-300 hover:shadow-md transition">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{i.category}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{i.name}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Journey() {
  const steps = [
    { title: "Buyer finds your site", desc: "Google search, social ad, or referral → lands on your branded MLS page." },
    { title: "Browses listings", desc: "Sees current inventory pulled live from your MLS — filters by neighborhood, price, beds." },
    { title: "Captures lead", desc: "Requests info on a specific listing OR signs up for new-listing alerts (forms on every surface)." },
    { title: "Lands in dashboard", desc: "You see the lead, their interests, what they viewed, and the next-best action." },
    { title: "Automated follow-up", desc: "5–7 touchpoints over 14 days — neighborhood guides, new listings, market data." },
    { title: "Showing booked", desc: "Lead replies. You schedule the showing through your existing calendar." },
    { title: "Deal closed", desc: "Average: 1–2 extra deals per month for individual agents. 3–5 for small teams." },
  ];
  return (
    <section className="py-20 bg-white" data-testid="re-how-journey">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 text-center mb-4">The lead journey, end to end.</h2>
        <p className="text-base text-slate-600 text-center max-w-2xl mx-auto mb-12 leading-relaxed">
          From "they found you" to "you closed" — every step is captured, automated, and visible. You stay in control without doing the manual work.
        </p>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-4 items-start group" data-testid={`re-how-journey-step-${i}`}>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-800 to-amber-500 grid place-items-center text-white font-bold text-sm flex-shrink-0">{i + 1}</div>
              <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 group-hover:border-indigo-300 transition">
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

function Security() {
  const items = [
    { icon: Lock, title: "SSL encryption", desc: "End-to-end TLS on every request." },
    { icon: Phone, title: "Real phone support", desc: "Direct line during the build, plus 30/60 day post-launch." },
    { icon: ShieldCheck, title: "99.9% uptime", desc: "Enterprise-grade infrastructure SLA." },
    { icon: CheckCircle2, title: "MLS-compliant", desc: "Built to honor IDX rules + your MLS's listing display requirements." },
  ];
  return (
    <section className="py-20 bg-slate-950 text-white" data-testid="re-how-security">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <ShieldCheck className="h-3.5 w-3.5" />Compliant + reliable
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold leading-tight">Built to MLS standards.</h2>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((i) => (
            <div key={i.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/15 grid place-items-center text-emerald-400 mb-3"><i.icon className="h-5 w-5" /></div>
              <h3 className="font-semibold text-base">{i.title}</h3>
              <p className="text-sm text-slate-400 mt-1.5">{i.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-20 bg-gradient-to-br from-indigo-50 to-amber-50 border-t border-slate-200">
      <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900">See it in action.</h2>
        <p className="mt-4 text-lg text-slate-600">20-minute walkthrough — live MLS sync, lead capture in action, and a demo of the dashboard.</p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <a href={TIDYCAL} target="_blank" rel="noopener noreferrer" data-testid="re-how-cta-demo"
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-7 py-3.5 rounded-md text-base shadow-lg shadow-amber-500/20 transition">
            <Calendar className="h-4 w-4" />Schedule Demo<ArrowRight className="h-4 w-4" />
          </a>
          <Link to="/real-estate/process"
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 font-semibold px-7 py-3.5 rounded-md text-base transition">
            See the 24-hour build process
          </Link>
        </div>
      </div>
    </section>
  );
}
