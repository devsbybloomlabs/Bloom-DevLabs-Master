/**
 * SupportTriageAdmin — Phase I ticket lookup.
 *
 * Single-page search + triage tool. Type a ticket ref like BL-2026-0042
 * (or an email, or words in the subject) and instantly see the matching
 * portal-contact tickets. Mark resolved inline.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LifeBuoy,
  Search,
  Loader2,
  CheckCircle2,
  Mail,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_TONE = {
  open: "bg-amber-100 text-amber-800 border-amber-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const PRIORITY_TONE = {
  low: "text-slate-500",
  medium: "text-blue-600",
  high: "text-rose-600",
};

function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function TicketRow({ ticket, onResolved }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const api = useAdminApi();
  const tone = STATUS_TONE[ticket.status] || STATUS_TONE.open;
  const ptone = PRIORITY_TONE[ticket.priority] || PRIORITY_TONE.medium;

  const resolve = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/portal-contacts/${ticket.id}/resolve`);
      toast.success("Marked resolved");
      onResolved?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-border" data-testid={`ticket-row-${ticket.id}`}>
      <CardContent className="p-3.5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-mono text-xs font-semibold bg-secondary/60 px-2 py-0.5 rounded">
                {ticket.ticket_ref || "—"}
              </span>
              <Badge className={tone} variant="outline">
                {(ticket.status || "open").replace("_", " ")}
              </Badge>
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${ptone}`}>
                {ticket.priority || "medium"}
              </span>
            </div>
            <p className="text-sm font-medium leading-snug truncate">{ticket.subject}</p>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {ticket.client_email}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {fmtDateTime(ticket.created_at)}
              </span>
              {ticket.attachment && (
                <span className="text-blue-600">📎 {ticket.attachment.original_name}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpen(!open)}
              className="h-7 px-2 text-xs"
              data-testid={`ticket-row-${ticket.id}-toggle`}
            >
              {open ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
            {ticket.status !== "resolved" && (
              <Button
                size="sm"
                onClick={resolve}
                disabled={busy}
                className="h-7 px-2 text-xs"
                data-testid={`ticket-row-${ticket.id}-resolve`}
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                )}
                Resolve
              </Button>
            )}
          </div>
        </div>
        {open && (
          <div className="mt-2 pt-2 border-t border-border" data-testid={`ticket-row-${ticket.id}-body`}>
            <p className="text-sm whitespace-pre-wrap text-foreground/90">{ticket.body}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SupportTriageAdmin() {
  const api = useAdminApi();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const r = await api.get(`/admin/portal-contacts?${params.toString()}`);
      setRows(r.data || []);
    } catch (e) {
      toast.error("Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [api, q, status]);

  useEffect(() => {
    document.title = "Support Triage — Bloom Labs";
    load();
  }, [load]);

  // Debounce: re-search 350ms after typing stops.
  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const tallies = useMemo(() => {
    const out = { open: 0, in_progress: 0, resolved: 0 };
    for (const r of rows) {
      const s = r.status || "open";
      if (out[s] != null) out[s] += 1;
    }
    return out;
  }, [rows]);

  return (
    <div className="space-y-6" data-testid="support-triage-admin">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Support</p>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight inline-flex items-center gap-2 mt-0.5">
          <LifeBuoy className="h-6 w-6 text-primary" />
          Support Triage
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search any portal contact by ticket ref (<code className="text-xs">BL-2026-####</code>),
          email, or keyword. Resolve inline.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="BL-2026-0042, joe@acme.co, 'login broken'…"
            className="pl-9"
            data-testid="support-triage-search"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" data-testid="support-triage-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-3" data-testid="support-triage-tallies">
        <Tally label="Open" value={tallies.open} tone="text-amber-700" />
        <Tally label="In progress" value={tallies.in_progress} tone="text-blue-700" />
        <Tally label="Resolved" value={tallies.resolved} tone="text-emerald-700" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Searching…
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="font-display text-base font-medium">No tickets match</p>
            <p className="text-sm text-muted-foreground mt-1">
              Try a partial ticket ref or email.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="support-triage-results">
          {rows.map((r) => (
            <TicketRow key={r.id} ticket={r} onResolved={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function Tally({ label, value, tone }) {
  return (
    <Card className="border-border">
      <CardContent className="p-3 text-center">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`font-display text-xl font-semibold tabular-nums mt-0.5 ${tone}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
