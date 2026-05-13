import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useClientAuth, clientApi } from "@/lib/clientAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MilestoneTimeline from "@/components/MilestoneTimeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CreditCard,
  FileText,
  Receipt,
  Folder,
  User as UserIcon,
  LogOut,
  ExternalLink,
  Inbox,
  Loader2,
  ClipboardList,
  ArrowRight,
  Target,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Circle,
  PartyPopper,
  MessageSquare,
  Download,
  Sparkles,
  FolderOpen,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import ClientContactPanel from "@/pages/client/ClientContactPanel";
import ProjectBriefView, { ApprovedBriefsAccordion } from "@/pages/client/ProjectBriefView";
import ProjectFilesView from "@/pages/client/ProjectFilesView";
import TeamActivityWidget from "@/components/TeamActivityWidget";

function EmptyState({ icon: Icon = Inbox, title, message }) {
  return (
    <div
      className="rounded-xl border border-dashed border-border bg-[var(--warm-50)] p-10 text-center"
      data-testid="portal-empty-state"
    >
      <div className="mx-auto h-12 w-12 rounded-full bg-white flex items-center justify-center mb-3 shadow-[var(--shadow-sm)]">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="font-display text-base font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    COMPLETED: "bg-green-100 text-green-800",
    ACTIVE: "bg-green-100 text-green-800",
    paid: "bg-green-100 text-green-800",
    CREATED: "bg-amber-100 text-amber-800",
    APPROVAL_PENDING: "bg-amber-100 text-amber-800",
    PENDING: "bg-amber-100 text-amber-800",
    sent: "bg-blue-100 text-blue-800",
    CANCELLED: "bg-zinc-200 text-zinc-700",
    EXPIRED: "bg-zinc-200 text-zinc-700",
  };
  const cls = map[status] || "bg-zinc-100 text-zinc-700";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {status || "—"}
    </span>
  );
}

function fmt(amount, currency = "USD") {
  if (amount == null) return "—";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(n)) return amount;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function OrdersList({ data, loading, approvedBriefs }) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  const pp = data?.paypal || [];
  const ah = data?.agencyhandy || [];
  if (!pp.length && !ah.length) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No orders yet"
          message="Your purchases and project orders will appear here."
        />
        {Array.isArray(approvedBriefs) && approvedBriefs.length > 0 && (
          <ApprovedBriefsAccordion briefs={approvedBriefs} />
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="portal-orders-list">
      {pp.map((o) => (
        <Card key={o.id} className="border-border">
          <CardContent className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-[#1E3A8A]">PayPal</span>
                <StatusPill status={o.status} />
              </div>
              <p className="mt-1 font-display text-base font-medium truncate">
                {o.description || o.tier || "Service"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 break-anywhere">
                Order #{o.id}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-semibold tabular-nums">
                {fmt(o.amount, o.currency)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {o.created_at?.slice(0, 10) || ""}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
      {ah.map((o, i) => (
        <Card key={`ah-${o._id || i}`} className="border-border">
          <CardContent className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Project</span>
                <StatusPill status={o.status} />
              </div>
              <p className="mt-1 font-display text-base font-medium truncate">
                {o.title || o.name || o.service?.name || "Project"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-semibold tabular-nums">
                {fmt(o.totalAmount || o.amount, o.currency)}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
      {Array.isArray(approvedBriefs) && approvedBriefs.length > 0 && (
        <ApprovedBriefsAccordion briefs={approvedBriefs} />
      )}
    </div>
  );
}

function SubscriptionsList({ activeSubs, plans, loading, api, reload }) {
  const [busyId, setBusyId] = useState(null);
  const [subscribing, setSubscribing] = useState(null);
  if (loading) return <Skeleton className="h-32 w-full" />;
  const subs = Array.isArray(activeSubs) ? activeSubs : [];
  const catalog = Array.isArray(plans) ? plans : [];

  const onSubscribe = async (plan) => {
    setSubscribing(plan.plan_key);
    try {
      const r = await api.post("/clients/subscriptions/subscribe", {
        plan_key: plan.plan_key,
      });
      if (r.data?.approval_url) {
        window.location.href = r.data.approval_url;
      }
    } catch (e) {
      window.alert(e?.response?.data?.detail || "Could not start subscription");
      setSubscribing(null);
    }
  };

  const onCancel = async (sub) => {
    if (!window.confirm(`Cancel ${sub.plan_name || sub.plan_key}? You can re-subscribe anytime.`)) return;
    setBusyId(sub.id);
    try {
      await api.post(`/clients/subscriptions/${sub.id}/cancel`);
      reload && reload();
    } catch (e) {
      window.alert(e?.response?.data?.detail || "Could not cancel");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="portal-subscriptions-list">
      <div>
        <h3 className="font-display text-lg font-medium mb-2.5">Active subscriptions</h3>
        {subs.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              You don&apos;t have any active subscriptions yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {subs.map((s) => (
              <Card
                key={s.id}
                className="border-border"
                data-testid={`portal-subscription-${s.id}`}
              >
                <CardContent className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusPill status={s.status} />
                      <span className="text-xs text-muted-foreground capitalize">
                        {s.source?.replace("_", " ") || "self"}
                      </span>
                    </div>
                    <p className="mt-1 font-display text-base font-medium">
                      {s.plan_name || s.plan_key}
                    </p>
                    {s.plan_interval && (
                      <p className="text-xs text-muted-foreground">
                        Renews every {s.plan_interval}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-display text-lg font-semibold tabular-nums">
                      {fmt(s.plan_price, s.plan_currency)}
                    </p>
                    {["ACTIVE", "APPROVAL_PENDING"].includes(s.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onCancel(s)}
                        disabled={busyId === s.id}
                        className="text-rose-600 hover:bg-rose-50"
                        data-testid={`portal-sub-cancel-${s.id}`}
                      >
                        Cancel
                      </Button>
                    )}
                    {s.status === "APPROVAL_PENDING" && s.approval_url && (
                      <Button
                        size="sm"
                        asChild
                        className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                        data-testid={`portal-sub-activate-${s.id}`}
                      >
                        <a href={s.approval_url}>Activate</a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {catalog.length > 0 && (
        <div>
          <h3 className="font-display text-lg font-medium mb-2.5">Add-ons & retainers</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {catalog.map((plan) => (
              <Card
                key={plan.plan_key}
                className="border-border hover:border-[#1E3A8A]/40 transition-colors"
                data-testid={`portal-plan-${plan.plan_key}`}
              >
                <CardContent className="p-5">
                  <p className="font-display text-base font-semibold">{plan.name}</p>
                  {plan.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                      {plan.description}
                    </p>
                  )}
                  <p className="mt-3 font-display text-2xl font-semibold tabular-nums">
                    {fmt(plan.price, plan.currency)}
                    <span className="text-xs font-normal text-muted-foreground">
                      {" "}/ {plan.interval_count || 1} {(plan.interval_unit || "MONTH").toLowerCase()}
                    </span>
                  </p>
                  <Button
                    size="sm"
                    onClick={() => onSubscribe(plan)}
                    disabled={subscribing === plan.plan_key}
                    className="mt-4 w-full bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                    data-testid={`portal-subscribe-${plan.plan_key}`}
                  >
                    {subscribing === plan.plan_key ? "Redirecting…" : "Subscribe"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InvoicesList({ data, loading, token }) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  const items = Array.isArray(data) ? data : [];
  if (!items.length) {
    return (
      <EmptyState
        title="No invoices yet"
        message="Invoices appear here automatically once a payment is captured. You'll also receive a branded PDF receipt by email."
      />
    );
  }
  const statusColor = {
    paid: "bg-emerald-100 text-emerald-900",
    issued: "bg-blue-100 text-blue-900",
    draft: "bg-secondary text-foreground",
    void: "bg-rose-100 text-rose-900",
    overdue: "bg-rose-100 text-rose-900",
    partial: "bg-amber-100 text-amber-900",
  };
  const downloadPdf = async (inv) => {
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(
        `${API}/api/clients/invoices/${inv.id}/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inv.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      // Surface failure as toast in real UI; portal Toaster picks it up
      window.alert("Could not download invoice — please try again.");
    }
  };
  return (
    <div className="space-y-3" data-testid="portal-invoices-list">
      {items.map((inv) => (
        <Card key={inv.id} className="border-border" data-testid={`portal-invoice-${inv.id}`}>
          <CardContent className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-[0.08em] ${statusColor[inv.status] || "bg-secondary text-foreground"}`}>
                  {inv.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  Issued {inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : "—"}
                </span>
                {inv.paid_at && (
                  <span className="text-xs text-emerald-700">
                    · Paid {new Date(inv.paid_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              <p className="mt-1 font-display text-base font-medium">{inv.number}</p>
              {inv.line_items && inv.line_items.length > 0 && (
                <p className="text-xs text-muted-foreground truncate">
                  {inv.line_items[0].description}
                  {inv.line_items.length > 1 && ` +${inv.line_items.length - 1} more`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="font-display text-lg font-semibold tabular-nums">
                  {fmt(inv.total, inv.currency)}
                </p>
                {inv.balance_due > 0 && inv.status !== "paid" && (
                  <p className="text-[11px] text-rose-700">
                    {fmt(inv.balance_due, inv.currency)} due
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadPdf(inv)}
                data-testid={`portal-invoice-download-${inv.id}`}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                PDF
              </Button>
              {inv.status !== "paid" && inv.status !== "void" && Number(inv.balance_due || 0) > 0 && (
                <Button
                  size="sm"
                  onClick={() => {
                    window.location.href = `/pay/invoice/${inv.id}`;
                  }}
                  data-testid={`portal-invoice-pay-${inv.id}`}
                >
                  Pay now
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ProposalsList({ data, loading }) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  const items = Array.isArray(data) ? data : [];
  if (!items.length) {
    return (
      <EmptyState
        title="No proposals waiting"
        message="Active proposals & contracts will appear here once your team sends one your way."
      />
    );
  }
  const statusMeta = {
    draft: { label: "Drafting", cls: "bg-secondary text-foreground" },
    sent: { label: "Awaiting your signature", cls: "bg-blue-100 text-blue-900" },
    opened: { label: "Opened", cls: "bg-amber-100 text-amber-900" },
    signed: { label: "Partially signed", cls: "bg-amber-100 text-amber-900" },
    completed: { label: "Signed", cls: "bg-emerald-100 text-emerald-900" },
    declined: { label: "Declined", cls: "bg-rose-100 text-rose-900" },
    expired: { label: "Expired", cls: "bg-rose-100 text-rose-900" },
  };
  return (
    <div className="space-y-3" data-testid="portal-proposals-list">
      {items.map((p) => {
        const meta = statusMeta[p.status] || statusMeta.draft;
        const showAction = p.sign_url && !["completed", "declined", "expired"].includes(p.status);
        return (
          <Card key={p.id} className="border-border" data-testid={`portal-proposal-${p.id}`}>
            <CardContent className="p-4 sm:p-5 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-[0.08em] ${meta.cls}`}>
                    {meta.label}
                  </span>
                  {p.completed_at && (
                    <span className="text-xs text-emerald-700">
                      · Signed {new Date(p.completed_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="mt-1 font-display text-base font-medium truncate">
                  {p.title || "Proposal"}
                </p>
                {p.amount && Number(p.amount) > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {p.currency || "USD"} {Number(p.amount).toFixed(2)}
                  </p>
                )}
              </div>
              {showAction && (
                <Button
                  size="sm"
                  onClick={() => window.open(p.sign_url, "_blank", "noreferrer")}
                  data-testid={`portal-proposal-sign-${p.id}`}
                >
                  Review & sign
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

const MILESTONE_STATUS_META = {
  pending: { label: "Pending", icon: Circle, cls: "bg-zinc-100 text-zinc-700" },
  in_progress: { label: "In Progress", icon: PlayCircle, cls: "bg-amber-100 text-amber-800" },
  complete: { label: "Complete", icon: CheckCircle2, cls: "bg-green-100 text-green-800" },
  blocked: { label: "On Hold", icon: PauseCircle, cls: "bg-red-100 text-red-800" },
};

function MilestonesList({ data, loading }) {
  if (loading) return <Skeleton className="h-64 w-full" />;
  return <MilestoneTimeline milestones={data || []} />;
}

function ProfilePanel({ client, refreshClient, token }) {
  const [form, setForm] = useState({
    name: client?.name || "",
    company: client?.company || "",
    phone: client?.phone || "",
  });
  const [saving, setSaving] = useState(false);

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await clientApi(token).patch("/clients/me", form);
      await refreshClient();
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-base font-display">Profile & billing</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSave} className="space-y-4 max-w-lg" data-testid="portal-profile-form">
          <div>
            <label className="text-sm">Email</label>
            <input
              className="mt-1.5 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
              value={client?.email || ""}
              disabled
              data-testid="portal-profile-email"
            />
          </div>
          <div>
            <label className="text-sm">Name</label>
            <input
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              data-testid="portal-profile-name-input"
            />
          </div>
          <div>
            <label className="text-sm">Company</label>
            <input
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              data-testid="portal-profile-company-input"
            />
          </div>
          <div>
            <label className="text-sm">Phone</label>
            <input
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              data-testid="portal-profile-phone-input"
            />
          </div>
          <Button
            type="submit"
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            disabled={saving}
            data-testid="portal-profile-save-button"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ClientPortal() {
  const { client, token, logout, refreshClient } = useClientAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState(null);
  const [subs, setSubs] = useState(null);
  const [plans, setPlans] = useState(null);
  const [invoices, setInvoices] = useState(null);
  const [proposals, setProposals] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [milestones, setMilestones] = useState(null);
  const [loading, setLoading] = useState(true);
  const [supportClearance, setSupportClearance] = useState(null);
  const [pendingBrief, setPendingBrief] = useState(null);
  const [approvedBriefs, setApprovedBriefs] = useState([]);
  const [files, setFiles] = useState([]);

  // Tab state synced with `?tab=...` URL param so deep-links from emails work
  // (e.g. /portal?tab=invoices, /portal?tab=subscriptions).
  const VALID_TABS = ["milestones", "orders", "subscriptions", "invoices", "proposals", "files", "brief", "contact", "profile"];
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(VALID_TABS.includes(urlTab) ? urlTab : "milestones");

  useEffect(() => {
    // If the URL changes externally, mirror it into state.
    if (urlTab && VALID_TABS.includes(urlTab) && urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab]);

  useEffect(() => {
    // After the brief is approved (or never existed), drop the tab so the
    // user doesn't get stranded on an empty view. Only act after the initial
    // load completes so we don't race the fetch.
    if (!loading && activeTab === "brief" && !pendingBrief) {
      setActiveTab("milestones");
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
    if (!loading && activeTab === "files" && files.length === 0) {
      setActiveTab("milestones");
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, activeTab, pendingBrief, files.length]);

  const onTabChange = (value) => {
    setActiveTab(value);
    // Push the new tab into the URL without scrolling so refresh / share works.
    const next = new URLSearchParams(searchParams);
    if (value === "milestones") next.delete("tab");
    else next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    document.title = "Client Portal — Bloom Labs";
  }, []);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const api = clientApi(token);
    try {
      const [o, s, pl, i, p, ob, ms, sc, pb, ab, pf] = await Promise.allSettled([
        api.get("/clients/me/orders"),
        api.get("/clients/subscriptions"),
        api.get("/clients/subscriptions/plans"),
        api.get("/clients/invoices"),
        api.get("/clients/me/breezedocs-proposals"),
        api.get("/clients/me/onboarding"),
        api.get("/clients/me/milestones"),
        api.get("/clients/me/support/clearance"),
        api.get("/clients/me/briefs/pending"),
        api.get("/clients/me/briefs/approved"),
        api.get("/clients/me/project-files"),
      ]);
      setOrders(o.status === "fulfilled" ? o.value.data : null);
      setSubs(s.status === "fulfilled" ? s.value.data : null);
      setPlans(pl.status === "fulfilled" ? pl.value.data : null);
      setInvoices(i.status === "fulfilled" ? i.value.data : null);
      setProposals(p.status === "fulfilled" ? p.value.data : null);
      setOnboarding(ob.status === "fulfilled" ? ob.value.data : null);
      setMilestones(ms.status === "fulfilled" ? ms.value.data : null);
      setSupportClearance(sc.status === "fulfilled" ? sc.value.data : null);
      setPendingBrief(pb.status === "fulfilled" ? pb.value.data : null);
      setApprovedBriefs(ab.status === "fulfilled" ? (ab.value.data || []) : []);
      setFiles(pf.status === "fulfilled" ? (pf.value.data || []) : []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onLogout = () => {
    logout();
    toast.success("Signed out");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[var(--warm-50)]" data-testid="client-portal-page">
      <header className="border-b border-border bg-background">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="portal-logo-link">
            <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-7 sm:h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            {supportClearance?.tier && supportClearance.tier !== "none" && (
              <button
                onClick={() => {
                  if (supportClearance?.support_uid) {
                    navigator.clipboard?.writeText(supportClearance.support_uid).then(
                      () => toast.success(`Support UID copied: ${supportClearance.support_uid}`),
                      () => {}
                    );
                  }
                }}
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${
                  supportClearance.tier === "vip"
                    ? "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200"
                    : supportClearance.tier === "premium"
                    ? "bg-sky-100 text-sky-900 border-sky-300 hover:bg-sky-200"
                    : "bg-secondary text-foreground border-border hover:bg-secondary/80"
                } transition-colors`}
                title={`${supportClearance.sla?.label || ""} · Click to copy your Support UID`}
                data-testid="portal-support-tier-badge"
              >
                {supportClearance.tier === "vip" ? "★" : "●"} {supportClearance.tier.toUpperCase()}
              </button>
            )}
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium">{client?.name}</span>
              <span className="text-[11px] text-muted-foreground">{client?.email}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              data-testid="portal-logout-button"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-6 sm:mb-8">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Client Portal</p>
          <h1 className="font-display mt-1.5 text-2xl sm:text-3xl font-semibold tracking-tight">
            Welcome back, {client?.name?.split(" ")[0] || "there"}.
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your projects, invoices, and subscriptions in one place.
          </p>
        </div>

        {onboarding && !onboarding.completed && (
          <Card
            className="mb-6 border-[#1E3A8A]/30 bg-gradient-to-br from-[#1E3A8A]/5 to-[#3B82F6]/5"
            data-testid="portal-onboarding-banner"
          >
            <CardContent className="p-4 sm:p-5 flex flex-wrap items-center gap-4 justify-between">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="h-10 w-10 rounded-full bg-[#1E3A8A] text-white flex items-center justify-center flex-shrink-0">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-display font-medium">
                    Finish your onboarding ({onboarding.current_phase || 1}/3)
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Tell us about your design taste, function references, and
                    success metrics so we can ship the right thing.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => navigate("/portal/onboarding")}
                className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                data-testid="portal-onboarding-resume-button"
              >
                {onboarding.current_phase > 1 ? "Resume" : "Start"}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
          <TabsList className="flex w-full overflow-x-auto no-scrollbar gap-1 bg-background border border-border p-1 h-auto">
            <TabsTrigger value="milestones" data-testid="portal-tab-milestones" className="flex-shrink-0">
              <Target className="h-4 w-4 mr-1.5" /> Milestones
            </TabsTrigger>
            <TabsTrigger value="orders" data-testid="portal-tab-orders" className="flex-shrink-0">
              <CreditCard className="h-4 w-4 mr-1.5" /> Orders
            </TabsTrigger>
            <TabsTrigger value="subscriptions" data-testid="portal-tab-subscriptions" className="flex-shrink-0">
              <Folder className="h-4 w-4 mr-1.5" /> Subscriptions
            </TabsTrigger>
            <TabsTrigger value="invoices" data-testid="portal-tab-invoices" className="flex-shrink-0">
              <Receipt className="h-4 w-4 mr-1.5" /> Invoices
            </TabsTrigger>
            <TabsTrigger value="proposals" data-testid="portal-tab-proposals" className="flex-shrink-0">
              <FileText className="h-4 w-4 mr-1.5" /> Proposals
            </TabsTrigger>
            {files.length > 0 && (
              <TabsTrigger value="files" data-testid="portal-tab-files" className="flex-shrink-0">
                <FolderOpen className="h-4 w-4 mr-1.5" /> Files
                <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground">{files.length}</span>
              </TabsTrigger>
            )}
            {pendingBrief && (
              <TabsTrigger value="brief" data-testid="portal-tab-brief" className="flex-shrink-0 relative">
                <Sparkles className="h-4 w-4 mr-1.5 text-amber-500" /> Project Brief
                <span className="ml-1.5 inline-flex h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden />
              </TabsTrigger>
            )}
            <TabsTrigger value="contact" data-testid="portal-tab-contact" className="flex-shrink-0">
              <MessageSquare className="h-4 w-4 mr-1.5" /> Support
            </TabsTrigger>
            <TabsTrigger value="profile" data-testid="portal-tab-profile" className="flex-shrink-0">
              <UserIcon className="h-4 w-4 mr-1.5" /> Profile
            </TabsTrigger>
          </TabsList>
          <TabsContent value="milestones" className="mt-6">
            <div className="space-y-4">
              <TeamActivityWidget api={clientApi(token)} />
              <MilestonesList data={milestones} loading={loading} />
            </div>
          </TabsContent>
          <TabsContent value="orders" className="mt-6">
            <OrdersList data={orders} loading={loading} approvedBriefs={approvedBriefs} />
          </TabsContent>
          <TabsContent value="subscriptions" className="mt-6">
            <SubscriptionsList
              activeSubs={subs}
              plans={plans}
              loading={loading}
              api={clientApi(token)}
              reload={loadAll}
            />
          </TabsContent>
          <TabsContent value="invoices" className="mt-6">
            <InvoicesList data={invoices} loading={loading} token={token} />
          </TabsContent>
          <TabsContent value="proposals" className="mt-6">
            <ProposalsList data={proposals} loading={loading} />
          </TabsContent>
          {files.length > 0 && (
            <TabsContent value="files" className="mt-6">
              <ProjectFilesView api={clientApi(token)} />
            </TabsContent>
          )}
          {pendingBrief && (
            <TabsContent value="brief" className="mt-6">
              <ProjectBriefView
                brief={pendingBrief}
                api={clientApi(token)}
                onApproved={loadAll}
              />
            </TabsContent>
          )}
          <TabsContent value="contact" className="mt-6">
            <ClientContactPanel token={token} />
          </TabsContent>
          <TabsContent value="profile" className="mt-6">
            <ProfilePanel client={client} refreshClient={refreshClient} token={token} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
