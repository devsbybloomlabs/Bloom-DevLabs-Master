import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  CalendarClock,
  AlertTriangle,
  Receipt,
  FileSignature,
  Users,
  ArrowUpRight,
  CircleDollarSign,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Mail,
  ExternalLink,
} from "lucide-react";
import {
  useAgencyHandy,
  useAgencyHandyResource,
  formatMoney,
  formatDateTime,
  relativeFromNow,
  PROPOSAL_STATUS_VARIANT,
  stripHtml,
} from "@/lib/agencyhandy";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function KpiCard({ icon: Icon, label, value, sub, accent, testId, badge }) {
  return (
    <Card className="border-border" data-testid={testId}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
          <Icon className={`h-4 w-4 ${accent || "text-[#3B82F6]"}`} />
        </div>
        <div className="font-display text-2xl font-semibold mt-2 tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        {badge && <div className="mt-2">{badge}</div>}
      </CardContent>
    </Card>
  );
}

function StaleBanner({ stale, error, fetchedAt }) {
  if (!stale && !error) return null;
  return (
    <div
      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2"
      data-testid="ah-stale-banner"
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <div>
        <div className="font-medium">Showing cached Agency Handy data</div>
        <div className="text-xs mt-0.5">
          {error ? `Upstream error: ${error}.` : ""}{" "}
          Last refreshed {formatDateTime(fetchedAt)}.
        </div>
      </div>
    </div>
  );
}

function ProposalsTable({ proposals, currency }) {
  if (!proposals || proposals.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground" data-testid="ah-proposals-empty">
        No proposals to show.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Proposal</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Service / Package</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead>Sent</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {proposals.map((p) => (
            <TableRow key={p.id} data-testid={`ah-proposal-row-${p.id}`}>
              <TableCell className="font-medium">#{p.display_id}</TableCell>
              <TableCell>
                <div className="font-medium">{p.client_name || "—"}</div>
                {p.client_email && (
                  <div className="text-xs text-muted-foreground">{p.client_email}</div>
                )}
              </TableCell>
              <TableCell>
                <div>{p.service_name || "—"}</div>
                {p.package_name && (
                  <div className="text-xs text-muted-foreground">{p.package_name}</div>
                )}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={`capitalize ${PROPOSAL_STATUS_VARIANT[p.status] || ""}`}
                >
                  {p.status}
                </Badge>
                {p.age_days !== undefined && (
                  <div className="text-xs text-muted-foreground mt-1">{p.age_days}d ago</div>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(p.budget, p.currency || currency)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDateTime(p.sentAt, { dateOnly: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SubscriptionsTable({ subs, currency }) {
  if (!subs || subs.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground" data-testid="ah-subs-empty">
        No subscriptions to show.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Cycle</TableHead>
            <TableHead className="text-right">Monthly value</TableHead>
            <TableHead>Next payment</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subs.map((s) => (
            <TableRow key={s.object_id} data-testid={`ah-sub-row-${s.object_id}`}>
              <TableCell className="font-medium">{s.id}</TableCell>
              <TableCell>
                <div className="font-medium">{s.client_name || "—"}</div>
                {s.client_email && (
                  <div className="text-xs text-muted-foreground">{s.client_email}</div>
                )}
              </TableCell>
              <TableCell className="text-xs">
                {s.repeat_count ? `${s.repeat_count} ${s.repeat_duration}` : s.repeat_duration}
                <div className="text-muted-foreground">{s.times_repeated || 0}/{s.billing_cycle_count || "∞"} repeats</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(s.monthly_value, s.currency || currency)}
              </TableCell>
              <TableCell className="text-xs">
                <div>{formatDateTime(s.next_payment, { dateOnly: true })}</div>
                <div className="text-muted-foreground">{relativeFromNow(s.next_payment)}</div>
              </TableCell>
              <TableCell>
                {s.has_failed_payment ? (
                  <Badge variant="outline" className="bg-rose-100 text-rose-900">
                    Failed payment
                  </Badge>
                ) : s.is_active ? (
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-900">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-secondary text-foreground">
                    Inactive
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function InvoicesTable({ invoices, currency }) {
  if (!invoices || invoices.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground" data-testid="ah-invoices-empty">
        No invoices yet. Once orders are placed in Agency Handy, they'll appear here.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => (
            <TableRow key={inv._id || inv.id}>
              <TableCell className="font-medium">{inv.invoiceNumber || inv.id}</TableCell>
              <TableCell>
                {inv.client?.firstName} {inv.client?.lastName}
                {inv.client?.email && (
                  <div className="text-xs text-muted-foreground">{inv.client.email}</div>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">
                  {inv.status || "—"}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(inv.amount || inv.total, inv.currency || currency)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDateTime(inv.dueDate, { dateOnly: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ClientsTable({ clients }) {
  if (!clients || clients.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground" data-testid="ah-clients-empty">
        No clients yet.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Sources</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((c) => (
            <TableRow key={c.id || c.email}>
              <TableCell className="font-medium">
                {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
              </TableCell>
              <TableCell>{c.email || "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground capitalize">
                {Array.isArray(c.sources) ? Array.from(new Set(c.sources)).join(", ") : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RenewalCard({ renewals, currency }) {
  if (!renewals || renewals.length === 0) return null;
  return (
    <Card className="border-border" data-testid="ah-renewals-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-[#3B82F6]" />
          Renewals in next 7 days
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-2">
          {renewals.map((r) => (
            <li
              key={r.object_id}
              className="flex items-center justify-between border border-border rounded-lg px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{r.client_name || r.client_email}</div>
                <div className="text-xs text-muted-foreground">
                  {r.id} · {r.repeat_duration} · in {r.days_until_renewal}d
                </div>
              </div>
              <div className="text-right tabular-nums text-sm">
                {formatMoney(r.monthly_value, r.currency || currency)}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function FollowUpsCard({ followUps, currency }) {
  if (!followUps || followUps.length === 0) {
    return (
      <Card className="border-border" data-testid="ah-followups-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            Proposals needing follow-up
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-sm text-muted-foreground py-6 text-center">
            All proposals are fresh — no follow-ups needed.
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-amber-200 bg-amber-50/30" data-testid="ah-followups-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-600" />
          Proposals needing follow-up
          <Badge variant="outline" className="bg-amber-100 text-amber-900 border-0 text-[10px]">
            {followUps.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {followUps.slice(0, 6).map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between border border-border bg-card rounded-lg px-3 py-2 text-sm"
            data-testid={`ah-followup-${p.id}`}
          >
            <div className="min-w-0">
              <div className="font-medium truncate">{p.client_name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {p.service_name} · {p.package_name} · sent {p.age_days}d ago
              </div>
            </div>
            <div className="text-right ml-3 flex-shrink-0">
              <div className="tabular-nums text-sm font-medium">
                {formatMoney(p.budget, p.currency || currency)}
              </div>
              {p.client_email && (
                <a
                  href={`mailto:${p.client_email}?subject=Following%20up%20on%20${encodeURIComponent(
                    p.service_name || "our proposal"
                  )}`}
                  className="text-xs text-[#1E3A8A] hover:underline inline-flex items-center gap-1 mt-0.5"
                  data-testid={`ah-followup-${p.id}-email`}
                >
                  <Mail className="h-3 w-3" /> Email
                </a>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OrdersList({ orders }) {
  if (!orders || orders.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground" data-testid="ah-orders-empty">
        No orders yet.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {orders.map((o) => (
        <li key={o._id || o.id} className="py-3 text-sm flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium truncate">{o.name || o.title || `Order ${o.id}`}</div>
            {o.client && (
              <div className="text-xs text-muted-foreground">
                {o.client.firstName} {o.client.lastName}
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex-shrink-0">
            {formatDateTime(o.createdAt, { dateOnly: true })}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function RevenuePage() {
  const summary = useAgencyHandyResource("/summary");
  const proposals = useAgencyHandyResource("/proposals");
  const subscriptions = useAgencyHandyResource("/subscriptions");
  const invoices = useAgencyHandyResource("/invoices");
  const clients = useAgencyHandyResource("/clients");
  const health = useAgencyHandyResource("/health");
  const { refresh } = useAgencyHandy();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      await Promise.all([
        summary.reload(),
        proposals.reload(),
        subscriptions.reload(),
        invoices.reload(),
        clients.reload(),
        health.reload(),
      ]);
      toast.success("Refreshed Agency Handy data");
    } catch (e) {
      toast.error("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const sd = summary.data || {};
  const currency = sd.currency || "USD";
  const mrr = sd.mrr || {};
  const inv = sd.invoices || {};
  const props = sd.proposals || {};
  const renewals = sd.renewals_7d || [];
  const ordersRecent = (sd.orders && sd.orders.recent) || [];
  const stale = (sd.freshness?.stale_sources || []).length > 0;

  if (summary.loading && !summary.data) {
    return (
      <div className="space-y-6" data-testid="revenue-loading">
        <Skeleton className="h-12 w-1/2" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (summary.error && !summary.data) {
    return (
      <div className="py-16 text-center" data-testid="revenue-error">
        <div className="text-base font-medium">Couldn't load Agency Handy data</div>
        <div className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{summary.error}</div>
        <Button
          onClick={() => summary.reload()}
          variant="outline"
          className="mt-4"
          data-testid="revenue-retry-button"
        >
          Retry
        </Button>
      </div>
    );
  }

  const mrrDelta = mrr.mom_delta_pct;
  const mrrTrendIcon = mrrDelta == null ? null : mrrDelta >= 0 ? TrendingUp : TrendingDown;
  const mrrTrendBadge = mrrDelta == null
    ? null
    : (
        <Badge
          variant="outline"
          className={
            mrrDelta >= 0
              ? "bg-emerald-100 text-emerald-900 border-0"
              : "bg-rose-100 text-rose-900 border-0"
          }
        >
          {mrrDelta >= 0 ? "+" : ""}
          {mrrDelta}% MoM
        </Badge>
      );

  return (
    <div className="space-y-6" data-testid="revenue-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Revenue · Agency Handy
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-1">
            Revenue & Clients
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Live MRR, proposals to follow up, renewals coming, and clients — sourced directly
            from Agency Handy.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {health.data?.connected ? (
            <Badge variant="outline" className="bg-emerald-100 text-emerald-900 border-0">
              Connected · {health.data.company?.name}
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-rose-100 text-rose-900 border-0">
              Disconnected
            </Badge>
          )}
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            disabled={refreshing}
            data-testid="revenue-refresh-button"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
          {health.data?.company?.uniqueName && (
            <Button
              asChild
              variant="outline"
              size="sm"
              data-testid="revenue-open-ah-button"
            >
              <a
                href={`https://${health.data.company.uniqueName}.agencyhandy.com`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Agency Handy <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </a>
            </Button>
          )}
        </div>
      </div>

      <StaleBanner
        stale={stale}
        error={summary.error || (sd.freshness?.stale_sources || []).join(", ")}
        fetchedAt={sd.freshness?.fetched_at}
      />

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          icon={CircleDollarSign}
          label="MRR"
          value={formatMoney(mrr.total, currency)}
          sub={`ARR ≈ ${formatMoney(mrr.arr, currency)} · ${mrr.active_subscriptions || 0} active subs`}
          accent="text-emerald-600"
          testId="revenue-kpi-mrr"
          badge={mrrTrendBadge}
        />
        <KpiCard
          icon={FileSignature}
          label="Proposals pending"
          value={String(props.pending || 0)}
          sub={`${props.total || 0} total · ${props.acceptance_rate || 0}% acceptance`}
          accent="text-[#1E3A8A]"
          testId="revenue-kpi-proposals"
        />
        <KpiCard
          icon={Receipt}
          label="Open invoices"
          value={formatMoney(inv.open_total, currency)}
          sub={`${inv.open_count || 0} open · ${inv.overdue_count || 0} overdue`}
          accent={inv.overdue_count ? "text-rose-600" : "text-amber-600"}
          testId="revenue-kpi-invoices"
        />
        <KpiCard
          icon={CalendarClock}
          label="Renewals (7d)"
          value={String(renewals.length)}
          sub={renewals.length ? "Reach out for upsell or check-in" : "Nothing upcoming"}
          accent="text-[#3B82F6]"
          testId="revenue-kpi-renewals"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 gap-1 w-full sm:w-auto">
          <TabsTrigger value="overview" data-testid="revenue-tab-overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="subscriptions" data-testid="revenue-tab-subscriptions">
            Subscriptions
          </TabsTrigger>
          <TabsTrigger value="proposals" data-testid="revenue-tab-proposals">
            Proposals
          </TabsTrigger>
          <TabsTrigger value="invoices" data-testid="revenue-tab-invoices">
            Invoices
          </TabsTrigger>
          <TabsTrigger value="clients" data-testid="revenue-tab-clients">
            Clients
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <FollowUpsCard followUps={props.follow_ups} currency={currency} />
            <RenewalCard renewals={renewals} currency={currency} />
          </div>
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-[#3B82F6]" />
                Recent orders
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <OrdersList orders={ordersRecent} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-3 mt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {(subscriptions.data?.data || []).length} subscriptions · source:{" "}
              <span className="capitalize">{subscriptions.data?.source || "—"}</span>
            </div>
          </div>
          <SubscriptionsTable subs={subscriptions.data?.data} currency={currency} />
        </TabsContent>

        <TabsContent value="proposals" className="space-y-3 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 inline mr-1 text-emerald-600" />
              {props.accepted || 0} accepted{" "}
              <span className="mx-2">·</span>
              <Clock className="h-3.5 w-3.5 inline mr-1 text-amber-600" />
              {props.pending || 0} pending
              <span className="mx-2">·</span>
              <XCircle className="h-3.5 w-3.5 inline mr-1 text-rose-600" />
              {props.rejected || 0} rejected
            </div>
          </div>
          <ProposalsTable proposals={proposals.data?.data} currency={currency} />
        </TabsContent>

        <TabsContent value="invoices" className="space-y-3 mt-4">
          <div className="text-sm text-muted-foreground">
            {(invoices.data?.data || []).length} invoices
          </div>
          <InvoicesTable invoices={invoices.data?.data} currency={currency} />
        </TabsContent>

        <TabsContent value="clients" className="space-y-3 mt-4">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            {(clients.data?.data || []).length} clients
            {clients.data?.source === "derived" && (
              <Badge variant="outline" className="text-[10px]">
                derived from quotations & subs
              </Badge>
            )}
          </div>
          <ClientsTable clients={clients.data?.data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
