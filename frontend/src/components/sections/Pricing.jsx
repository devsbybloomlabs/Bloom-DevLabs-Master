import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PayPalCheckoutButton } from "@/components/payment/PayPalCheckoutButton";

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
    tier: "express",
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
    tier: "custom",
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
    tier: "enterprise",
  },
];

function CheckoutDialog({ plan, open, onOpenChange }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", name: "" });
  const [showButtons, setShowButtons] = useState(false);

  const canStart =
    form.email.trim().length > 3 && form.email.includes("@") && form.name.trim().length > 1;

  if (!plan) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md max-h-[90vh] overflow-y-auto"
        data-testid={`pricing-checkout-dialog-${plan.key}`}
        aria-describedby={`pricing-checkout-desc-${plan.key}`}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Get started — {plan.name}
          </DialogTitle>
          <DialogDescription>
            Pay <span className="font-medium text-foreground tabular-nums">
              ${plan.price.toLocaleString()}
            </span>{" "}
            securely via PayPal. We&apos;ll create your client portal
            automatically.
          </DialogDescription>
        </DialogHeader>
        <p id={`pricing-checkout-desc-${plan.key}`} className="sr-only">
          Secure PayPal checkout for {plan.name} — ${plan.price.toLocaleString()}.
        </p>

        {!showButtons ? (
          <div className="space-y-4 mt-2">
            <div>
              <Label htmlFor={`co-name-${plan.key}`} className="text-sm">
                Full name
              </Label>
              <Input
                id={`co-name-${plan.key}`}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Jane Doe"
                required
                data-testid={`pricing-checkout-${plan.key}-name-input`}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor={`co-email-${plan.key}`} className="text-sm">
                Email
              </Label>
              <Input
                id={`co-email-${plan.key}`}
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="you@company.com"
                required
                data-testid={`pricing-checkout-${plan.key}-email-input`}
                className="mt-1.5"
              />
            </div>
            <Button
              className="w-full bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-11"
              disabled={!canStart}
              onClick={() => setShowButtons(true)}
              data-testid={`pricing-checkout-${plan.key}-continue-button`}
            >
              Continue to PayPal
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Secure checkout · 30-day money-back guarantee
            </p>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div className="rounded-lg border border-border bg-[var(--warm-50)] px-3 py-3 text-sm">
              <p className="font-medium">{form.name}</p>
              <p className="text-muted-foreground text-xs">{form.email}</p>
            </div>
            <PayPalCheckoutButton
              mode="order"
              tier={plan.tier}
              customerEmail={form.email}
              customerName={form.name}
              onSuccess={(result) => {
                onOpenChange(false);
                navigate(`/checkout/success?type=${result.type}`);
              }}
            />
            <button
              type="button"
              onClick={() => setShowButtons(false)}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid={`pricing-checkout-${plan.key}-back-button`}
            >
              ← back
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const Pricing = () => {
  const [activePlan, setActivePlan] = useState(null);
  const [open, setOpen] = useState(false);

  const startCheckout = (plan) => {
    setActivePlan(plan);
    setOpen(true);
  };

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
            Fixed scope. Fixed price. Pay securely via PayPal — checkout
            processed right here on the site. Or book a discovery call if you
            want a custom quote first.
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
                  <div className="font-display text-lg font-semibold">{plan.name}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">{plan.timeline}</div>
                </div>
                <div className="mt-4 flex items-end gap-1.5">
                  <span className="font-display text-4xl font-semibold tabular-nums tracking-tight">
                    ${plan.price.toLocaleString()}
                  </span>
                  <span className="text-sm text-muted-foreground pb-1">one-time</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>

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
                    onClick={() => startCheckout(plan)}
                    className={`w-full h-11 ${
                      popular
                        ? "bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                        : "bg-foreground hover:bg-foreground/90 text-background"
                    }`}
                    data-testid={`pricing-plan-${plan.key}-get-started-button`}
                  >
                    Get Started
                    <ArrowRight className="h-4 w-4 ml-2" />
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
          something custom?{" "}
          <a href="#book" className="underline underline-offset-4 hover:text-foreground">
            Talk to us.
          </a>
        </p>
      </div>

      <CheckoutDialog plan={activePlan} open={open} onOpenChange={setOpen} />
    </section>
  );
};
