/**
 * MilestonesAdmin — view + edit project milestones synced from Nifty.
 * Shows sync history (last 100 Nifty events) for debugging.
 */
import { useState, useEffect, useCallback } from "react";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Circle,
  Loader2,
  Save,
  History,
  AlertOctagon,
  ExternalLink,
} from "lucide-react";

const STATUS_META = {
  pending: { label: "Pending", icon: Circle, cls: "bg-zinc-100 text-zinc-700" },
  in_progress: { label: "In Progress", icon: PlayCircle, cls: "bg-amber-100 text-amber-800" },
  complete: { label: "Complete", icon: CheckCircle2, cls: "bg-green-100 text-green-800" },
  blocked: { label: "On Hold", icon: PauseCircle, cls: "bg-red-100 text-red-800" },
};

function emptyMilestone() {
  return {
    client_email: "",
    project_name: "",
    title: "",
    description: "",
    is_final_deliverable: false,
    notify_client_on_complete: false,
    nifty_task_id: "",
    status: "pending",
  };
}

export default function MilestonesAdmin() {
  const api = useAdminApi();
  const [milestones, setMilestones] = useState([]);
  const [history, setHistory] = useState([]);
  const [blockers, setBlockers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, hRes, bRes] = await Promise.allSettled([
        api.get("/admin/milestones"),
        api.get("/admin/milestones/sync-history"),
        api.get("/admin/milestones/blockers"),
      ]);
      setMilestones(mRes.status === "fulfilled" ? mRes.value.data : []);
      setHistory(hRes.status === "fulfilled" ? hRes.value.data : []);
      setBlockers(bRes.status === "fulfilled" ? bRes.value.data : []);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onSave = async (form) => {
    try {
      if (form.id) {
        await api.patch(`/admin/milestones/${form.id}`, form);
        toast.success("Milestone updated");
      } else {
        await api.post("/admin/milestones", form);
        toast.success("Milestone created");
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this milestone?")) return;
    try {
      await api.delete(`/admin/milestones/${id}`);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-milestones-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Milestones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Client-facing project deliverables synced from Nifty PM via webhook + poll.
            {milestones.length} milestones · {history.length} sync events logged.
          </p>
        </div>
        <Button
          onClick={() => setEditing(emptyMilestone())}
          className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
          data-testid="milestones-new-button"
        >
          <Plus className="h-4 w-4 mr-2" />
          New milestone
        </Button>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList>
          <TabsTrigger value="active" data-testid="milestones-tab-active">Active</TabsTrigger>
          <TabsTrigger value="blockers" data-testid="milestones-tab-blockers">
            <AlertOctagon className="h-3.5 w-3.5 mr-1.5" />
            Blockers
            {blockers.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-rose-600 text-white">
                {blockers.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="milestones-tab-history">
            <History className="h-3.5 w-3.5 mr-1.5" />
            Sync history
          </TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-5 space-y-3">
          {loading ? (
            <Card className="border-border"><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
          ) : milestones.length === 0 ? (
            <Card className="border-border">
              <CardContent className="py-12 text-center" data-testid="milestones-empty">
                <p className="font-display text-base font-medium">No milestones yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create one manually, or wait for Nifty webhooks to populate them.
                </p>
              </CardContent>
            </Card>
          ) : (
            milestones.map((m) => {
              const meta = STATUS_META[m.status] || STATUS_META.pending;
              const StatusIcon = meta.icon;
              return (
                <Card key={m.id} className="border-border" data-testid={`milestone-row-${m.id}`}>
                  <CardContent className="p-4 sm:p-5 flex flex-wrap items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                          <StatusIcon className="h-3 w-3" />
                          {meta.label}
                        </span>
                        {m.is_final_deliverable && (
                          <Badge variant="outline" className="text-[10px]">Final</Badge>
                        )}
                      </div>
                      <p className="mt-1.5 font-display text-base font-medium truncate">{m.title}</p>
                      <p className="text-xs text-muted-foreground break-anywhere">
                        {m.client_email} · {m.project_name || "—"}
                      </p>
                      {m.blocked_reason && (
                        <p className="mt-1 text-xs text-red-600">Reason: {m.blocked_reason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(m)}
                        data-testid={`milestone-edit-${m.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(m.id)}
                        data-testid={`milestone-delete-${m.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
        <TabsContent value="blockers" className="mt-5 space-y-3">
          {blockers.length === 0 ? (
            <Card className="border-border">
              <CardContent className="py-12 text-center" data-testid="blockers-empty">
                <p className="font-display text-base font-medium">No blockers detected</p>
                <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                  Auto-detected from Nifty task comments starting with{" "}
                  <code className="text-[11px] bg-secondary px-1 rounded">blocker:</code>,{" "}
                  <code className="text-[11px] bg-secondary px-1 rounded">waiting on:</code> or{" "}
                  <code className="text-[11px] bg-secondary px-1 rounded">blocked by:</code>.
                  Each match pings Slack so the unblocker acts fast.
                </p>
              </CardContent>
            </Card>
          ) : (
            blockers.map((b) => (
              <Card
                key={b.id}
                className="border-rose-200"
                data-testid={`blocker-row-${b.id}`}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start gap-3 flex-wrap">
                    <AlertOctagon className="h-5 w-5 text-rose-600 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-rose-100 text-rose-900 border-0 text-[10px] capitalize">
                          {b.kind}
                        </Badge>
                        {b.slack_ok ? (
                          <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">
                            Slack ✓
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                            Slack: {b.slack_reason || "skipped"}
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {b.created_at && new Date(b.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1.5 font-display text-base font-medium">
                        {b.task_title || "(untitled task)"}
                      </p>
                      <p className="mt-1 text-sm whitespace-pre-wrap">{b.body}</p>
                      {Array.isArray(b.mentions) && b.mentions.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Tagged: {b.mentions.map((m) => `@${m}`).join(", ")}
                        </p>
                      )}
                      {b.client_email && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Client: {b.client_email}
                        </p>
                      )}
                      {b.task_url && (
                        <a
                          href={b.task_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center text-xs text-[#1E3A8A] hover:underline"
                          data-testid={`blocker-open-nifty-${b.id}`}
                        >
                          Open in Nifty
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
        <TabsContent value="history" className="mt-5">
          {history.length === 0 ? (
            <Card className="border-border">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No sync events yet.
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border">
              <CardContent className="p-0 divide-y divide-border">
                {history.map((h, i) => (
                  <div key={i} className="p-3 sm:p-4 text-xs" data-testid={`sync-history-row-${i}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{h.kind || "event"}</Badge>
                        <span className={h.outcome === "updated" ? "text-green-700" : "text-muted-foreground"}>
                          {h.outcome}
                        </span>
                      </div>
                      <span className="text-muted-foreground">
                        {h.at && new Date(h.at).toLocaleString()}
                      </span>
                    </div>
                    <pre className="mt-2 text-[11px] bg-secondary rounded p-2 overflow-x-auto whitespace-pre-wrap break-anywhere">
                      {JSON.stringify(h.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <EditDialog
        milestone={editing}
        onClose={() => setEditing(null)}
        onSave={onSave}
      />
    </div>
  );
}

function EditDialog({ milestone, onClose, onSave }) {
  const isOpen = !!milestone;
  const isNew = milestone && !milestone.id;
  const [form, setForm] = useState(milestone || emptyMilestone());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(milestone || emptyMilestone());
  }, [milestone]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim() || !form.client_email.trim()) {
      toast.error("Title and client email are required");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="milestone-edit-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {isNew ? "New milestone" : "Edit milestone"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                data-testid="milestone-edit-title"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="mt-1.5" data-testid="milestone-edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="blocked">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Client email</Label>
            <Input
              type="email"
              value={form.client_email}
              onChange={(e) => set("client_email", e.target.value)}
              data-testid="milestone-edit-client-email"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Project name</Label>
            <Input
              value={form.project_name || ""}
              onChange={(e) => set("project_name", e.target.value)}
              data-testid="milestone-edit-project"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description || ""}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              data-testid="milestone-edit-description"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Nifty task ID (for sync matching)</Label>
            <Input
              value={form.nifty_task_id || ""}
              onChange={(e) => set("nifty_task_id", e.target.value)}
              placeholder="auto-set if synced via webhook"
              data-testid="milestone-edit-nifty-id"
              className="mt-1.5"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={!!form.is_final_deliverable}
              onCheckedChange={(v) => set("is_final_deliverable", v)}
              data-testid="milestone-edit-final-switch"
            />
            <Label>Final deliverable (triggers celebration)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={!!form.notify_client_on_complete}
              onCheckedChange={(v) => set("notify_client_on_complete", v)}
              data-testid="milestone-edit-notify-switch"
            />
            <Label>Email client when complete</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="milestone-edit-save"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
