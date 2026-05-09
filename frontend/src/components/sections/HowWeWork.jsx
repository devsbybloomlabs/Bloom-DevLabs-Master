import { Phone, FileText, Hammer, Rocket } from "lucide-react";

const STEPS = [
  {
    icon: Phone,
    title: "Discovery Call",
    duration: "45 minutes",
    detail:
      "We map your workflow, success metrics, and scope. No hard sell. We tell you if we’re a fit, and if we’re not.",
  },
  {
    icon: FileText,
    title: "Custom Proposal",
    duration: "24 hours",
    detail:
      "Within one business day you’ll have a fixed-scope, fixed-price proposal with timelines and deliverables.",
  },
  {
    icon: Hammer,
    title: "Build Phase",
    duration: "2–5 weeks",
    detail:
      "Weekly demos. Direct access to builders. AI-native delivery means we ship features, not status updates.",
  },
  {
    icon: Rocket,
    title: "Launch & Support",
    duration: "7–30 days",
    detail:
      "We deploy, train your team, and stabilize. Post-launch support windows on every package.",
  },
];

export const HowWeWork = () => {
  return (
    <section
      id="how-we-work"
      data-testid="how-we-work-section"
      className="scroll-mt-24 bg-[var(--warm-50)] border-y border-border"
    >
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            How We Work
          </div>
          <h2 className="font-display mt-3 text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
            From first call to live product in four steps.
          </h2>
          <p className="mt-3 text-muted-foreground">
            A boring process, on purpose. Predictability is what makes
            shipping in 2&ndash;4 weeks possible.
          </p>
        </div>

        <ol className="mt-12 relative grid gap-6 lg:grid-cols-4">
          {/* desktop connector */}
          <div
            className="hidden lg:block absolute top-7 left-[6%] right-[6%] h-px bg-border"
            aria-hidden="true"
          />
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              data-testid={`how-we-work-step-${i}`}
              className="relative rounded-[var(--radius)] border border-border bg-card p-5 sm:p-6 shadow-[var(--shadow-sm)]"
            >
              <div className="flex items-center gap-3">
                <span className="relative h-10 w-10 rounded-full bg-[#1E3A8A] text-white flex items-center justify-center font-display font-semibold tabular-nums">
                  {i + 1}
                </span>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <h3 className="font-display mt-4 text-lg font-semibold">
                {s.title}
              </h3>
              <div className="text-xs text-[#1E3A8A] mt-1 font-medium tabular-nums">
                {s.duration}
              </div>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {s.detail}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
