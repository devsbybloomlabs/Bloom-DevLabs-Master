/**
 * ProposalsAdmin — manage BreezeDocs proposals & contracts.
 *
 * Capabilities:
 *  • List proposals with status filter + email search
 *  • Stat tiles (total / pending / signed)
 *  • New Proposal dialog: pick a template, set client name + email,
 *    optional title/amount, click Send
 *  • Per-row: copy sign URL, resend email, sync status, archive
 *  • View mock log (when BreezeDocs isn't configured)
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
  FileSignature,
  Plus,
  Search,
  RefreshCw,
  Send,
  Archive,
  Link as LinkIcon,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Eye,
  Clock,
} from "lucide-react";

const STATUS_META = {
  draft: { label: "Draft", cls: "bg-secondary text-foreground", Icon: Clock },
  sent: { label: "Sent", cls: "bg-blue-100 text-blue-900", Icon: Send },
  opened: { label: "Opened", cls: "bg-amber-100 text-amber-900", Icon: Eye },
  signed: { label: "Partially signed", cls: "bg-amber-100 text-amber-900", Icon: CheckCircle2 },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-900", Icon: CheckCircle2 },
  declined: { label: "Declined", cls: "bg-rose-100 text-rose-900", Icon: Archive },
  expired: { label: "Expired", cls: "bg-rose-100 text-rose-900", Icon: Archive },
};

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

function emptyForm() {
  return {
    template_id: "",
    client_email: "",
    client_name: "",
    title: "",
    amount: "",
    currency: "USD",
    send_now: true,
  };
}

export default function ProposalsAdmin() {
  const api = useAdminApi();
  const [proposals, setProposals] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [mockMode, setMockMode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, tmpl] = await Promise.allSettled([
        api.get("/admin/breezedocs/proposals"),
        api.get("/admin/breezedocs/templates"),
      ]);
      setProposals(pr.status === "fulfilled" && Array.isArray(pr.value.data) ? pr.value.data : []);
      if (tmpl.status === "fulfilled") {
        setTemplates(tmpl.value.data?.templates || []);
        setMockMode(Boolean(tmpl.value.data?.mock));
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load proposals");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return proposals.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (p.client_email || "").toLowerCase().includes(q) ||
        (p.client_name || "").toLowerCase().includes(q) ||
        (p.title || "").toLowerCase().includes(q)
      );
    });
  }, [proposals, query, statusFilter]);

  const stats = useMemo(() => {
    const total = proposals.length;
    const completed = proposals.filter((p) => p.status === "completed").length;
    const open = proposals.filter((p) => ["sent", "opened", "signed"].includes(p.status)).length;
    return { total, completed, open };
  }, [proposals]);

  const onCreate = async () => {
    if (!form.template_id || !form.client_email || !form.client_name) {
      toast.error("Template, client name, and email are required");
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post("/admin/breezedocs/proposals", {
        template_id: Number(form.template_id),
        client_email: form.client_email,
        client_name: form.client_name,
        title: form.title || null,
        amount: form.amount || null,
        currency: form.currency || "USD",
        send_now: !!form.send_now,
      });
      if (r.data?.send_attempted && !r.data?.send_succeeded) {
        toast.warning("Proposal created, but the send call failed — try Resend.");
      } else {
        toast.success(form.send_now ? "Proposal sent" : "Proposal created (draft)");
      }
      setForm(emptyForm());
      setCreateOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create proposal");
    } finally {
      setSubmitting(false);
    }
  };

  const onSync = async (p) => {
    setBusyId(p.id);
    try {
      await api.post(`/admin/breezedocs/proposals/${p.id}/sync`);
      toast.success("Status refreshed");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Sync failed");
    } finally {
      setBusyId(null);
    }
  };

  const onResend = async (p) => {
    setBusyId(p.id);
    try {
      await api.post(`/admin/breezedocs/proposals/${p.id}/resend`);
      toast.success("Email resent");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Resend failed");
    } finally {
      setBusyId(null);
    }
  };

  const onArchive = async (p) => {
    if (!window.confirm(`Archive proposal "${p.title}"? It stays in BreezeDoc.`)) return;
    setBusyId(p.id);
    try {
      await api.delete(`/admin/breezedocs/proposals/${p.id}`);
      toast.success("Archived");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Archive failed");
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (url) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Sign link copied");
    } catch {
      window.prompt("Copy sign link:", url);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-proposals-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">Proposals & contracts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Send branded proposals + contracts via BreezeDocs.{" "}
            {mockMode ? (
              <span className="text-amber-700 font-medium">Running in MOCK mode — paste your BreezeDoc API key in /admin/integrations to go live.</span>
            ) : (
              <span className="text-emerald-700 font-medium">LIVE — connected to BreezeDoc.</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} data-testid="admin-proposals-refresh">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)} data-testid="admin-proposals-new-btn">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Proposal
          </Button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="admin-proposals-stat-total">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total proposals</p>
            <p className="text-3xl font-bold mt-2">{stats.total}</p>
          </CardContent>
        </Card>
        <Card data-testid="admin-proposals-stat-open">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Awaiting signature</p>
            <p className="text-3xl font-bold mt-2 text-amber-600">{stats.open}</p>
          </CardContent>
        </Card>
        <Card data-testid="admin-proposals-stat-completed">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Completed</p>
            <p className="text-3xl font-bold mt-2 text-emerald-600">{stats.completed}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by client email, name, or title…"
            className="pl-9"
            data-testid="admin-proposals-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="admin-proposals-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-3">
            <FileSignature className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="font-medium">No proposals yet</p>
            <p className="text-sm text-muted-foreground">
              Click <strong>New Proposal</strong> to clone a BreezeDocs template and send it to a client.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="admin-proposals-list">
          {filtered.map((p) => {
            const meta = STATUS_META[p.status] || STATUS_META.draft;
            const StatusIcon = meta.Icon;
            return (
              <Card
                key={p.id}
                className="border-border"
                data-testid={`admin-proposal-${p.id}`}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.cls}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {meta.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Created {fmtDate(p.created_at)}
                        </span>
                        {p.completed_at && (
                          <span className="text-xs text-emerald-700">
                            · Signed {fmtDate(p.completed_at)}
                          </span>
                        )}
                      </div>
                      <p className="font-medium">{p.title || "Untitled"}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {p.client_name} · {p.client_email}
                      </p>
                    </div>
                    {p.amount && Number(p.amount) > 0 && (
                      <p className="text-lg font-semibold tabular-nums">
                        {p.currency || "USD"} {Number(p.amount).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end pt-3 border-t border-border">
                    {p.sign_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyLink(p.sign_url)}
                        data-testid={`admin-proposal-copy-${p.id}`}
                      >
                        <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                        Copy link
                      </Button>
                    )}
                    {p.sign_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(p.sign_url, "_blank", "noreferrer")}
                        data-testid={`admin-proposal-open-${p.id}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Open
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onResend(p)}
                      disabled={!p.sign_url || busyId === p.id}
                      data-testid={`admin-proposal-resend-${p.id}`}
                    >
                      {busyId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onSync(p)}
                      disabled={busyId === p.id}
                      data-testid={`admin-proposal-sync-${p.id}`}
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Sync
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onArchive(p)}
                      disabled={busyId === p.id}
                      data-testid={`admin-proposal-archive-${p.id}`}
                    >
                      <Archive className="h-3.5 w-3.5 mr-1.5" />
                      Archive
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[540px]" data-testid="admin-proposals-create-dialog">
          <DialogHeader>
            <DialogTitle>New proposal</DialogTitle>
            <DialogDescription>
              Pick a BreezeDocs template, then enter who you're sending it to. We'll create the document, send it,
              and email the client a branded link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="bd-template">Template</Label>
              <Select
                value={form.template_id}
                onValueChange={(v) => setForm({ ...form, template_id: v })}
              >
                <SelectTrigger id="bd-template" data-testid="admin-proposals-create-template">
                  <SelectValue placeholder="Choose a template…" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {templates.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No templates found
                    </SelectItem>
                  ) : (
                    templates.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.title || t.slug || `Template ${t.id}`}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="bd-client-name">Client name</Label>
                <Input
                  id="bd-client-name"
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                  placeholder="Acme Inc."
                  data-testid="admin-proposals-create-name"
                />
              </div>
              <div>
                <Label htmlFor="bd-client-email">Client email</Label>
                <Input
                  id="bd-client-email"
                  type="email"
                  value={form.client_email}
                  onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                  placeholder="client@example.com"
                  data-testid="admin-proposals-create-email"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="bd-title">Title (optional)</Label>
              <Input
                id="bd-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Express Launch — Acme Project"
                data-testid="admin-proposals-create-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="bd-amount">Amount (USD, optional)</Label>
                <Input
                  id="bd-amount"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="5995.00"
                  data-testid="admin-proposals-create-amount"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.send_now}
                    onChange={(e) => setForm({ ...form, send_now: e.target.checked })}
                    data-testid="admin-proposals-create-send-now"
                  />
                  <span>Send to client now</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={onCreate}
              disabled={submitting}
              data-testid="admin-proposals-create-submit"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Creating…
                </>
              ) : (
                <>{form.send_now ? "Create & send" : "Create draft"}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
