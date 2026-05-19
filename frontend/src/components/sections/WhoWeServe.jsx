/**
 * WhoWeServe — homepage promo strip for industry-specific landing pages.
 *
 * Each niche links to its SEO-canonical /solutions/* path with a
 * keyword-rich anchor for internal-link signal. Three verticals live;
 * additional ones can be added by appending to NICHES[].
 */
import { Link } from "react-router-dom";
import {
  Dumbbell,
  ArrowRight,
  Building2,
  Sparkles,
  Headphones,
  Home,
} from "lucide-react";

const NICHES = [
  {
    id: "gym-owners",
    available: true,
    icon: Dumbbell,
    industry: "Gym Owners",
    pain: "30–40% of new members cancel in 90 days",
    promise:
      "Custom gym management software · 3–4 week build · Recovers $2–4K / month",
    to: "/solutions/gym-management-software",
    cta: "See our gym management software",
    accent: "from-emerald-500 to-teal-600",
  },
  {
    id: "coaches",
    available: true,
    icon: Headphones,
    industry: "Coaches & Consultants",
    pain: "5+ disconnected tools per coaching business",
    promise:
      "Custom coach client portal · 3 week build · 3× retention, cleaner upsells",
    to: "/solutions/coach-funnel",
    cta: "See the coach client portal",
    accent: "from-rose-500 to-orange-500",
  },
  {
    id: "real-estate",
    available: true,
    icon: Home,
    industry: "Real Estate Brokers",
    pain: "Patchwork CRMs cost ~$50K / year and still lose leads",
    promise:
      "Custom real estate lead management software · 3 week build · 3× faster follow-up",
    to: "/solutions/real-estate-leads",
    cta: "See real estate lead software",
    accent: "from-indigo-500 to-blue-700",
  },
  {
    id: "clinics-coming-soon",
    available: false,
    icon: Building2,
    industry: "Clinics & Wellness",
    pain: "No-shows + manual reminders eat 15–20% of revenue",
    promise: "Coming soon — Patient retention + automated booking platform",
    to: "#book",
    cta: "Get notified when it launches",
    accent: "from-slate-500 to-slate-700",
  },
];

export function WhoWeServe() {
  return (
    <section
      id="who-we-serve"
      className="py-16 md:py-24 bg-gradient-to-b from-white via-blue-50/30 to-white"
      data-testid="who-we-serve-section"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            Who we serve
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground leading-tight">
            Industry-specific custom web app development.
          </h2>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            We go deep on specific verticals so you don&apos;t get template
            software. Each niche site shows the exact problem we solve, the
            custom system we build, and what payback looks like.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {NICHES.map((n) => {
            const isAnchor = n.to.startsWith("#");
            const CardTag = isAnchor ? "a" : Link;
            const linkProps = isAnchor ? { href: n.to } : { to: n.to };
            return (
              <CardTag
                key={n.id}
                {...linkProps}
                data-testid={`who-we-serve-card-${n.id}`}
                className={`group relative rounded-2xl border-2 ${
                  n.available
                    ? "border-slate-200 hover:border-primary"
                    : "border-slate-200 opacity-80"
                } bg-white p-6 transition-all hover:shadow-xl overflow-hidden block`}
              >
                <div
                  className={`absolute top-0 right-0 h-24 w-24 rounded-full bg-gradient-to-br ${n.accent} opacity-10 blur-2xl`}
                />
                <div className="relative">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div
                      className={`h-11 w-11 rounded-xl bg-gradient-to-br ${n.accent} text-white grid place-items-center group-hover:scale-110 transition-transform`}
                    >
                      <n.icon className="h-5 w-5" strokeWidth={2.2} />
                    </div>
                    {!n.available && (
                      <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded">
                        Coming soon
                      </span>
                    )}
                    {n.available && (
                      <span className="text-[10px] uppercase tracking-wider font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded">
                        Live
                      </span>
                    )}
                  </div>
                  <h3 className="font-display text-lg md:text-xl font-bold text-foreground">
                    For {n.industry}
                  </h3>
                  <p className="mt-1.5 text-xs text-rose-700 font-medium">
                    {n.pain}
                  </p>
                  <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed">
                    {n.promise}
                  </p>
                  <div
                    className={`mt-4 inline-flex items-center gap-1.5 text-xs font-semibold ${
                      n.available
                        ? "text-primary group-hover:gap-2.5"
                        : "text-slate-500"
                    } transition-all`}
                  >
                    {n.cta}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </CardTag>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Have an industry that&apos;s not listed?{" "}
          <Link to="/get-audit?src=below-who-we-serve" className="text-primary font-semibold hover:underline">
            Get my audit
          </Link>{" "}
          — we ship custom verticals every quarter.
        </p>
      </div>
    </section>
  );
}

export default WhoWeServe;
