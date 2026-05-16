/**
 * WhoWeServe — homepage promo strip for industry-specific landing pages.
 *
 * Currently surfaces the Gym Owners niche site. Built so additional
 * verticals can be added later by appending to NICHES[].
 */
import { Link } from "react-router-dom";
import { Dumbbell, ArrowRight, Building2, Sparkles } from "lucide-react";

const NICHES = [
  {
    id: "gym-owners",
    available: true,
    icon: Dumbbell,
    industry: "Gym Owners",
    pain: "30–40% of new members cancel in 90 days",
    promise: "Custom member-management software · 3–4 week build · Recovers $2–4K / month",
    to: "/gym-owners",
    accent: "from-emerald-500 to-teal-600",
  },
  {
    id: "clinics-coming-soon",
    available: false,
    icon: Building2,
    industry: "Clinics & Wellness",
    pain: "No-shows + manual reminders eat 15–20% of revenue",
    promise: "Coming soon — Patient retention + automated booking platform",
    to: "/gym-owners",
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
            Industry-specific platforms, built around your workflow.
          </h2>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            We go deep on specific verticals so you don't get template software.
            Each niche site shows the exact problem we solve, the system we build,
            and what payback looks like.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {NICHES.map((n) => (
            <Link
              key={n.id}
              to={n.to}
              data-testid={`who-we-serve-card-${n.id}`}
              className={`group relative rounded-2xl border-2 ${
                n.available ? "border-slate-200 hover:border-primary" : "border-slate-200 opacity-80"
              } bg-white p-7 transition-all hover:shadow-xl overflow-hidden`}
            >
              <div className={`absolute top-0 right-0 h-24 w-24 rounded-full bg-gradient-to-br ${n.accent} opacity-10 blur-2xl`} />
              <div className="relative">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${n.accent} text-white grid place-items-center group-hover:scale-110 transition-transform`}>
                    <n.icon className="h-6 w-6" strokeWidth={2.2} />
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
                <h3 className="font-display text-xl md:text-2xl font-bold text-foreground">
                  For {n.industry}
                </h3>
                <p className="mt-2 text-sm text-rose-700 font-medium">
                  {n.pain}
                </p>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {n.promise}
                </p>
                <div className={`mt-5 inline-flex items-center gap-1.5 text-sm font-semibold ${
                  n.available ? "text-primary group-hover:gap-2.5" : "text-slate-500"
                } transition-all`}>
                  {n.available ? "Visit the gym-owner site" : "Get notified when it launches"}
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Have an industry that's not listed?{" "}
          <a href="#book" className="text-primary font-semibold hover:underline">
            Book a discovery call
          </a>{" "}
          — we ship custom verticals every quarter.
        </p>
      </div>
    </section>
  );
}

export default WhoWeServe;
