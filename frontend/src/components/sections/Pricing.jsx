import { useState, useMemo } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Check, Sparkles, ArrowRight, BadgePercent, CalendarClock } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { PayPalCheckoutButton } from "@/components/payment/PayPalCheckoutButton";

const FULL_UPFRONT_DISCOUNT = 500;

function computeCharge(price, plan) {
  if (plan === "full_upfront") {
    const chargeNow = Math.max(0, price - FULL_UPFRONT_DISCOUNT);
    return {
      base: price,
      chargeNow,
      chargeLater: 0,
      discount: FULL_UPFRONT_DISCOUNT,
      label: "100% upfront",
    };
  }
  const half = Math.round((price / 2) * 100) / 100;
  return {
    base: price,
    chargeNow: half,
    chargeLater: price - half,
    discount: 0,
    label: "50% now / 50% at launch",
  };
}

function fmt(n) {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

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
  const [paymentPlan, setPaymentPlan] = useState("split_50_50");
  const [showButtons, setShowButtons] = useState(false);

  const canStart =
    form.email.trim().length > 3 && form.email.includes("@") && form.name.trim().length > 1;

  const charge = useMemo(
    () => (plan ? computeCharge(plan.price, paymentPlan) : null),
    [plan, paymentPlan]
  );

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
            Choose how you&apos;d like to pay. Secure checkout via PayPal — your
            client portal is created automatically once payment is confirmed.
          </DialogDescription>
        </DialogHeader>
        <p id={`pricing-checkout-desc-${plan.key}`} className="sr-only">
          Secure PayPal checkout for {plan.name} — base price ${plan.price.toLocaleString()}.
        </p>

        {/* Payment plan selector */}
        <div className="space-y-2" data-testid={`pricing-checkout-${plan.key}-plan-section`}>
          <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Payment plan
          </Label>
          <RadioGroup
            value={paymentPlan}
            onValueChange={(v) => setPaymentPlan(v)}
            className="grid gap-2"
            data-testid={`pricing-checkout-${plan.key}-payment-plan-radio`}
          >
            <label
              htmlFor={`pp-split-${plan.key}`}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors ${
                paymentPlan === "split_50_50"
                  ? "border-[#1E3A8A] bg-[#1E3A8A]/5 ring-1 ring-[#1E3A8A]/20"
                  : "border-border hover:border-foreground/30 hover:bg-secondary/50"
              }`}
              data-testid={`pricing-checkout-${plan.key}-plan-split-option`}
            >
              <RadioGroupItem
                id={`pp-split-${plan.key}`}
                value="split_50_50"
                className="mt-1"
                data-testid={`pricing-checkout-${plan.key}-plan-split-radio`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">50% now · 50% at launch</span>
                  <Badge variant="outline" className="text-[10px] gap-1 border-border">
                    <CalendarClock className="h-3 w-3" />
                    flexible
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pay <span className="font-medium text-foreground tabular-nums">
                    ${fmt(plan.price / 2)}
                  </span>{" "}
                  today, balance billed when we mark the project Ready for Launch.
                </p>
              </div>
            </label>

            <label
              htmlFor={`pp-full-${plan.key}`}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors ${
                paymentPlan === "full_upfront"
                  ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600/20"
                  : "border-border hover:border-foreground/30 hover:bg-secondary/50"
              }`}
              data-testid={`pricing-checkout-${plan.key}-plan-full-option`}
            >
              <RadioGroupItem
                id={`pp-full-${plan.key}`}
                value="full_upfront"
                className="mt-1"
                data-testid={`pricing-checkout-${plan.key}-plan-full-radio`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">100% upfront</span>
                  <Badge className="text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-600 text-white border-0">
                    <BadgePercent className="h-3 w-3" />
                    save $500
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pay <span className="font-medium text-foreground tabular-nums">
                    ${fmt(plan.price - FULL_UPFRONT_DISCOUNT)}
                  </span>{" "}
                  today and we knock <span className="font-medium text-emerald-700">$500</span>{" "}
                  off the total — nothing more to pay later.
                </p>
              </div>
            </label>
          </RadioGroup>

          {/* Inline summary */}
          <div
            className="rounded-lg border border-border bg-[var(--warm-50)] px-3.5 py-3 text-xs space-y-1.5 tabular-nums"
            data-testid={`pricing-checkout-${plan.key}-summary`}
          >
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Base price</span>
              <span>${fmt(charge.base)}</span>
            </div>
            {charge.discount > 0 && (
              <div className="flex items-center justify-between text-emerald-700">
                <span>Upfront discount</span>
                <span data-testid={`pricing-checkout-${plan.key}-summary-discount`}>
                  −${fmt(charge.discount)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between font-medium text-foreground pt-1.5 border-t border-border/60">
              <span>Due today</span>
              <span data-testid={`pricing-checkout-${plan.key}-summary-charge-now`}>
                ${fmt(charge.chargeNow)}
              </span>
            </div>
            {charge.chargeLater > 0 && (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Due at launch</span>
                <span data-testid={`pricing-checkout-${plan.key}-summary-charge-later`}>
                  ${fmt(charge.chargeLater)}
                </span>
              </div>
            )}
          </div>
        </div>

        {!showButtons ? (
          <div className="space-y-4 mt-1">
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
              Continue · pay ${fmt(charge.chargeNow)}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Secure checkout · cancel anytime before kickoff
            </p>
          </div>
        ) : (
          <div className="space-y-4 mt-1">
            <div className="rounded-lg border border-border bg-[var(--warm-50)] px-3 py-3 text-sm">
              <p className="font-medium">{form.name}</p>
              <p className="text-muted-foreground text-xs">{form.email}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {charge.label} · charging ${fmt(charge.chargeNow)} now
              </p>
            </div>
            <PayPalCheckoutButton
              mode="order"
              tier={plan.tier}
              paymentPlan={paymentPlan}
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
          Every engagement starts with a paid discovery sprint so you see exactly what you're getting. Need
          something custom?{" "}
          <a href="#book" className="underline underline-offset-4 hover:text-foreground">
            Talk to us.
          </a>
        </p>

        <PricingAuditCta />
      </div>

      <CheckoutDialog plan={activePlan} open={open} onOpenChange={setOpen} />
    </section>
  );
};

function PricingAuditCta() {
  return (
    <div
      className="mt-12 rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50/50 p-6 sm:p-8 text-center max-w-3xl mx-auto"
      data-testid="pricing-audit-cta"
    >
      <p className="text-xs uppercase tracking-wider text-amber-900 font-medium mb-2">Still deciding?</p>
      <p className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
        Get your personalised proposal
      </p>
      <p className="text-sm text-foreground/70 mt-2 max-w-xl mx-auto">
        We&rsquo;ll analyse your workflow and show you exactly which apps to build, what
        they&rsquo;ll cost, and when they&rsquo;ll be live — within 24 business hours.
      </p>
      <Link to="/get-audit?src=pricing-section" className="inline-block mt-4">
        <Button className="bg-amber-500 hover:bg-amber-600 text-white h-11 px-6 text-base shadow-[0_8px_24px_-8px_rgba(245,158,11,0.5)]" data-testid="pricing-audit-cta-button">
          Get my custom proposal
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </Link>
    </div>
  );
}
