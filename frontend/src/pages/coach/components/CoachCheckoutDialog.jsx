/**
 * CoachCheckoutDialog — same shape as GymCheckoutDialog, just with coach
 * tier metadata. Starter tier skips the split-plan toggle (it's the
 * low-friction entry product like the gym prototype).
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PayPalCheckoutButton } from "@/components/payment/PayPalCheckoutButton";
import { Check, ShieldCheck, Clock, AlertCircle } from "lucide-react";
import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL;

const TIER_META = {
  coach_starter: {
    name: "Coach Starter Website",
    price: "2,995",
    timeline: "24 hours",
    inclusions: [
      "Professional custom website (mobile-optimized)",
      "One-click booking system with calendar sync",
      "Payment processing (Stripe/PayPal)",
      "Basic client dashboard",
      "30-day support + $1,000 credit toward Premium (14 days)",
    ],
    skipSplit: true,
  },
  coach_premium: {
    name: "Coach Premium Website",
    price: "8,995",
    timeline: "4 weeks",
    inclusions: [
      "Everything in Coach Starter",
      "Advanced customization + video intro section",
      "Resource library + downloadable assets",
      "Advanced analytics dashboard",
      "Email automation (confirmations / reminders / follow-ups)",
      "60-day support",
    ],
  },
  coach_enterprise: {
    name: "Coach Enterprise",
    price: "14,995",
    timeline: "5-6 weeks",
    inclusions: [
      "Everything in Coach Premium",
      "Multi-service offerings (1-on-1, group, workshops)",
      "Advanced integrations (CRM + marketing automation)",
      "White-label options",
      "Dedicated account manager",
    ],
  },
};

export default function CoachCheckoutDialog({ open, onOpenChange, tierKey }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [niche, setNiche] = useState("");
  const [plan, setPlan] = useState("split_50_50");
  const [warmCaptured, setWarmCaptured] = useState(false);
  const meta = tierKey ? TIER_META[tierKey] : null;
  const ready = name.trim() && /.+@.+\..+/.test(email);

  const captureWarmLead = async () => {
    if (warmCaptured || !ready) return;
    setWarmCaptured(true);
    try {
      await axios.post(`${API}/api/leads/warm`, {
        niche: "coaches",
        tier: tierKey,
        name,
        email,
        coaching_niche: niche || null,
      });
    } catch {
      setWarmCaptured(false);
    }
  };

  if (!meta) return null;

  const effectivePlan = meta.skipSplit ? "full_upfront" : plan;
  const basePrice = parseFloat(meta.price.replace(/,/g, ""));
  const chargeNow = meta.skipSplit
    ? basePrice.toLocaleString()
    : effectivePlan === "full_upfront"
      ? (basePrice - 500).toLocaleString()
      : (basePrice / 2).toLocaleString();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden" data-testid="coach-checkout-dialog">
        <div className="bg-gradient-to-br from-teal-700 to-amber-500 text-white px-6 py-5">
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-display">Reserve your {meta.name}</DialogTitle>
            <DialogDescription className="text-teal-50/90 text-sm">
              Discovery call within 24 hours of payment. Build kicks off the same day.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-3xl font-bold tabular-nums">${meta.price}</span>
            <span className="text-xs uppercase tracking-wider text-teal-100">
              <Clock className="inline h-3 w-3 mr-0.5" />
              {meta.timeline}
            </span>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">What's included</div>
            <ul className="space-y-1.5">
              {meta.inclusions.map((it, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700">
                  <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <Label className="text-xs">Your name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={captureWarmLead} placeholder="Jane Coach" data-testid="coach-checkout-name" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={captureWarmLead} placeholder="you@yourcoaching.com" data-testid="coach-checkout-email" className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Coaching niche (optional)</Label>
              <Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Executive coach, life coach, fitness…" data-testid="coach-checkout-niche" className="mt-1" />
            </div>
          </div>

          {!meta.skipSplit && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Payment plan</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPlan("split_50_50")} data-testid="coach-checkout-plan-split"
                  className={`text-left rounded-lg border-2 px-4 py-3 transition ${plan === "split_50_50" ? "border-teal-700 bg-teal-50 ring-2 ring-teal-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <div className="font-semibold text-sm text-slate-900">50 / 50</div>
                  <div className="text-xs text-slate-500 mt-0.5">Half today, half at launch</div>
                </button>
                <button type="button" onClick={() => setPlan("full_upfront")} data-testid="coach-checkout-plan-full"
                  className={`text-left rounded-lg border-2 px-4 py-3 transition ${plan === "full_upfront" ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <div className="font-semibold text-sm text-slate-900">Full upfront</div>
                  <div className={`text-xs mt-0.5 ${plan === "full_upfront" ? "text-emerald-700 font-semibold" : "text-slate-500"}`}>Save $500</div>
                </button>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-600">
            You pay <strong className="text-slate-900">${chargeNow}</strong> today via PayPal.
          </p>

          {ready ? (
            <div className="pt-2">
              <PayPalCheckoutButton mode="order" tier={tierKey} paymentPlan={effectivePlan} customerEmail={email} customerName={name} onSuccess={() => { onOpenChange(false); window.location.href = "/checkout/success"; }} />
              <p className="mt-2.5 text-[10px] text-slate-500 flex items-start gap-1.5 leading-snug">
                <ShieldCheck className="h-3 w-3 text-emerald-600 mt-0.5 flex-shrink-0" />
                Branded invoice + welcome email within 60s. PayPal handles checkout securely.
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-900 flex items-start gap-2" data-testid="coach-checkout-prefill-hint">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>Add your name and a valid email above to unlock PayPal checkout.</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
