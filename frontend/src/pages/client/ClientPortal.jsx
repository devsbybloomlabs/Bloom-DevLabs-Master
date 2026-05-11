import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useClientAuth, clientApi } from "@/lib/clientAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import ClientContactPanel from "@/pages/client/ClientContactPanel";

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

function OrdersList({ data, loading }) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  const pp = data?.paypal || [];
  const ah = data?.agencyhandy || [];
  if (!pp.length && !ah.length) {
    return (
      <EmptyState
        title="No orders yet"
        message="Your purchases and project orders will appear here."
      />
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
    </div>
  );
}

function SubscriptionsList({ data, loading }) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  const pp = data?.paypal || [];
  const ah = data?.agencyhandy || [];
  if (!pp.length && !ah.length) {
    return (
      <EmptyState
        title="No active subscriptions"
        message="Active recurring services will appear here."
      />
    );
  }
  return (
    <div className="space-y-3" data-testid="portal-subscriptions-list">
      {pp.map((s) => (
        <Card key={s.id} className="border-border">
          <CardContent className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-[#1E3A8A]">PayPal</span>
                <StatusPill status={s.status} />
              </div>
              <p className="mt-1 font-display text-base font-medium truncate">{s.plan_key}</p>
              <p className="text-xs text-muted-foreground mt-0.5 break-anywhere">{s.id}</p>
            </div>
          </CardContent>
        </Card>
      ))}
      {ah.map((s, i) => (
        <Card key={`ah-${s._id || i}`} className="border-border">
          <CardContent className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  AgencyHandy
                </span>
                <StatusPill status={s.status} />
              </div>
              <p className="mt-1 font-display text-base font-medium truncate">
                {s.title || s.service?.name || "Recurring service"}
              </p>
            </div>
            <p className="font-display text-lg font-semibold tabular-nums">
              {fmt(s.totalAmount || s.amount, s.currency)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function InvoicesList({ data, loading }) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  const items = data?.agencyhandy || [];
  if (!items.length) {
    return (
      <EmptyState
        title="No invoices"
        message="When invoices are issued, they'll show up here for download."
      />
    );
  }
  return (
    <div className="space-y-3" data-testid="portal-invoices-list">
      {items.map((inv, i) => (
        <Card key={inv._id || i} className="border-border">
          <CardContent className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StatusPill status={inv.status || "PENDING"} />
              </div>
              <p className="mt-1 font-display text-base font-medium truncate">
                {inv.invoiceNumber || inv.number || `Invoice ${i + 1}`}
              </p>
            </div>
            <p className="font-display text-lg font-semibold tabular-nums">
              {fmt(inv.totalAmount || inv.amount, inv.currency)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ProposalsList({ data, loading }) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  const items = data?.agencyhandy || [];
  if (!items.length) {
    return (
      <EmptyState
        title="No proposals waiting"
        message="Active quotations sent your way will appear here."
      />
    );
  }
  return (
    <div className="space-y-3" data-testid="portal-proposals-list">
      {items.map((p, i) => (
        <Card key={p._id || i} className="border-border">
          <CardContent className="p-4 sm:p-5 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StatusPill status={p.status} />
              </div>
              <p className="mt-1 font-display text-base font-medium truncate">
                {p.title || p.subject || "Proposal"}
              </p>
              {p.description && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{p.description}</p>
              )}
            </div>
            <p className="font-display text-lg font-semibold tabular-nums">
              {fmt(p.totalAmount || p.budget || p.amount, p.currency)}
            </p>
          </CardContent>
        </Card>
      ))}
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
  if (loading) return <Skeleton className="h-32 w-full" />;
  const items = data || [];
  if (!items.length) {
    return (
      <EmptyState
        icon={Target}
        title="No milestones yet"
        message="Your project milestones will appear here as your build progresses."
      />
    );
  }
  return (
    <div className="space-y-3" data-testid="portal-milestones-list">
      {items.map((m) => {
        const meta = MILESTONE_STATUS_META[m.status] || MILESTONE_STATUS_META.pending;
        const StatusIcon = meta.icon;
        const isFinalComplete = m.is_final_deliverable && m.status === "complete";
        return (
          <Card
            key={m.id}
            className={`border-border ${isFinalComplete ? "ring-2 ring-[#3B82F6]/40 shadow-[var(--shadow-md)]" : ""}`}
            data-testid={`portal-milestone-card-${m.id}`}
          >
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.cls}`}>
                      <StatusIcon className="h-3 w-3" />
                      {meta.label}
                    </span>
                    {isFinalComplete && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#1E3A8A] text-white px-2.5 py-1 text-[11px] font-medium">
                        <PartyPopper className="h-3 w-3" />
                        Delivered
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-display text-base font-medium">{m.title}</p>
                  {m.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
                  )}
                  {m.blocked_reason && (
                    <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded px-3 py-1.5">
                      On hold: {m.blocked_reason}
                    </p>
                  )}
                  {m.notes && m.notes.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {m.notes.slice(-3).map((n, i) => (
                        <div key={i} className="text-xs bg-secondary rounded-md px-2.5 py-1.5">
                          <span className="font-medium">{n.author || "Team"}:</span>{" "}
                          <span className="text-muted-foreground">{n.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {m.completion_date ? (
                    <>
                      <p>Completed</p>
                      <p>{new Date(m.completion_date).toLocaleDateString()}</p>
                    </>
                  ) : m.due_date ? (
                    <>
                      <p>Due</p>
                      <p>{new Date(m.due_date).toLocaleDateString()}</p>
                    </>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
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
  const [invoices, setInvoices] = useState(null);
  const [proposals, setProposals] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [milestones, setMilestones] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Client Portal — Bloom Labs";
  }, []);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const api = clientApi(token);
    try {
      const [o, s, i, p, ob, ms] = await Promise.allSettled([
        api.get("/clients/me/orders"),
        api.get("/clients/me/subscriptions"),
        api.get("/clients/me/invoices"),
        api.get("/clients/me/proposals"),
        api.get("/clients/me/onboarding"),
        api.get("/clients/me/milestones"),
      ]);
      setOrders(o.status === "fulfilled" ? o.value.data : null);
      setSubs(s.status === "fulfilled" ? s.value.data : null);
      setInvoices(i.status === "fulfilled" ? i.value.data : null);
      setProposals(p.status === "fulfilled" ? p.value.data : null);
      setOnboarding(ob.status === "fulfilled" ? ob.value.data : null);
      setMilestones(ms.status === "fulfilled" ? ms.value.data : null);
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

        <Tabs defaultValue="milestones" className="w-full">
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
            <TabsTrigger value="contact" data-testid="portal-tab-contact" className="flex-shrink-0">
              <MessageSquare className="h-4 w-4 mr-1.5" /> Contact
            </TabsTrigger>
            <TabsTrigger value="profile" data-testid="portal-tab-profile" className="flex-shrink-0">
              <UserIcon className="h-4 w-4 mr-1.5" /> Profile
            </TabsTrigger>
          </TabsList>
          <TabsContent value="milestones" className="mt-6">
            <MilestonesList data={milestones} loading={loading} />
          </TabsContent>
          <TabsContent value="orders" className="mt-6">
            <OrdersList data={orders} loading={loading} />
          </TabsContent>
          <TabsContent value="subscriptions" className="mt-6">
            <SubscriptionsList data={subs} loading={loading} />
          </TabsContent>
          <TabsContent value="invoices" className="mt-6">
            <InvoicesList data={invoices} loading={loading} />
          </TabsContent>
          <TabsContent value="proposals" className="mt-6">
            <ProposalsList data={proposals} loading={loading} />
          </TabsContent>
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
