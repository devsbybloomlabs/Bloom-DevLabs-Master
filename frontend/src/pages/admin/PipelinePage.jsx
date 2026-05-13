/**
 * PipelinePage — Phase G — Breakcold-style CRM Kanban.
 *
 * Replaces the legacy table view with a 6-column board: New → Contacted →
 * Qualified → Proposal → Won → Lost. Cards are LinkedIn-rich: avatar
 * (initials), name, company, deal value, next action chip, last-activity
 * pill, and an "AI suggest" button that drops a one-line next action.
 *
 * Click a card → side drawer with full prospect record, activity stream,
 * "log a touch" composer (note / call / email / DM / meeting), edit form,
 * and the Send Quotation CTA.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authClient, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  TrendingUp,
  Sparkles,
  FileSignature,
  Linkedin,
  Mail,
  Phone,
  MessageSquare,
  CalendarClock,
  Briefcase,
  Pencil,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import SendQuotationDialog from "@/components/admin/SendQuotationDialog";

const STAGES = [
  { id: "new", label: "New", accent: "bg-slate-400" },
  { id: "contacted", label: "Contacted", accent: "bg-blue-500" },
  { id: "qualified", label: "Qualified", accent: "bg-amber-500" },
  { id: "proposal", label: "Proposal", accent: "bg-violet-500" },
  { id: "won", label: "Won", accent: "bg-emerald-500" },
  { id: "lost", label: "Lost", accent: "bg-rose-500" },
];

const ACTIVITY_TYPES = [
  { id: "note", label: "Note", icon: MessageSquare },
  { id: "call", label: "Call", icon: Phone },
  { id: "email", label: "Email", icon: Mail },
  { id: "linkedin_dm", label: "LinkedIn DM", icon: Linkedin },
  { id: "meeting", label: "Meeting", icon: CalendarClock },
];

const BLANK_PROSPECT = {
  name: "",
  company: "",
  email: "",
  linkedin: "",
  industry: "",
  source: "manual",
  status: "new",
  notes: "",
  deal_value: "",
  next_action: "",
};

function fmtMoney(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return `$${n.toLocaleString()}`;
}

function relativeTime(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d`;
  return `${Math.floor(diff / (86400 * 30))}mo`;
}

function initialsFor(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function StatTile({ label, value, sub }) {
  return (
    <Card className="border-border">
      <CardContent className="p-3.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="font-display text-xl font-semibold tabular-nums mt-0.5">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ProspectCard({ prospect, onOpen, onDragStart }) {
  const value = fmtMoney(prospect.deal_value);
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => onDragStart(e, prospect)}
      onClick={() => onOpen(prospect)}
      className="w-full text-left rounded-lg border border-border bg-background p-3 hover:shadow-md hover:border-primary/40 transition-all cursor-grab active:cursor-grabbing"
      data-testid={`pipeline-card-${prospect.id}`}
    >
      <div className="flex items-start gap-2.5 mb-2">
        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">
          {initialsFor(prospect.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug truncate">{prospect.name}</p>
          {prospect.company && (
            <p className="text-[11px] text-muted-foreground truncate inline-flex items-center gap-1">
              <Briefcase className="h-2.5 w-2.5" />
              {prospect.company}
            </p>
          )}
        </div>
        {value && (
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 tabular-nums shrink-0">
            {value}
          </span>
        )}
      </div>
      {prospect.next_action && (
        <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-2 py-1 line-clamp-2 mb-1.5 inline-flex items-start gap-1">
          <ArrowRight className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{prospect.next_action}</span>
        </p>
      )}
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {prospect.linkedin && <Linkedin className="h-2.5 w-2.5" />}
          {prospect.email && <Mail className="h-2.5 w-2.5" />}
          {prospect.industry && <span>{prospect.industry}</span>}
        </span>
        <span className="tabular-nums">
          {relativeTime(prospect.last_activity_at || prospect.updated_at)}
        </span>
      </div>
    </button>
  );
}

function Column({ stage, prospects, allStages, onCardOpen, onDragStart, onDropTo, onQuickMove }) {
  const [over, setOver] = useState(false);
  return (
    <div className="flex flex-col w-72 shrink-0" data-testid={`pipeline-col-${stage.id}`}>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 rounded-full ${stage.accent}`} />
          <p className="text-xs font-medium uppercase tracking-wider truncate">{stage.label}</p>
          <span className="text-xs text-muted-foreground tabular-nums">{prospects.length}</span>
        </div>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!over) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onDropTo(stage.id, e);
        }}
        className={`flex flex-col gap-2 rounded-xl p-2 min-h-[260px] transition-colors ${
          over ? "bg-primary/10 ring-2 ring-primary/30" : "bg-secondary/30"
        }`}
        data-testid={`pipeline-drop-${stage.id}`}
      >
        {prospects.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8 italic">
            Drop a card here
          </p>
        ) : (
          prospects.map((p) => (
            <div key={p.id} className="group relative">
              <ProspectCard
                prospect={p}
                onOpen={onCardOpen}
                onDragStart={onDragStart}
              />
              {/* Quick-move menu — keyboard-accessible & testable alternative to drag-drop */}
              <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <details className="relative">
                  <summary
                    className="list-none cursor-pointer rounded-md bg-background/95 border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`pipeline-card-move-${p.id}`}
                    aria-label="Move card"
                  >
                    Move
                  </summary>
                  <div
                    className="absolute right-0 top-full mt-1 z-20 rounded-md border border-border bg-background shadow-lg p-1 w-32"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {allStages
                      .filter((s) => s.id !== p.status)
                      .map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onQuickMove?.(p, s.id);
                          }}
                          className="w-full text-left text-xs px-2 py-1 rounded hover:bg-secondary/60 inline-flex items-center gap-1.5"
                          data-testid={`pipeline-card-move-${p.id}-to-${s.id}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${s.accent}`} />
                          {s.label}
                        </button>
                      ))}
                  </div>
                </details>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ActivityIcon({ type }) {
  const t = ACTIVITY_TYPES.find((x) => x.id === type) || ACTIVITY_TYPES[0];
  const Icon = t.icon;
  return <Icon className="h-3 w-3 text-muted-foreground" />;
}

function ProspectDrawer({ prospect, onClose, api, onChanged, onQuoteRequested }) {
  const open = Boolean(prospect);
  const [activity, setActivity] = useState([]);
  const [composer, setComposer] = useState("");
  const [composerType, setComposerType] = useState("note");
  const [edit, setEdit] = useState(BLANK_PROSPECT);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState(null);

  useEffect(() => {
    if (!prospect) {
      setActivity([]);
      setAiText(null);
      setComposer("");
      return;
    }
    setEdit({
      name: prospect.name || "",
      company: prospect.company || "",
      email: prospect.email || "",
      linkedin: prospect.linkedin || "",
      industry: prospect.industry || "",
      source: prospect.source || "manual",
      status: prospect.status || "new",
      notes: prospect.notes || "",
      deal_value: prospect.deal_value ?? "",
      next_action: prospect.next_action || "",
    });
    (async () => {
      try {
        const r = await api.get(`/pipeline/prospects/${prospect.id}/activity`);
        setActivity(r.data || []);
      } catch {
        setActivity([]);
      }
    })();
  }, [prospect, api]);

  if (!prospect) return null;

  const postActivity = async () => {
    if (!composer.trim()) return;
    try {
      const r = await api.post(`/pipeline/prospects/${prospect.id}/activity`, {
        body: composer.trim(),
        type: composerType,
      });
      setActivity([r.data, ...activity]);
      setComposer("");
      toast.success("Logged");
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't log activity");
    }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const payload = { ...edit };
      payload.deal_value =
        payload.deal_value === "" || payload.deal_value == null
          ? null
          : Number(payload.deal_value);
      ["email", "linkedin", "industry", "notes", "next_action", "company"].forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      await api.patch(`/pipeline/prospects/${prospect.id}`, payload);
      toast.success("Saved");
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${prospect.name}? This is permanent.`)) return;
    try {
      await api.delete(`/pipeline/prospects/${prospect.id}`);
      toast.success("Deleted");
      onChanged?.();
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  const getAi = async () => {
    setAiBusy(true);
    try {
      const r = await api.get(`/pipeline/prospects/${prospect.id}/ai-suggestion`);
      setAiText(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "AI suggest failed");
    } finally {
      setAiBusy(false);
    }
  };

  const applyAi = async () => {
    if (!aiText?.action) return;
    try {
      await api.patch(`/pipeline/prospects/${prospect.id}`, {
        next_action: aiText.action,
      });
      toast.success("Next action saved");
      setEdit({ ...edit, next_action: aiText.action });
      onChanged?.();
    } catch (e) {
      toast.error("Couldn't save");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose?.()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
        data-testid="pipeline-drawer"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3 font-display">
            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
              {initialsFor(prospect.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate">{prospect.name}</p>
              {prospect.company && (
                <p className="text-xs font-normal text-muted-foreground truncate">
                  {prospect.company}
                </p>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-4">
          {/* AI suggestion */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-blue-50">
            <CardContent className="p-3.5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] uppercase tracking-wider font-semibold inline-flex items-center gap-1.5 text-primary">
                  <Sparkles className="h-3 w-3" />
                  AI next action
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={getAi}
                  disabled={aiBusy}
                  data-testid="pipeline-ai-suggest"
                  className="h-7 px-2 text-xs"
                >
                  {aiBusy ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3 mr-1" />
                  )}
                  Suggest
                </Button>
              </div>
              {aiText ? (
                <>
                  <p className="text-sm leading-snug">{aiText.action}</p>
                  <Button
                    size="sm"
                    onClick={applyAi}
                    className="mt-2 h-7 px-2 text-xs"
                    data-testid="pipeline-ai-apply"
                  >
                    Save as next action
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Click Suggest for an AI-generated next move based on this prospect's
                  stage + recent activity.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Activity composer */}
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
              Log a touch
            </p>
            <div className="flex gap-1 mb-2 flex-wrap">
              {ACTIVITY_TYPES.map((t) => {
                const Icon = t.icon;
                const active = t.id === composerType;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setComposerType(t.id)}
                    className={`text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md border transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary/50"
                    }`}
                    data-testid={`pipeline-activity-type-${t.id}`}
                  >
                    <Icon className="h-3 w-3" />
                    {t.label}
                  </button>
                );
              })}
            </div>
            <Textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              rows={2}
              placeholder="What happened? (e.g. 'Followed up on LinkedIn, they replied within 5 mins')"
              data-testid="pipeline-activity-input"
            />
            <div className="flex justify-end mt-1.5">
              <Button
                size="sm"
                onClick={postActivity}
                disabled={!composer.trim()}
                data-testid="pipeline-activity-submit"
              >
                Log it
              </Button>
            </div>
          </div>

          {/* Activity stream */}
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
              Activity stream
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto" data-testid="pipeline-activity-list">
              {activity.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No touches yet — start above.</p>
              ) : (
                activity.map((a) => (
                  <div
                    key={a.id}
                    className="text-xs rounded-md border border-border bg-secondary/30 p-2"
                    data-testid={`pipeline-activity-item-${a.id}`}
                  >
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5 text-[10px]">
                      <ActivityIcon type={a.type} />
                      <span className="uppercase tracking-wider">{a.type}</span>
                      <span className="ml-auto tabular-nums">
                        {a.created_at
                          ? new Date(a.created_at).toLocaleString()
                          : ""}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-foreground/90">
                      {a.body || `Moved ${a.from || "—"} → ${a.to}`}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Edit details */}
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 inline-flex items-center gap-1">
              <Pencil className="h-3 w-3" /> Details
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                placeholder="Name"
              />
              <Input
                value={edit.company}
                onChange={(e) => setEdit({ ...edit, company: e.target.value })}
                placeholder="Company"
              />
              <Input
                value={edit.email}
                type="email"
                onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                placeholder="Email"
              />
              <Input
                value={edit.linkedin}
                onChange={(e) => setEdit({ ...edit, linkedin: e.target.value })}
                placeholder="LinkedIn URL"
              />
              <Input
                value={edit.industry}
                onChange={(e) => setEdit({ ...edit, industry: e.target.value })}
                placeholder="Industry"
              />
              <Input
                value={edit.deal_value}
                type="number"
                onChange={(e) => setEdit({ ...edit, deal_value: e.target.value })}
                placeholder="Deal value"
              />
              <Select
                value={edit.status}
                onValueChange={(v) => setEdit({ ...edit, status: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={edit.source}
                onChange={(e) => setEdit({ ...edit, source: e.target.value })}
                placeholder="Source"
              />
            </div>
            <Textarea
              value={edit.next_action}
              onChange={(e) => setEdit({ ...edit, next_action: e.target.value })}
              rows={2}
              placeholder="Next action"
              className="mt-2"
            />
            <Textarea
              value={edit.notes}
              onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
              rows={3}
              placeholder="Internal notes"
              className="mt-2"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
            <Button onClick={saveEdit} disabled={saving} data-testid="pipeline-save">
              {saving ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : null}
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onQuoteRequested?.(prospect)}
              data-testid="pipeline-send-quote"
            >
              <FileSignature className="h-3.5 w-3.5 mr-1.5" />
              Send quote
            </Button>
            <Button variant="ghost" size="sm" onClick={remove} className="ml-auto text-rose-600" data-testid="pipeline-delete">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NewProspectDialog({ open, onOpenChange, api, onCreated, defaultStatus }) {
  const [form, setForm] = useState(BLANK_PROSPECT);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm({ ...BLANK_PROSPECT, status: defaultStatus || "new" });
  }, [open, defaultStatus]);

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    try {
      const payload = { ...form };
      payload.deal_value = payload.deal_value === "" ? null : Number(payload.deal_value);
      ["email", "linkedin", "industry", "notes", "next_action", "company"].forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      const r = await api.post("/pipeline/prospects", payload);
      toast.success("Added");
      onCreated?.(r.data);
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="pipeline-new-prospect-dialog">
        <DialogHeader>
          <DialogTitle>New prospect</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name *"
            data-testid="pipeline-new-name"
          />
          <Input
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            placeholder="Company"
          />
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email"
          />
          <Input
            value={form.linkedin}
            onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
            placeholder="LinkedIn URL"
          />
          <Input
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
            placeholder="Industry"
          />
          <Input
            type="number"
            value={form.deal_value}
            onChange={(e) => setForm({ ...form, deal_value: e.target.value })}
            placeholder="Deal value"
          />
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            placeholder="Source"
          />
        </div>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={3}
          placeholder="Notes"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy} data-testid="pipeline-new-submit">
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Add prospect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PipelinePage() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [searchParams, setSearchParams] = useSearchParams();

  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openProspect, setOpenProspect] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [quoteFor, setQuoteFor] = useState(null);
  const dragRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/pipeline/board");
      setBoard(r.data);
    } catch (e) {
      toast.error("Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    document.title = "Pipeline — Bloom Labs";
    load();
  }, [load]);

  // Auto-open a prospect drawer when ?focus={id} is present (deep-link from
  // the dashboard's "Today's coaching" card).
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus || !board) return;
    for (const stage of Object.keys(board.columns || {})) {
      const hit = (board.columns[stage] || []).find((p) => p.id === focus);
      if (hit) {
        setOpenProspect(hit);
        const next = new URLSearchParams(searchParams);
        next.delete("focus");
        setSearchParams(next, { replace: true });
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, searchParams]);

  const totals = board?.totals || { prospects: 0, closed_revenue: 0, open_value: 0 };

  const onDragStart = (e, prospect) => {
    dragRef.current = prospect;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", prospect.id);
  };

  const onDropTo = async (toStage) => {
    const prospect = dragRef.current;
    dragRef.current = null;
    if (!prospect || prospect.status === toStage) return;
    // Optimistic update
    setBoard((prev) => {
      if (!prev) return prev;
      const cols = { ...prev.columns };
      cols[prospect.status] = (cols[prospect.status] || []).filter((p) => p.id !== prospect.id);
      cols[toStage] = [{ ...prospect, status: toStage }, ...(cols[toStage] || [])];
      return { ...prev, columns: cols };
    });
    try {
      await api.post(`/pipeline/prospects/${prospect.id}/move`, { status: toStage });
      toast.success(`Moved to ${STAGES.find((s) => s.id === toStage)?.label}`);
      load();
    } catch (e) {
      toast.error("Move failed");
      load();
    }
  };

  const onQuickMove = async (prospect, toStage) => {
    if (!prospect || prospect.status === toStage) return;
    setBoard((prev) => {
      if (!prev) return prev;
      const cols = { ...prev.columns };
      cols[prospect.status] = (cols[prospect.status] || []).filter((p) => p.id !== prospect.id);
      cols[toStage] = [{ ...prospect, status: toStage }, ...(cols[toStage] || [])];
      return { ...prev, columns: cols };
    });
    try {
      await api.post(`/pipeline/prospects/${prospect.id}/move`, { status: toStage });
      toast.success(`Moved to ${STAGES.find((s) => s.id === toStage)?.label}`);
      load();
    } catch (e) {
      toast.error("Move failed");
      load();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
        Loading pipeline…
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="pipeline-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Pipeline</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight inline-flex items-center gap-2 mt-0.5">
            <TrendingUp className="h-6 w-6 text-primary" />
            Sales Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Drag cards between stages. Click a card to log a touch, edit, or ask AI for the next move.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)} data-testid="pipeline-new-prospect-btn">
          <Plus className="h-4 w-4 mr-1.5" />
          New prospect
        </Button>
      </div>

      {/* Stat bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Prospects" value={totals.prospects} />
        <StatTile
          label="Open value"
          value={fmtMoney(totals.open_value) || "$0"}
          sub="Excludes won + lost"
        />
        <StatTile
          label="Closed revenue"
          value={fmtMoney(totals.closed_revenue) || "$0"}
        />
        <StatTile
          label="Win rate"
          value={`${
            totals.prospects === 0
              ? 0
              : Math.round(((board?.columns?.won?.length || 0) / totals.prospects) * 100)
          }%`}
          sub={`${board?.columns?.won?.length || 0} won · ${board?.columns?.lost?.length || 0} lost`}
        />
      </div>

      {/* Kanban */}
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2" data-testid="pipeline-kanban">
        {STAGES.map((s) => (
          <Column
            key={s.id}
            stage={s}
            allStages={STAGES}
            prospects={board?.columns?.[s.id] || []}
            onCardOpen={setOpenProspect}
            onDragStart={onDragStart}
            onDropTo={onDropTo}
            onQuickMove={onQuickMove}
          />
        ))}
      </div>

      <NewProspectDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        api={api}
        onCreated={load}
      />
      <ProspectDrawer
        prospect={openProspect}
        api={api}
        onClose={() => setOpenProspect(null)}
        onChanged={load}
        onQuoteRequested={(p) => {
          setOpenProspect(null);
          setQuoteFor(p);
        }}
      />
      <SendQuotationDialog
        open={Boolean(quoteFor)}
        prospect={quoteFor}
        onOpenChange={(v) => !v && setQuoteFor(null)}
        onDone={load}
      />
    </div>
  );
}
