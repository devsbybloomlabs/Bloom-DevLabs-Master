/**
 * PayPalOrdersPage — admin UI for one-time PayPal orders.
 *
 * Shows every order with its payment plan, status, and remaining balance.
 * For 50/50 split orders whose initial 50% has been captured, an admin can
 * click "Mark Ready for Launch" to bill the remaining balance (creates a
 * second PayPal order + emails the client an approval link).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Receipt,
  RefreshCw,
  Search,
  Rocket,
  Copy,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";

function fmtMoney(amount, currency = "USD") {
  const n = parseFloat(amount || "0");
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function planBadge(tx) {
  if (!tx.payment_plan) {
    return (
      <Badge variant="outline" className="text-[10px]">
        custom
      </Badge>
    );
  }
  if (tx.payment_plan === "full_upfront") {
    return (
      <Badge className="bg-emerald-100 text-emerald-900 border-0 text-[10px]">
        100% upfront · −$500
      </Badge>
    );
  }
  if (tx.installment_index === 2) {
    return (
      <Badge className="bg-indigo-100 text-indigo-900 border-0 text-[10px]">
        balance · 2 of 2
      </Badge>
    );
  }
  return (
    <Badge className="bg-blue-100 text-blue-900 border-0 text-[10px]">
      50% deposit · 1 of 2
    </Badge>
  );
}

function statusBadge(status) {
  const map = {
    COMPLETED: "bg-emerald-100 text-emerald-900",
    APPROVED: "bg-blue-100 text-blue-900",
    CREATED: "bg-secondary text-foreground",
    PAYER_ACTION_REQUIRED: "bg-amber-100 text-amber-900",
    VOIDED: "bg-rose-100 text-rose-900",
    DECLINED: "bg-rose-100 text-rose-900",
  };
  return (
    <Badge className={`${map[status] || "bg-secondary text-foreground"} border-0 text-[10px]`}>
      {status || "—"}
    </Badge>
  );
}

function installmentStatusBadge(s) {
  if (!s || s === "not_applicable") return null;
  const map = {
    pending_capture: { cls: "bg-secondary text-foreground", label: "waiting deposit" },
    pending_launch: { cls: "bg-amber-100 text-amber-900", label: "ready to bill" },
    billed: { cls: "bg-indigo-100 text-indigo-900", label: "balance billed" },
    paid: { cls: "bg-emerald-100 text-emerald-900", label: "paid in full" },
  };
  const m = map[s] || { cls: "bg-secondary text-foreground", label: s };
  return (
    <Badge className={`${m.cls} border-0 text-[10px]`} data-testid={`installment-status-${s}`}>
      {m.label}
    </Badge>
  );
}

export default function PayPalOrdersPage() {
  const api = useAdminApi();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [query, setQuery] = useState("");
  const [linkDialog, setLinkDialog] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/paypal/admin/transactions");
      setRows(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load PayPal transactions");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.id, r.customer_email, r.customer_name, r.tier, r.payment_plan]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, query]);

  const stats = useMemo(() => {
    const deposits = rows.filter(
      (r) => r.payment_plan === "split_50_50" && r.installment_index === 1
    );
    return {
      total: rows.length,
      pendingLaunch: deposits.filter((r) => r.installment_2_status === "pending_launch").length,
      billedBalance: deposits.filter((r) => r.installment_2_status === "billed").length,
    };
  }, [rows]);

  const markReadyForLaunch = async (orderId) => {
    setBusyId(orderId);
    try {
      const r = await api.post(`/paypal/admin/transactions/${orderId}/mark-ready-for-launch`);
      const data = r.data || {};
      setLinkDialog({
        orderId,
        approvalUrl: data.approval_url,
        amount: data.amount,
        currency: data.currency || "USD",
        alreadyInitiated: Boolean(data.already_initiated),
      });
      if (data.already_initiated) {
        toast.info("Balance was already billed — showing existing link");
      } else {
        toast.success("Launch balance order created — link emailed to client");
      }
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not bill remaining balance");
    } finally {
      setBusyId(null);
    }
  };

  const copy = async (text, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-paypal-orders-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-[#1E3A8A]" />
            PayPal Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            One-time orders captured via the public checkout. For 50/50 split
            payments, mark a project <em>Ready for Launch</em> here to bill the
            remaining balance.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          data-testid="paypal-orders-refresh"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Total orders" value={stats.total} icon={Receipt} />
        <StatTile
          label="Awaiting launch"
          value={stats.pendingLaunch}
          icon={Clock}
          accent="text-amber-600"
        />
        <StatTile
          label="Balance billed"
          value={stats.billedBalance}
          icon={CheckCircle2}
          accent="text-indigo-600"
        />
      </div>

      <Card className="border-border">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              {filtered.length} order{filtered.length === 1 ? "" : "s"}
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by email, tier, or order id"
                className="pl-9"
                data-testid="paypal-orders-search"
              />
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="py-12 text-center text-sm text-muted-foreground"
              data-testid="paypal-orders-empty"
            >
              {rows.length === 0
                ? "No PayPal orders yet — they'll appear here once clients check out."
                : "No orders match that search."}
            </div>
          ) : (
            <div className="space-y-2" data-testid="paypal-orders-list">
              {filtered.map((tx) => {
                const isSplitDeposit =
                  tx.payment_plan === "split_50_50" && tx.installment_index === 1;
                const canBillBalance =
                  isSplitDeposit &&
                  tx.status === "COMPLETED" &&
                  ["pending_launch", "pending_capture"].includes(tx.installment_2_status);
                const alreadyBilled =
                  isSplitDeposit && tx.installment_2_status === "billed";
                return (
                  <div
                    key={tx.id}
                    className="rounded-lg border border-border bg-card p-4 hover:bg-secondary/30 transition-colors"
                    data-testid={`paypal-order-row-${tx.id}`}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {statusBadge(tx.status)}
                          {planBadge(tx)}
                          {installmentStatusBadge(tx.installment_2_status)}
                          {tx.tier && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {tx.tier}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1.5 font-medium text-sm">
                          {tx.customer_name || tx.customer_email || "Guest"}
                        </div>
                        {tx.customer_email && (
                          <div className="text-xs text-muted-foreground">
                            {tx.customer_email}
                          </div>
                        )}
                        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                          <span className="font-mono">{tx.id}</span>
                          <button
                            type="button"
                            onClick={() => copy(tx.id, "Order ID copied")}
                            className="hover:text-foreground"
                            aria-label="Copy order id"
                            data-testid={`paypal-order-copy-id-${tx.id}`}
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <span>·</span>
                          <span>{fmtDate(tx.created_at)}</span>
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className="text-xs text-muted-foreground">due today</div>
                        <div className="font-display text-lg font-semibold">
                          {fmtMoney(tx.amount, tx.currency)}
                        </div>
                        {tx.charge_later && parseFloat(tx.charge_later) > 0 && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            +{fmtMoney(tx.charge_later, tx.currency)} at launch
                          </div>
                        )}
                        {parseFloat(tx.discount_applied || "0") > 0 && (
                          <div className="text-[11px] text-emerald-700 mt-0.5">
                            saved {fmtMoney(tx.discount_applied, tx.currency)}
                          </div>
                        )}
                      </div>
                    </div>

                    {(canBillBalance || alreadyBilled) && (
                      <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          {alreadyBilled
                            ? "Launch balance already invoiced — awaiting client payment."
                            : "Project ready to launch? Bill the remaining 50% now."}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => markReadyForLaunch(tx.id)}
                          disabled={busyId === tx.id}
                          className={
                            alreadyBilled
                              ? "bg-secondary text-foreground hover:bg-secondary/80"
                              : "bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                          }
                          variant={alreadyBilled ? "outline" : "default"}
                          data-testid={`paypal-order-launch-${tx.id}`}
                        >
                          {busyId === tx.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Rocket className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          {alreadyBilled ? "View launch link" : "Mark Ready for Launch"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(linkDialog)}
        onOpenChange={(o) => !o && setLinkDialog(null)}
      >
        <DialogContent data-testid="paypal-orders-launch-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <Rocket className="h-5 w-5 text-[#1E3A8A]" />
              Launch balance invoice
            </DialogTitle>
            <DialogDescription>
              {linkDialog?.alreadyInitiated
                ? "This order's balance was already invoiced. Share the link below if needed."
                : "We've created the second PayPal order and emailed the client. You can also share the link below."}
            </DialogDescription>
          </DialogHeader>
          {linkDialog?.approvalUrl ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-[var(--warm-50)] px-3 py-3 text-sm">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Amount
                </div>
                <div className="font-display text-2xl font-semibold tabular-nums mt-1">
                  {fmtMoney(linkDialog.amount, linkDialog.currency)}
                </div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2 text-xs break-all font-mono">
                {linkDialog.approvalUrl}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => copy(linkDialog.approvalUrl, "Approval link copied")}
                  data-testid="paypal-orders-copy-launch-link"
                  size="sm"
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy link
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a
                    href={linkDialog.approvalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="paypal-orders-open-launch-link"
                  >
                    Open PayPal <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              No approval URL returned — check the PayPal dashboard.
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkDialog(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({ label, value, icon: Icon, accent }) {
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </div>
          <Icon className={`h-4 w-4 ${accent || "text-[#3B82F6]"}`} />
        </div>
        <div className="font-display text-2xl font-semibold mt-2 tabular-nums">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
