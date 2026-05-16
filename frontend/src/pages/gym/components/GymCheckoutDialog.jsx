/**
 * GymCheckoutDialog — minimal PayPal Smart Buttons modal scoped to the gym
 * tiers. Collects name + email + payment-plan, then mounts
 * <PayPalCheckoutButton tier="gym_..."/>. On success the user is redirected
 * to the standard /checkout/success page.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PayPalCheckoutButton } from "@/components/payment/PayPalCheckoutButton";
import { Check, ShieldCheck, Clock, AlertCircle } from "lucide-react";

const TIER_META = {
  gym_express: {
    name: "Gym Express Launch",
    price: "5,995",
    timeline: "10–14 days",
    inclusions: [
      "Member management dashboard",
      "Automated email sequences",
      "Basic analytics",
      "30-day support",
    ],
  },
  gym_custom: {
    name: "Gym Custom Build",
    price: "8,995",
    timeline: "20–28 days",
    inclusions: [
      "Everything in Gym Express",
      "Lead-capture funnel",
      "Payment integration (Stripe / Square)",
      "Member mobile app",
      "Advanced analytics + churn predictor",
      "60-day support",
    ],
  },
  gym_enterprise: {
    name: "Gym Enterprise",
    price: "14,995",
    timeline: "28–35 days",
    inclusions: [
      "Everything in Gym Custom Build",
      "Multi-location support",
      "Predictive analytics + cohort modelling",
      "White-label option",
      "Additional revenue-stream module",
    ],
  },
};

export default function GymCheckoutDialog({ open, onOpenChange, tierKey }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gymName, setGymName] = useState("");
  const [plan, setPlan] = useState("split_50_50"); // 50/50 or full_upfront
  const meta = tierKey ? TIER_META[tierKey] : null;
  const ready = name.trim() && /.+@.+\..+/.test(email);

  if (!meta) return null;

  const chargeNow = plan === "full_upfront"
    ? (parseFloat(meta.price.replace(/,/g, "")) - 500).toLocaleString()
    : (parseFloat(meta.price.replace(/,/g, "")) / 2).toLocaleString();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg p-0 overflow-hidden"
        data-testid="gym-checkout-dialog"
      >
        <div className="bg-gradient-to-br from-blue-700 to-emerald-600 text-white px-6 py-5">
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-display">
              Reserve your {meta.name}
            </DialogTitle>
            <DialogDescription className="text-blue-50/90 text-sm">
              We start within 3 business days of payment. 30-day money-back guarantee.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-3xl font-bold tabular-nums">${meta.price}</span>
            <span className="text-xs uppercase tracking-wider text-blue-100">
              <Clock className="inline h-3 w-3 mr-0.5" />
              {meta.timeline}
            </span>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Inclusions */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
              What's included
            </div>
            <ul className="space-y-1.5">
              {meta.inclusions.map((it, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700">
                  <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <Label className="text-xs">Your name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ryan Salvador"
                data-testid="gym-checkout-name"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourgym.com"
                data-testid="gym-checkout-email"
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Gym name (optional)</Label>
              <Input
                value={gymName}
                onChange={(e) => setGymName(e.target.value)}
                placeholder="Iron Forge CrossFit"
                data-testid="gym-checkout-gym"
                className="mt-1"
              />
            </div>
          </div>

          {/* Payment plan */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
              Payment plan
            </div>
            <div className="grid grid-cols-2 gap-2">
              <PlanOption
                active={plan === "split_50_50"}
                onClick={() => setPlan("split_50_50")}
                title="50 / 50"
                sub="Half today, half at launch"
                testid="gym-checkout-plan-split"
              />
              <PlanOption
                active={plan === "full_upfront"}
                onClick={() => setPlan("full_upfront")}
                title="Full upfront"
                sub="Save $500"
                testid="gym-checkout-plan-full"
                accent
              />
            </div>
            <p className="mt-2 text-xs text-slate-600">
              You pay <strong className="text-slate-900">${chargeNow}</strong>{" "}
              today via PayPal.
            </p>
          </div>

          {/* PayPal */}
          {ready ? (
            <div className="pt-2">
              <PayPalCheckoutButton
                mode="order"
                tier={tierKey}
                paymentPlan={plan}
                customerEmail={email}
                customerName={name}
                onSuccess={() => {
                  onOpenChange(false);
                  // Hand off to the existing success flow.
                  window.location.href = "/checkout/success";
                }}
              />
              <p className="mt-2.5 text-[10px] text-slate-500 flex items-start gap-1.5 leading-snug">
                <ShieldCheck className="h-3 w-3 text-emerald-600 mt-0.5 flex-shrink-0" />
                You'll receive a branded invoice + welcome email within 60
                seconds. We never store card data — PayPal handles the whole
                checkout securely.
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-900 flex items-start gap-2" data-testid="gym-checkout-prefill-hint">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>Add your name and a valid email above to unlock PayPal checkout.</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanOption({ active, onClick, title, sub, testid, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`text-left rounded-lg border-2 px-4 py-3 transition ${
        active
          ? accent
            ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-100"
            : "border-blue-700 bg-blue-50 ring-2 ring-blue-100"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="font-semibold text-sm text-slate-900">{title}</div>
      <div className={`text-xs mt-0.5 ${accent && active ? "text-emerald-700 font-semibold" : "text-slate-500"}`}>
        {sub}
      </div>
    </button>
  );
}
