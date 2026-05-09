import { Button } from "@/components/ui/button";
import { ArrowRight, BadgeCheck, Timer, MessageSquareText, Sparkles } from "lucide-react";

const GUARANTEES = [
  {
    icon: Timer,
    title: "2–4 Week Delivery",
    detail:
      "Clear milestones, weekly demos, no black box. From kickoff to launch in weeks, not quarters.",
  },
  {
    icon: BadgeCheck,
    title: "40% Lower Cost",
    detail:
      "Fixed-scope packages designed for speed. AI-native delivery passes savings directly to you.",
  },
  {
    icon: MessageSquareText,
    title: "Transparent Process",
    detail:
      "You talk to builders, not account managers. Direct Slack/WhatsApp access throughout the build.",
  },
];

export const Solution = () => {
  return (
    <section
      id="solution"
      data-testid="solution-section"
      className="scroll-mt-24"
    >
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-12 items-start">
          <div className="lg:col-span-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#3B82F6]/10 text-[#1E3A8A] px-3 py-1 text-xs font-medium border border-[#3B82F6]/20">
              <Sparkles className="h-3.5 w-3.5" />
              The AI-Native Approach
            </div>
            <h2 className="font-display mt-4 text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
              We build like a senior team of 10 &mdash; with the speed of two.
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              AI-native development means we use modern AI tooling at every
              layer of the build: scaffolding, testing, deployment, even
              documentation. The result? Enterprise-grade web apps shipped
              in weeks, with the same craftsmanship you&rsquo;d expect from a
              top-tier agency &mdash; minus the bloat.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              You get a real system that solves a real business problem.
              Not a slide deck. Not a 6-month roadmap. A live product, in
              production, with paying users.
            </p>
            <div className="mt-7">
              <Button
                asChild
                className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-11 px-5"
                data-testid="solution-cta-button"
              >
                <a href="#pricing">
                  See Packages <ArrowRight className="h-4 w-4 ml-2" />
                </a>
              </Button>
            </div>
          </div>

          <div className="lg:col-span-7 grid gap-4 sm:gap-5">
            {GUARANTEES.map((g, i) => (
              <div
                key={g.title}
                data-testid={`guarantee-card-${i}`}
                className="rounded-[var(--radius)] border border-[#3B82F6]/30 bg-card p-5 sm:p-6 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-shadow"
                style={{ background: "linear-gradient(180deg, rgba(59,130,246,0.04), rgba(255,255,255,0))" }}
              >
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl bg-[#1E3A8A] text-white flex items-center justify-center flex-shrink-0">
                    <g.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-display text-lg font-semibold">
                      {g.title}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                      {g.detail}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
