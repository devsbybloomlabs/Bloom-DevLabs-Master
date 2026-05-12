/**
 * SubscriptionsAdmin — admin overview of all PayPal subscriptions
 * + "Assign add-on" dialog that emails a client a one-click activation link.
 *
 * Plans themselves are still created/managed on the existing PayPalPlansPage;
 * this page just lists existing plan templates as quick-pick for assignment.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Repeat,
  Plus,
  RefreshCw,
  Search,
  Send,
  Copy,
  Loader2,
  ExternalLink,
  Settings as SettingsIcon,
} from "lucide-react";

const STATUS_STYLE = {
  ACTIVE: "bg-emerald-100 text-emerald-900",
  APPROVAL_PENDING: "bg-amber-100 text-amber-900",
  CANCELLED: "bg-rose-100 text-rose-900",
  EXPIRED: "bg-rose-100 text-rose-900",
  SUSPENDED: "bg-amber-100 text-amber-900",
};

function fmtMoney(n, c = "USD") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c,
      maximumFractionDigits: 2,
    }).format(Number(n || 0));
  } catch {
    return `${c} ${Number(n || 0).toFixed(2)}`;
  }
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function SubscriptionsAdmin() {
  const api = useAdminApi();
  const [subs, setSubs] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({
    plan_key: "",
    client_email: "",
    send_email: true,
  });
  const [busy, setBusy] = useState(false);
  const [linkDialog, setLinkDialog] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.allSettled([
        api.get("/admin/subscriptions"),
        api.get("/paypal/admin/plans"),
      ]);
      setSubs(sRes.status === "fulfilled" ? sRes.value.data : []);
      setPlans(pRes.status === "fulfilled" ? pRes.value.data : []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter((s) =>
      [s.id, s.customer_email, s.customer_name, s.plan_key, s.plan_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [subs, query]);

  const stats = useMemo(() => {
    const active = subs.filter((s) => s.status === "ACTIVE");
    const monthlyEstimate = active.reduce(
      (acc, s) => acc + Number(s.plan_price || 0),
      0
    );
    return {
      total: subs.length,
      active: active.length,
      pending: subs.filter((s) => s.status === "APPROVAL_PENDING").length,
      mrr: monthlyEstimate,
    };
  }, [subs]);

  const onAssign = async () => {
    if (!assignForm.plan_key || !assignForm.client_email) {
      toast.error("Plan + client email required");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post("/admin/subscriptions/assign", assignForm);
      setLinkDialog({
        approvalUrl: r.data?.approval_url,
        clientEmail: r.data?.client_email,
        planName: r.data?.plan_name,
      });
      setAssignOpen(false);
      setAssignForm({ plan_key: "", client_email: "", send_email: true });
      toast.success(
        assignForm.send_email
          ? `Assigned · activation email sent to ${r.data?.client_email}`
          : `Assigned · share the link below`
      );
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not assign");
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (t) => {
    try {
      await navigator.clipboard.writeText(t);
      toast.success("Copied");
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-subscriptions-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Repeat className="h-6 w-6 text-[#1E3A8A]" />
            Subscriptions
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Recurring revenue replaces AgencyHandy subscriptions. Plans are
            managed on <a href="/admin/paypal-plans" className="underline">PayPal Plans</a>;
            here you can see every active sub and assign add-ons to clients in one click.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            data-testid="admin-subs-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/admin/paypal-plans" data-testid="admin-subs-manage-plans">
              <SettingsIcon className="h-4 w-4 mr-2" />
              Manage plans
            </a>
          </Button>
          <Button
            size="sm"
            onClick={() => setAssignOpen(true)}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            disabled={plans.length === 0}
            data-testid="admin-subs-assign-button"
          >
            <Plus className="h-4 w-4 mr-2" />
            Assign add-on
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Total subs" value={stats.total} />
        <StatTile label="Active" value={stats.active} accent="text-emerald-600" />
        <StatTile
          label="Awaiting activation"
          value={stats.pending}
          accent="text-amber-600"
        />
        <StatTile
          label="Estimated MRR"
          value={fmtMoney(stats.mrr)}
          accent="text-indigo-600"
        />
      </div>

      <Card className="border-border">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {filtered.length} subscription{filtered.length === 1 ? "" : "s"}
            </div>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search client / plan / sub id"
                className="pl-9"
                data-testid="admin-subs-search"
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
              data-testid="admin-subs-empty"
            >
              {subs.length === 0
                ? plans.length === 0
                  ? "No plans yet. Create one on the PayPal Plans page first."
                  : "No subscriptions yet. Click Assign add-on to onboard a client."
                : "Nothing matches that search."}
            </div>
          ) : (
            <div className="space-y-2" data-testid="admin-subs-list">
              {filtered.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-border bg-card p-4 hover:bg-secondary/20 transition-colors"
                  data-testid={`admin-sub-row-${s.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${STATUS_STYLE[s.status] || "bg-secondary"} border-0 text-[10px]`}>
                          {s.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {(s.source || "self").replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {s.plan_name || s.plan_key}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.customer_name || s.customer_email}
                        {s.customer_name && s.customer_email && ` · ${s.customer_email}`}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                        {s.id}
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="font-display text-lg font-semibold">
                        {fmtMoney(s.plan_price, s.plan_currency)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Started {fmtDate(s.activated_at || s.created_at)}
                      </div>
                    </div>
                  </div>
                  {s.status === "APPROVAL_PENDING" && s.approval_url && (
                    <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        Awaiting client activation
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyText(s.approval_url)}
                          data-testid={`admin-sub-copy-link-${s.id}`}
                        >
                          <Copy className="h-3.5 w-3.5 mr-1.5" />
                          Copy link
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <a
                            href={s.approval_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`admin-sub-open-link-${s.id}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Open
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent data-testid="admin-subs-assign-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <Plus className="h-5 w-5 text-[#1E3A8A]" />
              Assign add-on to a client
            </DialogTitle>
            <DialogDescription>
              Creates a PayPal subscription in <strong>APPROVAL_PENDING</strong> state.
              The client gets a branded email with a one-click activation link.
              No charges happen until they click <em>Activate</em>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Plan</Label>
              <Select
                value={assignForm.plan_key}
                onValueChange={(v) => setAssignForm((f) => ({ ...f, plan_key: v }))}
              >
                <SelectTrigger className="mt-1.5" data-testid="admin-subs-assign-plan">
                  <SelectValue placeholder="Select a plan…" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.plan_key} value={p.plan_key}>
                      {p.name} — {fmtMoney(p.price, p.currency)} / {p.interval_count || 1}{" "}
                      {(p.interval_unit || "MONTH").toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sub-assign-email">Client email *</Label>
              <Input
                id="sub-assign-email"
                type="email"
                value={assignForm.client_email}
                onChange={(e) => setAssignForm((f) => ({ ...f, client_email: e.target.value }))}
                placeholder="client@company.com"
                className="mt-1.5"
                data-testid="admin-subs-assign-email"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Must match an existing client. Provision the client on the Clients page if needed.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm pt-1">
              <input
                type="checkbox"
                checked={assignForm.send_email}
                onChange={(e) => setAssignForm((f) => ({ ...f, send_email: e.target.checked }))}
                data-testid="admin-subs-assign-send-email"
              />
              Email the client the activation link now
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button
              onClick={onAssign}
              disabled={busy}
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
              data-testid="admin-subs-assign-submit"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-assign link dialog */}
      <Dialog open={Boolean(linkDialog)} onOpenChange={(o) => !o && setLinkDialog(null)}>
        <DialogContent data-testid="admin-subs-link-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {linkDialog?.planName} assigned to {linkDialog?.clientEmail}
            </DialogTitle>
            <DialogDescription>
              Share this PayPal approval link if the email didn&apos;t reach them.
            </DialogDescription>
          </DialogHeader>
          {linkDialog?.approvalUrl && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border px-3 py-2 text-xs break-all font-mono bg-[var(--warm-50)]">
                {linkDialog.approvalUrl}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyText(linkDialog.approvalUrl)}
                  data-testid="admin-subs-link-copy"
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy link
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a
                    href={linkDialog.approvalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="admin-subs-link-open"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Open
                  </a>
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkDialog(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({ label, value, accent }) {
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </div>
        <div className={`font-display text-2xl font-semibold mt-2 tabular-nums ${accent || ""}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
