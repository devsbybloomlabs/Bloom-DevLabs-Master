/**
 * Admin · Support Triage
 *
 * Surfaces all ThriveDesk → Nifty escalations. Lets the founder:
 *   • View urgent + feature-request tickets routed from ThriveDesk
 *   • Manually resolve an escalation (posts a ThriveDesk reply + optional close)
 *   • Simulate a sandbox ticket to demo the loop end-to-end
 *   • Inspect the mock log when ThriveDesk is in mock mode
 */
import { useEffect, useMemo, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import EscalationTimelineDialog from "@/components/admin/EscalationTimelineDialog";
import {
  LifeBuoy,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  XCircle,
  History,
  FlaskConical,
  Send,
  Clock,
} from "lucide-react";

const TYPE_META = {
  urgent: {
    label: "Urgent",
    color: "bg-rose-100 text-rose-900 border-rose-200",
    Icon: AlertTriangle,
  },
  feature: {
    label: "Feature Request",
    color: "bg-blue-100 text-blue-900 border-blue-200",
    Icon: Sparkles,
  },
  other: {
    label: "Other",
    color: "bg-slate-100 text-slate-900 border-slate-200",
    Icon: LifeBuoy,
  },
};

const STATUS_META = {
  open: { label: "Open", color: "bg-amber-100 text-amber-900" },
  resolved: { label: "Resolved", color: "bg-emerald-100 text-emerald-900" },
  closed: { label: "Closed", color: "bg-slate-200 text-slate-900" },
};

export default function SupportTriageAdmin() {
  const api = useAdminApi();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [resolveTarget, setResolveTarget] = useState(null);
  const [timelineTarget, setTimelineTarget] = useState(null);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [mockLogOpen, setMockLogOpen] = useState(false);
  const [mockLog, setMockLog] = useState({ mode: "mock", entries: [] });

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/support-triage");
      setItems(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load escalations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filterStatus !== "all" && it.status !== filterStatus) return false;
      if (filterType !== "all" && it.escalation_type !== filterType) return false;
      return true;
    });
  }, [items, filterStatus, filterType]);

  const counts = useMemo(() => {
    const c = { open: 0, urgent: 0, feature: 0, resolved: 0 };
    items.forEach((it) => {
      if (it.status === "open") c.open += 1;
      if (it.escalation_type === "urgent" && it.status === "open") c.urgent += 1;
      if (it.escalation_type === "feature" && it.status === "open") c.feature += 1;
      if (it.status === "resolved" || it.status === "closed") c.resolved += 1;
    });
    return c;
  }, [items]);

  const onMockLog = async () => {
    try {
      const r = await api.get("/admin/support-triage/mock-log");
      setMockLog(r.data);
      setMockLogOpen(true);
    } catch {
      toast.error("Could not fetch mock log");
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-support-triage-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-[#1E3A8A]" />
            Support Triage
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ThriveDesk tickets escalated to Nifty PM. Resolve an escalation here
            to auto-reply on the ticket (and optionally close it).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            data-testid="support-triage-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onMockLog}
            data-testid="support-triage-mock-log-button"
          >
            <History className="h-4 w-4 mr-2" />
            Mock log
          </Button>
          <Button
            size="sm"
            onClick={() => setSimulateOpen(true)}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="support-triage-simulate-button"
          >
            <FlaskConical className="h-4 w-4 mr-2" />
            Simulate ticket
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Open escalations" value={counts.open} color="text-amber-600" />
        <StatTile label="Urgent (open)" value={counts.urgent} color="text-rose-600" />
        <StatTile label="Feature requests (open)" value={counts.feature} color="text-blue-600" />
        <StatTile label="Resolved" value={counts.resolved} color="text-emerald-600" />
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="font-display text-lg">Escalations</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px]" data-testid="support-filter-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="feature">Feature</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px]" data-testid="support-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="py-12 text-center text-sm text-muted-foreground"
              data-testid="support-triage-empty"
            >
              {items.length === 0
                ? 'No escalations yet. Try "Simulate ticket" to see the loop in action.'
                : "No escalations match the current filter."}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((it) => {
                const type = TYPE_META[it.escalation_type] || TYPE_META.other;
                const TypeIcon = type.Icon;
                const statusMeta = STATUS_META[it.status] || STATUS_META.open;
                return (
                  <div
                    key={it.id}
                    className="rounded-xl border border-border p-4 hover:bg-secondary/30 transition-colors"
                    data-testid={`support-escalation-row-${it.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`border ${type.color}`}>
                            <TypeIcon className="h-3 w-3 mr-1" />
                            {type.label}
                          </Badge>
                          <Badge className={`border-0 ${statusMeta.color}`}>
                            {statusMeta.label}
                          </Badge>
                          <span className="font-display text-sm font-semibold truncate">
                            {it.subject}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {it.client_name}
                          {it.client_email && ` · ${it.client_email}`}
                          {it.created_at && (
                            <> · {new Date(it.created_at).toLocaleString()}</>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                          {it.ticket_url && (
                            <a
                              href={it.ticket_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#1E3A8A] hover:text-[#3B82F6] inline-flex items-center gap-1"
                            >
                              ThriveDesk
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {it.nifty_task_id ? (
                            <span className="text-muted-foreground">
                              Nifty task:{" "}
                              <code className="font-mono">
                                {String(it.nifty_task_id).slice(0, 10)}…
                              </code>
                            </span>
                          ) : it.nifty_error ? (
                            <span className="text-rose-600 inline-flex items-center gap-1">
                              <XCircle className="h-3 w-3" />
                              Nifty task failed (see Notifications)
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              Nifty: not connected
                            </span>
                          )}
                        </div>
                      </div>
                      {it.status === "open" && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setTimelineTarget(it.id)}
                            data-testid={`support-timeline-${it.id}`}
                          >
                            <Clock className="h-3.5 w-3.5 mr-1.5" />
                            Timeline
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setResolveTarget(it)}
                            data-testid={`support-resolve-${it.id}`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            Resolve
                          </Button>
                        </div>
                      )}
                      {it.status !== "open" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setTimelineTarget(it.id)}
                          data-testid={`support-timeline-${it.id}`}
                        >
                          <Clock className="h-3.5 w-3.5 mr-1.5" />
                          Timeline
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ResolveDialog
        target={resolveTarget}
        onClose={() => setResolveTarget(null)}
        onResolved={() => {
          setResolveTarget(null);
          load();
        }}
      />

      <SimulateDialog
        open={simulateOpen}
        onClose={() => setSimulateOpen(false)}
        onSimulated={() => {
          setSimulateOpen(false);
          load();
        }}
      />

      <EscalationTimelineDialog
        escalationId={timelineTarget}
        open={!!timelineTarget}
        onClose={() => setTimelineTarget(null)}
      />

      <Dialog open={mockLogOpen} onOpenChange={setMockLogOpen}>
        <DialogContent className="max-w-2xl" data-testid="support-triage-mock-log-dialog">
          <DialogHeader>
            <DialogTitle>ThriveDesk activity log</DialogTitle>
            <DialogDescription>
              Mode: <code className="font-mono">{mockLog.mode}</code>
              {mockLog.mode === "mock" &&
                " · Set the ThriveDesk API key in /admin/integrations → Credentials to go live."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-2 text-xs">
            {(mockLog.entries || []).length === 0 ? (
              <div className="text-muted-foreground py-4 text-center">No activity yet.</div>
            ) : (
              mockLog.entries.map((e) => (
                <div key={e.id} className="rounded-lg border border-border p-2">
                  <div className="flex items-center justify-between">
                    <code className="font-mono text-[#1E3A8A]">{e.action}</code>
                    <span className="text-muted-foreground tabular-nums">
                      {new Date(e.at).toLocaleString()}
                    </span>
                  </div>
                  <pre className="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap break-all">
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({ label, value, color }) {
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
        <div className={`font-display text-2xl font-semibold mt-2 tabular-nums ${color}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function ResolveDialog({ target, onClose, onResolved }) {
  const api = useAdminApi();
  const [summary, setSummary] = useState("");
  const [closeTicket, setCloseTicket] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) {
      setSummary("");
      setCloseTicket(false);
    }
  }, [target]);

  const onSubmit = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.post(`/admin/support-triage/${target.id}/resolve`, {
        summary: summary || "Issue resolved internally.",
        close_ticket: closeTicket,
      });
      toast.success(
        closeTicket
          ? "Ticket replied + closed in ThriveDesk"
          : "Ticket replied in ThriveDesk"
      );
      onResolved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Resolve failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-testid="support-resolve-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Resolve escalation</DialogTitle>
          <DialogDescription>
            Posts a public reply on the ThriveDesk ticket{target?.client_email ? ` (${target.client_email})` : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm">Summary</Label>
            <Textarea
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Short message included in the customer-facing reply"
              data-testid="support-resolve-summary"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={closeTicket}
              onCheckedChange={(v) => setCloseTicket(!!v)}
              data-testid="support-resolve-close-ticket"
            />
            Also close the ThriveDesk ticket
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={busy}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="support-resolve-submit"
          >
            {busy ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SimulateDialog({ open, onClose, onSimulated }) {
  const api = useAdminApi();
  const [form, setForm] = useState({
    subject: "URGENT: Checkout is failing on mobile",
    body: "Our customers can't complete checkout on iPhones. Started 30 mins ago.",
    tags: "High Priority",
    customer_name: "Acme Co",
    customer_email: "ops@acme.com",
  });
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setBusy(true);
    try {
      const r = await api.post("/admin/support-triage/simulate-ticket", {
        subject: form.subject,
        body: form.body,
        tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
        customer_name: form.customer_name,
        customer_email: form.customer_email,
      });
      toast.success(
        `Escalated as ${r.data.classification.toUpperCase()} · ${r.data.escalation_id.slice(0, 8)}`
      );
      onSimulated();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Simulation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-testid="support-simulate-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Simulate ThriveDesk ticket</DialogTitle>
          <DialogDescription>
            Routes a fake ticket through the same rule engine as a real webhook.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm">Subject</Label>
            <Input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              data-testid="simulate-subject-input"
            />
          </div>
          <div>
            <Label className="text-sm">Body</Label>
            <Textarea
              rows={3}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              data-testid="simulate-body-input"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Tags (comma separated)</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="High Priority OR Feature Request"
                data-testid="simulate-tags-input"
              />
            </div>
            <div>
              <Label className="text-sm">Customer name</Label>
              <Input
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                data-testid="simulate-customer-name-input"
              />
            </div>
          </div>
          <div>
            <Label className="text-sm">Customer email</Label>
            <Input
              type="email"
              value={form.customer_email}
              onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
              data-testid="simulate-customer-email-input"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={busy}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="simulate-submit-button"
          >
            {busy ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4 mr-2" />
            )}
            Simulate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
