import { Zap, DollarSign, Wallet, MessageSquareText, Sparkles, Globe } from "lucide-react";

const REASONS = [
  {
    icon: Zap,
    title: "3–8 weeks vs 6 months",
    detail:
      "AI-native scaffolding lets us cut traditional dev time by 60–80% without sacrificing quality.",
  },
  {
    icon: DollarSign,
    title: "40–70% cheaper",
    detail:
      "Lean teams + AI tooling pass real savings to you. No agency overhead, no inflated estimates.",
  },
  {
    icon: Wallet,
    title: "50% upfront only",
    detail:
      "Pay half at kickoff, half at launch. Aligns our incentives with shipping fast and well.",
  },
  {
    icon: MessageSquareText,
    title: "Direct communication",
    detail:
      "You talk to builders, not account managers. Slack, WhatsApp, weekly demos — your call.",
  },
  {
    icon: Sparkles,
    title: "AI-native methodology",
    detail:
      "Modern AI workflows at every layer: scaffolding, testing, deployment, documentation.",
  },
  {
    icon: Globe,
    title: "Asia expertise",
    detail:
      "Based and operating across PH and Singapore. Friendly time-zones, friendly pricing.",
  },
];

export const WhyBloomLabs = () => {
  return (
    <section
      id="why"
      data-testid="why-bloom-labs-section"
      className="scroll-mt-24"
    >
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Why Bloom Labs
          </div>
          <h2 className="font-display mt-3 text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
            Six reasons founders pick us over agencies twice our price.
          </h2>
        </div>

        <div className="mt-10 grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
          {REASONS.map((r, i) => (
            <div
              key={r.title}
              data-testid={`why-reason-${i}`}
              className="rounded-[var(--radius)] border border-border bg-card p-6 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-shadow"
            >
              <div className="h-10 w-10 rounded-xl flex items-center justify-center text-[#3B82F6]" style={{ backgroundColor: "rgba(59,130,246,0.10)" }}>
                <r.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display mt-4 text-base font-semibold">
                {r.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {r.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
