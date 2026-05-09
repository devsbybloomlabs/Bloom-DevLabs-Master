import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { PAYPAL_LINKS } from "@/lib/brand";
import { toast } from "sonner";

const PLANS = [
  {
    key: "express",
    name: "Express Launch",
    price: 5995,
    timeline: "10–14 days",
    description: "Perfect for replacing spreadsheets or WhatsApp ops with a real system.",
    bullets: [
      "Single core feature (e.g., booking, internal tool, simple CRM)",
      "Up to 3 user roles with auth",
      "Custom UI matching your brand",
      "Mobile-responsive design",
      "Launch + 7-day post-launch support",
    ],
    badge: null,
    payTier: "express",
  },
  {
    key: "custom",
    name: "Custom Build",
    price: 8995,
    timeline: "20–28 days",
    description: "Multi-feature system for growing teams that need ops + customer-facing tooling.",
    bullets: [
      "Multi-feature web app (e.g., CRM + customer portal)",
      "Up to 5 user roles with granular permissions",
      "Third-party integrations (PayPal, email, Calendly, etc.)",
      "Custom dashboard + admin panel",
      "Mobile-responsive + PWA-ready",
      "Launch + 14-day post-launch support",
    ],
    badge: "POPULAR",
    payTier: "custom",
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: 14995,
    timeline: "28–35 days",
    description: "For larger organizations needing a complex platform with auditability.",
    bullets: [
      "Complex multi-system platform",
      "Unlimited user roles + advanced permissions",
      "5+ third-party integrations + public API",
      "Advanced analytics & reporting dashboard",
      "Audit logs + enterprise security patterns",
      "White-glove onboarding & team training",
      "Launch + 30-day priority support",
    ],
    badge: null,
    payTier: "enterprise",
  },
];

const handlePayClick = (e, plan) => {
  // PayPal placeholder behaviour: open link if real, else show toast and route to booking.
  const link = PAYPAL_LINKS[plan.payTier];
  if (!link || link === "#") {
    e.preventDefault();
    toast("Redirecting to booking…", {
      description: `Lock in ${plan.name} on a 15-min discovery call.`,
    });
    setTimeout(() => {
      const el = document.getElementById("book");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
  }
};

export const Pricing = () => {
  return (
    <section
      id="pricing"
      data-testid="pricing-section"
      className="scroll-mt-24 bg-[var(--warm-50)] border-y border-border"
    >
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Pricing
          </div>
          <h2 className="font-display mt-3 text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
            Three packages. Zero surprises.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Fixed scope. Fixed price. Pay 50% upfront, 50% at launch. PayPal
            checkout when you&rsquo;re ready &mdash; or book a discovery call
            if you want a custom quote first.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3 items-stretch">
          {PLANS.map((plan) => {
            const popular = plan.badge === "POPULAR";
            return (
              <div
                key={plan.key}
                data-testid={`pricing-plan-card-${plan.key}`}
                className={`relative rounded-[var(--radius)] border bg-card p-6 sm:p-7 flex flex-col transition-shadow ${
                  popular
                    ? "border-[#3B82F6] shadow-[var(--shadow-md)] lg:scale-[1.02]"
                    : "border-border shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5"
                }`}
              >
                {popular && (
                  <Badge
                    className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1E3A8A] text-white border-0 px-3 py-1"
                    data-testid={`pricing-plan-${plan.key}-popular-badge`}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    POPULAR
                  </Badge>
                )}
                <div className="flex items-baseline justify-between">
                  <div className="font-display text-lg font-semibold">
                    {plan.name}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {plan.timeline}
                  </div>
                </div>
                <div className="mt-4 flex items-end gap-1.5">
                  <span className="font-display text-4xl font-semibold tabular-nums tracking-tight">
                    ${plan.price.toLocaleString()}
                  </span>
                  <span className="text-sm text-muted-foreground pb-1">
                    one-time
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {plan.description}
                </p>

                <ul className="mt-5 space-y-3 flex-1">
                  {plan.bullets.map((b, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-sm text-foreground/90"
                    >
                      <span
                        className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                          popular
                            ? "bg-[#1E3A8A] text-white"
                            : "bg-[#3B82F6]/10 text-[#1E3A8A]"
                        }`}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      <span className="leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-7 space-y-2">
                  <Button
                    asChild
                    onClick={(e) => handlePayClick(e, plan)}
                    className={`w-full h-11 ${
                      popular
                        ? "bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                        : "bg-foreground hover:bg-foreground/90 text-background"
                    }`}
                    data-testid={`pricing-plan-${plan.key}-get-started-button`}
                    data-paypal-tier={plan.payTier}
                  >
                    <a
                      href={PAYPAL_LINKS[plan.payTier]}
                      target={
                        PAYPAL_LINKS[plan.payTier] === "#" ? "_self" : "_blank"
                      }
                      rel="noopener noreferrer"
                    >
                      Get Started
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </a>
                  </Button>
                  <a
                    href="#book"
                    className="block text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                    data-testid={`pricing-plan-${plan.key}-book-call-link`}
                  >
                    or book a discovery call →
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          All packages include a money-back guarantee on milestone 1. Need
          something custom? <a href="#book" className="underline underline-offset-4 hover:text-foreground">Talk to us.</a>
        </p>
      </div>
    </section>
  );
};
