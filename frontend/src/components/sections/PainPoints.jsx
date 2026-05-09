import { Clock, DollarSign, AlertTriangle, ShieldOff } from "lucide-react";

const PAIN_POINTS = [
  {
    icon: Clock,
    title: "6 months to build",
    sub: "Slow",
    detail:
      "Endless discovery, scope creep, and stalled sprints kill momentum. By the time you launch, the market has moved.",
  },
  {
    icon: DollarSign,
    title: "$30K+ investment",
    sub: "Expensive",
    detail:
      "Traditional agencies pad estimates with overhead, account managers, and ‘discovery’ that should take days, not weeks.",
  },
  {
    icon: AlertTriangle,
    title: "Unclear process",
    sub: "Confusing",
    detail:
      "Status updates? Vague Gantt charts. Demos? Maybe next month. You’re left wondering what you’re actually paying for.",
  },
  {
    icon: ShieldOff,
    title: "Unreliable developers",
    sub: "Risky",
    detail:
      "Outsourcing shops that vanish, freelancers who ghost, agencies that sub-contract. Trust is built, not promised.",
  },
];

export const PainPoints = () => {
  return (
    <section
      id="problem"
      data-testid="pain-points-section"
      className="scroll-mt-24 bg-[var(--warm-50)] border-y border-border"
    >
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            The Problem
          </div>
          <h2 className="font-display mt-3 text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
            Why most web app projects fail before they launch.
          </h2>
          <p className="mt-3 text-muted-foreground">
            We&rsquo;ve heard the same story over and over. These four pain
            points kill more projects than any technical challenge.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-4">
          {PAIN_POINTS.map((p, i) => (
            <div
              key={p.title}
              data-testid={`pain-point-card-${i}`}
              className="group rounded-[var(--radius)] border border-border bg-card p-6 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-shadow"
            >
              <div className="h-10 w-10 rounded-xl bg-[#1E3A8A]/8 text-[#1E3A8A] flex items-center justify-center" style={{ backgroundColor: "rgba(30,58,138,0.08)" }}>
                <p.icon className="h-5 w-5" />
              </div>
              <div className="mt-4 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {p.sub}
              </div>
              <h3 className="font-display mt-1 text-lg font-semibold">
                {p.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {p.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
