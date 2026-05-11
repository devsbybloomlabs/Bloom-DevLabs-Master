/**
 * Admin · Approval Studio
 *
 * Designer-facing page that:
 *   • Lists all design approvals (status, version, links)
 *   • Lets a designer push a new design version (Figma URL → Approval Studio)
 *   • Auto-creates a Nifty comment + "In Review" status (when Nifty connected)
 *   • Optionally ties an approval to a client portal milestone
 *
 * Approval Studio runs in MOCK mode until `APPROVAL_STUDIO_USERNAME/PASSWORD`
 * are set in backend `.env`. Mock activity is visible via "View mock log" below.
 */
import { useEffect, useMemo, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ImagePlus,
  Upload,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  History,
  XCircle,
} from "lucide-react";

const STATUS_META = {
  in_review: { label: "In review", color: "bg-blue-100 text-blue-900", Icon: Clock },
  revision: { label: "Revision", color: "bg-amber-100 text-amber-900", Icon: AlertCircle },
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-900", Icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-rose-100 text-rose-900", Icon: XCircle },
};

export default function ApprovalsAdmin() {
  const api = useAdminApi();
  const [approvals, setApprovals] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [mockLogOpen, setMockLogOpen] = useState(false);
  const [mockLog, setMockLog] = useState({ mode: "mock", entries: [] });
  const [resolving, setResolving] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, m] = await Promise.allSettled([
        api.get("/admin/approvals"),
        api.get("/admin/milestones"),
      ]);
      setApprovals(a.status === "fulfilled" ? a.value.data : []);
      setMilestones(m.status === "fulfilled" ? m.value.data : []);
    } catch {
      toast.error("Could not load approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c = { in_review: 0, revision: 0, approved: 0, rejected: 0 };
    approvals.forEach((a) => {
      if (c[a.status] !== undefined) c[a.status] += 1;
    });
    return c;
  }, [approvals]);

  const onViewMockLog = async () => {
    try {
      const r = await api.get("/admin/approvals/mock-log");
      setMockLog(r.data);
      setMockLogOpen(true);
    } catch {
      toast.error("Could not fetch mock log");
    }
  };

  const onResolve = async (approval) => {
    if (!window.confirm(`Mark "${approval.asset_name}" as approved? This will close the linked Nifty task and milestone.`)) {
      return;
    }
    setResolving(approval.id);
    try {
      await api.post(`/admin/approvals/${approval.id}/resolve`);
      toast.success("Approval marked complete");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Resolve failed");
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-approvals-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <ImagePlus className="h-6 w-6 text-[#1E3A8A]" />
            Approval Studio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Push design versions to Approval Studio. Comments + status changes
            sync to the linked Nifty task and client portal milestone.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            data-testid="admin-approvals-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onViewMockLog}
            data-testid="admin-approvals-mock-log-button"
          >
            <History className="h-4 w-4 mr-2" />
            View mock log
          </Button>
          <Button
            size="sm"
            onClick={() => setUploadOpen(true)}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="admin-approvals-upload-button"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload design
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="In review" value={counts.in_review} color="text-blue-600" Icon={Clock} />
        <StatTile label="Revision" value={counts.revision} color="text-amber-600" Icon={AlertCircle} />
        <StatTile label="Approved" value={counts.approved} color="text-emerald-600" Icon={CheckCircle2} />
        <StatTile label="Rejected" value={counts.rejected} color="text-rose-600" Icon={XCircle} />
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-lg">All approvals</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : approvals.length === 0 ? (
            <div
              className="py-12 text-center text-sm text-muted-foreground"
              data-testid="admin-approvals-empty"
            >
              No design approvals yet. Click <em>Upload design</em> to start a review.
            </div>
          ) : (
            <div className="space-y-2">
              {approvals.map((a) => {
                const meta = STATUS_META[a.status] || STATUS_META.in_review;
                const Icon = meta.Icon;
                return (
                  <div
                    key={a.id}
                    className="rounded-xl border border-border p-4 hover:bg-secondary/30 transition-colors"
                    data-testid={`admin-approval-row-${a.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-display text-sm font-semibold">
                            {a.asset_name}
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            v{a.version}
                          </Badge>
                          <Badge className={`border-0 ${meta.color}`}>
                            <Icon className="h-3 w-3 mr-1" />
                            {meta.label}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {a.project_name} · {a.client_email}
                          {a.designer_email && ` · Designer: ${a.designer_email}`}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                          {a.design_url && (
                            <a
                              href={a.design_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#1E3A8A] hover:text-[#3B82F6] inline-flex items-center gap-1"
                            >
                              Source design
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {a.review_url && (
                            <a
                              href={a.review_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#1E3A8A] hover:text-[#3B82F6] inline-flex items-center gap-1"
                              data-testid={`admin-approval-review-link-${a.id}`}
                            >
                              Approval Studio
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {a.nifty_task_id && (
                            <span className="text-muted-foreground">
                              Nifty: <code className="font-mono">{a.nifty_task_id.slice(0, 10)}…</code>
                            </span>
                          )}
                        </div>
                      </div>
                      {a.status !== "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onResolve(a)}
                          disabled={resolving === a.id}
                          data-testid={`admin-approval-resolve-${a.id}`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                          Mark approved
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

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        milestones={milestones}
        onUploaded={() => {
          setUploadOpen(false);
          load();
        }}
      />

      <Dialog open={mockLogOpen} onOpenChange={setMockLogOpen}>
        <DialogContent className="max-w-2xl" data-testid="admin-approvals-mock-log-dialog">
          <DialogHeader>
            <DialogTitle>Approval Studio activity log</DialogTitle>
            <DialogDescription>
              Mode: <code className="font-mono">{mockLog.mode}</code>
              {mockLog.mode === "mock" &&
                " · Set APPROVAL_STUDIO_USERNAME/PASSWORD in backend .env to go live."}
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

function StatTile({ label, value, color, Icon }) {
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div className="font-display text-2xl font-semibold mt-2 tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function UploadDialog({ open, onClose, milestones, onUploaded }) {
  const api = useAdminApi();
  const [form, setForm] = useState({
    client_email: "",
    project_name: "",
    asset_name: "",
    design_url: "",
    designer_email: "",
    nifty_task_id: "",
    milestone_id: "",
  });
  const [busy, setBusy] = useState(false);

  // When a milestone is selected, prefill client + project + nifty task
  const onSelectMilestone = (mid) => {
    if (!mid || mid === "__none__") {
      setForm((f) => ({ ...f, milestone_id: "" }));
      return;
    }
    const ms = milestones.find((m) => m.id === mid);
    if (!ms) {
      setForm((f) => ({ ...f, milestone_id: mid }));
      return;
    }
    setForm((f) => ({
      ...f,
      milestone_id: mid,
      client_email: ms.client_email || f.client_email,
      project_name: ms.project_name || f.project_name,
      asset_name: ms.title || f.asset_name,
      nifty_task_id: ms.nifty_task_id || f.nifty_task_id,
    }));
  };

  const onSubmit = async () => {
    const required = ["client_email", "project_name", "asset_name", "design_url"];
    for (const k of required) {
      if (!form[k].trim()) {
        toast.error(`${k.replace("_", " ")} is required`);
        return;
      }
    }
    setBusy(true);
    try {
      const r = await api.post("/admin/approvals/upload", {
        ...form,
        client_email: form.client_email.trim(),
        designer_email: form.designer_email.trim() || null,
        nifty_task_id: form.nifty_task_id.trim() || null,
        milestone_id: form.milestone_id || null,
      });
      const review = r.data?.review_url;
      toast.success(
        review
          ? `Uploaded · Approval Studio link copied`
          : "Uploaded · syncing to Nifty"
      );
      if (review) {
        try {
          await navigator.clipboard.writeText(review);
        } catch {
          // ignore
        }
      }
      onUploaded();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-testid="admin-approvals-upload-dialog" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Upload design for review</DialogTitle>
          <DialogDescription>
            Pushes the link to Approval Studio (mocked unless creds are set) and
            posts a comment on the linked Nifty task.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Link to existing milestone (optional, auto-fills below)</Label>
            <Select
              value={form.milestone_id || "__none__"}
              onValueChange={onSelectMilestone}
            >
              <SelectTrigger className="mt-1.5" data-testid="upload-milestone-select">
                <SelectValue placeholder={milestones.length === 0 ? "No milestones yet" : "Select a milestone..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— No milestone link —</SelectItem>
                {milestones.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.title} · {m.client_email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <FormField label="Client email" required>
              <Input
                type="email"
                value={form.client_email}
                onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                data-testid="upload-client-email-input"
              />
            </FormField>
            <FormField label="Designer email (optional)">
              <Input
                type="email"
                value={form.designer_email}
                onChange={(e) => setForm({ ...form, designer_email: e.target.value })}
                data-testid="upload-designer-email-input"
              />
            </FormField>
          </div>

          <FormField label="Project name" required>
            <Input
              value={form.project_name}
              onChange={(e) => setForm({ ...form, project_name: e.target.value })}
              data-testid="upload-project-name-input"
            />
          </FormField>

          <FormField label="Asset name (e.g. Landing v2)" required>
            <Input
              value={form.asset_name}
              onChange={(e) => setForm({ ...form, asset_name: e.target.value })}
              data-testid="upload-asset-name-input"
            />
          </FormField>

          <FormField label="Design URL (Figma / Drive / etc.)" required>
            <Input
              type="url"
              placeholder="https://figma.com/..."
              value={form.design_url}
              onChange={(e) => setForm({ ...form, design_url: e.target.value })}
              data-testid="upload-design-url-input"
            />
          </FormField>

          <FormField label="Nifty task ID (optional)">
            <Input
              placeholder="task ObjectId — auto-filled when a milestone is selected"
              value={form.nifty_task_id}
              onChange={(e) => setForm({ ...form, nifty_task_id: e.target.value })}
              data-testid="upload-nifty-task-input"
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={busy}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="upload-submit-button"
          >
            {busy ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormField({ label, required, children }) {
  return (
    <div>
      <Label className="text-sm">
        {label}
        {required && <span className="text-rose-500 ml-1">*</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
