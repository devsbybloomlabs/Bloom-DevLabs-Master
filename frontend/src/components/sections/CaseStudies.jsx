import { Badge } from "@/components/ui/badge";
import { Quote, TrendingUp, Users, Calendar as CalendarIcon, Workflow } from "lucide-react";

const CASES = [
  {
    persona: "SaaS Founder",
    industry: "B2B SaaS · Pre-revenue",
    challenge:
      "Prototype was scaling poorly, and quoted timeline from agencies was 6 months. Investors needed a live product in 30 days.",
    solution:
      "Custom build of the MVP with auth, billing, and customer dashboard in 4 weeks.",
    result: "Live with paying customers; first $5K MRR within 3 weeks of launch.",
    quote:
      "We launched faster than expected and onboarded our first 12 paying customers before the original deadline even hit.",
    timeline: "28 days",
    metrics: [
      { label: "Delivery", value: "4 weeks" },
      { label: "First MRR", value: "$5K" },
      { label: "vs. quotes", value: "−42%" },
    ],
  },
  {
    persona: "Business Owner",
    industry: "Local services · 12 staff",
    challenge:
      "Running scheduling and inventory entirely on WhatsApp, losing customers to digital-first competitors.",
    solution:
      "Full booking system with inventory tracking, customer SMS reminders, and an admin panel the team could actually use.",
    result: "3x more customer bookings in the first month after launch.",
    quote:
      "It’s simple enough for my team to use without training, and we stopped losing bookings overnight.",
    timeline: "14 days",
    metrics: [
      { label: "Bookings", value: "3× ↑" },
      { label: "No-shows", value: "−38%" },
      { label: "Training", value: "<1 hour" },
    ],
  },
];

export const CaseStudies = () => {
  return (
    <section
      id="case-studies"
      data-testid="case-studies-section"
      className="scroll-mt-24"
    >
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Case Studies
          </div>
          <h2 className="font-display mt-3 text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
            Real businesses. Real timelines. Real results.
          </h2>
          <p className="mt-3 text-muted-foreground">
            We don&rsquo;t do vanity case studies. Every project we ship has
            measurable outcomes &mdash; here are two of our recent ones.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {CASES.map((c, i) => (
            <div
              key={i}
              data-testid={`case-study-card-${i}`}
              className="rounded-[var(--radius)] border border-border bg-card p-6 sm:p-7 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-shadow flex flex-col"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-[#1E3A8A]/10 text-[#1E3A8A] flex items-center justify-center">
                    {i === 0 ? <TrendingUp className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="font-display text-lg font-semibold">
                      {c.persona}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.industry}
                    </div>
                  </div>
                </div>
                <Badge
                  className="bg-[#1E3A8A] text-white border-0 hover:bg-[#1E3A8A]"
                  data-testid={`case-study-${i}-timeline-badge`}
                >
                  <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                  {c.timeline}
                </Badge>
              </div>

              <dl className="mt-5 space-y-3">
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Challenge
                  </dt>
                  <dd className="mt-1 text-sm text-foreground/90 leading-relaxed">
                    {c.challenge}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Solution
                  </dt>
                  <dd className="mt-1 text-sm text-foreground/90 leading-relaxed">
                    {c.solution}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Result
                  </dt>
                  <dd className="mt-1 text-sm text-foreground/90 leading-relaxed">
                    {c.result}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {c.metrics.map((m) => (
                  <div
                    key={m.label}
                    className="rounded-xl border border-border p-3 bg-secondary/40"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {m.label}
                    </div>
                    <div className="font-display text-sm font-semibold mt-1 tabular-nums">
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>

              <blockquote className="mt-5 rounded-xl bg-[var(--warm-50)] border border-border p-4">
                <Quote className="h-4 w-4 text-[#3B82F6]" />
                <p className="mt-2 text-sm italic text-foreground/90 leading-relaxed">
                  &ldquo;{c.quote}&rdquo;
                </p>
                <div className="mt-2 text-xs text-muted-foreground">
                  &mdash; {c.persona}
                </div>
              </blockquote>
            </div>
          ))}
        </div>

        {/* Cross-links to canonical solution hubs for internal-linking signal */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3 text-sm">
          <span className="text-muted-foreground">Explore by industry:</span>
          <a
            href="/solutions/gym-management-software"
            className="text-[#1E3A8A] font-semibold hover:underline"
            data-testid="case-studies-link-gym"
          >
            gym management software →
          </a>
          <a
            href="/solutions/coach-funnel"
            className="text-[#1E3A8A] font-semibold hover:underline"
            data-testid="case-studies-link-coach"
          >
            coach client portal →
          </a>
          <a
            href="/solutions/real-estate-leads"
            className="text-[#1E3A8A] font-semibold hover:underline"
            data-testid="case-studies-link-re"
          >
            real estate lead management →
          </a>
        </div>
      </div>
    </section>
  );
};
