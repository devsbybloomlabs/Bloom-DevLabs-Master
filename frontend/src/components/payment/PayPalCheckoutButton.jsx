/**
 * PayPalCheckoutButton — reusable Smart Buttons.
 *
 * Supports two modes:
 *   1. One-time payments (mode="order")
 *      Props: tier OR (amount + description)
 *   2. Subscriptions (mode="subscription")
 *      Props: planKey
 *
 * Backend integration:
 *   - GET /api/paypal/config         → client_id + env (so we can init SDK)
 *   - POST /api/paypal/orders        → returns order id (for createOrder)
 *   - POST /api/paypal/orders/{id}/capture → on approve
 *   - POST /api/paypal/subscriptions → returns subscription id + approval link
 */
import { useEffect, useState } from "react";
import axios from "axios";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function PayPalCheckoutButton({
  mode = "order",
  tier,
  amount,
  description,
  planKey,
  paymentPlan,
  customerEmail,
  customerName,
  onSuccess,
  onError,
}) {
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API}/paypal/config`)
      .then((r) => {
        if (cancelled) return;
        if (!r.data?.configured || !r.data?.client_id) {
          setLoadError("PayPal isn't configured yet. Please contact us.");
          return;
        }
        setConfig(r.data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load PayPal. Try again in a moment.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <div
        className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        data-testid="paypal-load-error"
      >
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>{loadError}</span>
      </div>
    );
  }
  if (!config) {
    return (
      <div className="flex items-center justify-center h-11 rounded-lg border border-border bg-background/50">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="ml-2 text-xs text-muted-foreground">Loading PayPal…</span>
      </div>
    );
  }

  const initOptions = {
    "client-id": config.client_id,
    currency: config.currency || "USD",
    intent: mode === "subscription" ? "subscription" : "capture",
  };
  if (mode === "subscription") {
    initOptions.vault = true;
  }

  return (
    <PayPalScriptProvider options={initOptions}>
      {mode === "subscription" ? (
        <PayPalButtons
          style={{ layout: "vertical", color: "blue", shape: "rect", label: "subscribe" }}
          data-testid="paypal-buttons-subscription"
          createSubscription={async () => {
            try {
              const r = await axios.post(`${API}/paypal/subscriptions`, {
                plan_key: planKey,
                customer_email: customerEmail,
                customer_name: customerName,
              });
              return r.data.id;
            } catch (e) {
              const msg = e?.response?.data?.detail || "Unable to create subscription";
              toast.error(msg);
              onError?.(e);
              throw e;
            }
          }}
          onApprove={async (data) => {
            toast.success("Subscription approved");
            onSuccess?.({ type: "subscription", subscriptionID: data.subscriptionID });
          }}
          onError={(err) => {
            console.error(err);
            toast.error("PayPal subscription failed");
            onError?.(err);
          }}
        />
      ) : (
        <PayPalButtons
          style={{ layout: "vertical", color: "blue", shape: "rect", label: "paypal" }}
          data-testid="paypal-buttons-order"
          createOrder={async () => {
            try {
              const body = {};
              if (tier) body.tier = tier;
              if (amount) body.amount = amount;
              if (description) body.description = description;
              if (customerEmail) body.customer_email = customerEmail;
              if (customerName) body.customer_name = customerName;
              if (paymentPlan) body.payment_plan = paymentPlan;
              const r = await axios.post(`${API}/paypal/orders`, body);
              return r.data.id;
            } catch (e) {
              const msg = e?.response?.data?.detail || "Unable to start checkout";
              toast.error(msg);
              onError?.(e);
              throw e;
            }
          }}
          onApprove={async (data) => {
            try {
              const r = await axios.post(`${API}/paypal/orders/${data.orderID}/capture`);
              if (r.data?.status === "COMPLETED") {
                toast.success("Payment received — welcome aboard! 🎉");
                onSuccess?.({ type: "order", orderID: data.orderID, payerEmail: r.data.payer_email });
              } else {
                toast.warning(`Payment status: ${r.data?.status || "unknown"}`);
                onSuccess?.({ type: "order", orderID: data.orderID });
              }
            } catch (e) {
              const msg = e?.response?.data?.detail || "Capture failed";
              toast.error(msg);
              onError?.(e);
            }
          }}
          onError={(err) => {
            console.error(err);
            toast.error("PayPal checkout failed");
            onError?.(err);
          }}
        />
      )}
    </PayPalScriptProvider>
  );
}
