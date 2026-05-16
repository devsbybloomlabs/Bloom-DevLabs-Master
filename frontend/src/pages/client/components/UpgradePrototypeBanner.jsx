/**
 * UpgradePrototypeBanner — Client Portal CTA shown on prototype orders
 * still inside the 14-day upgrade window. Hands off to the standard
 * GymCheckoutDialog routed through the server-validated upgrade endpoint.
 */
import { useState } from "react";
import { Sparkles, Clock, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { clientApi } from "@/lib/clientAuth";
import { useClientAuth } from "@/lib/clientAuth";

export default function UpgradePrototypeBanner({ order, eligibility, onUpgraded }) {
  const { token } = useClientAuth();
  const api = clientApi(token);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!eligibility?.eligible) return null;

  const handleUpgrade = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/clients/orders/${order.id}/upgrade`);
      const newOrderId = res.data?.paypal_order_id;
      if (!newOrderId) throw new Error("Server didn't return a PayPal order id");
      toast.success(
        `Upgrade order created — $${res.data.amount} (${res.data.credit_applied} credit applied). Redirecting to PayPal…`
      );
      // PayPal approve URL = approve.paypal.com/checkoutnow?token=<orderId>
      const approveUrl = `https://www.${
        process.env.REACT_APP_PAYPAL_ENV === "live" ? "paypal" : "sandbox.paypal"
      }.com/checkoutnow?token=${newOrderId}`;
      window.location.href = approveUrl;
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || "Upgrade failed";
      toast.error(msg);
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-4 mt-3"
      data-testid={`portal-upgrade-banner-${order.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center text-white flex-shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">
              Upgrade to {eligibility.target_tier_name}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold bg-emerald-600 text-white px-2 py-0.5 rounded">
              <Clock className="h-3 w-3" />
              {eligibility.days_remaining} day{eligibility.days_remaining !== 1 ? "s" : ""} left
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            Pay <strong className="text-slate-900">${eligibility.discounted_price.replace(/\.00$/, "")}</strong>{" "}
            (after a <strong className="text-emerald-700">${eligibility.credit_amount} prototype credit</strong>)
            — full member-management platform launches in 3 weeks.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setConfirmOpen(true)}
          data-testid={`portal-upgrade-btn-${order.id}`}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          Upgrade
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => !busy && setConfirmOpen(o)}>
        <DialogContent className="sm:max-w-md" data-testid="portal-upgrade-confirm">
          <DialogHeader>
            <DialogTitle>Confirm upgrade</DialogTitle>
            <DialogDescription>
              Bumping you up to the full member-management platform with the $1,000 prototype credit applied.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Row label="Original prototype" value="$2,995 (paid)" />
            <Row label="Full Build price" value="$8,995" />
            <Row label="Prototype credit" value={`–$${eligibility.credit_amount}`} accent="emerald" />
            <div className="border-t border-slate-200 pt-3">
              <Row
                label="You pay today"
                value={`$${eligibility.discounted_price.replace(/\.00$/, "")}`}
                bold
              />
            </div>
            <ul className="space-y-1.5 mt-3 text-xs text-slate-600">
              <li className="flex gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" /> Discovery → 3-week launch</li>
              <li className="flex gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" /> Mobile app + payment integration</li>
              <li className="flex gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" /> 60-day support + 30-day money-back guarantee</li>
            </ul>
            <p className="text-[10px] text-slate-500 flex items-start gap-1.5 mt-2">
              <ShieldCheck className="h-3 w-3 text-emerald-600 mt-0.5" />
              You'll be redirected to PayPal to complete the upgrade securely.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={busy}
              data-testid="portal-upgrade-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpgrade}
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="portal-upgrade-confirm-btn"
            >
              {busy ? "Creating order…" : "Continue to PayPal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, accent, bold }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={bold ? "font-semibold text-slate-900" : "text-slate-600"}>{label}</span>
      <span
        className={`tabular-nums ${bold ? "font-bold text-lg text-slate-900" : ""} ${
          accent === "emerald" ? "text-emerald-700 font-semibold" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
