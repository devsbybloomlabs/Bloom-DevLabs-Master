/**
 * Admin Onboarding management — list all client onboardings, view status,
 * regenerate resume links, replay failed phases, copy link to share.
 */
import { useState, useEffect, useCallback } from "react";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Link as LinkIcon,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Loader2,
  Eye,
  FileText,
} from "lucide-react";

const PHASE_LABEL = {
  phase1: "Phase 1 — Design language",
  phase2: "Phase 2 — Function references",
  phase3: "Phase 3 — Company background",
};

function renderLinkList(links) {
  if (!Array.isArray(links) || links.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No links submitted.</p>;
  }
  return (
    <ol className="space-y-2.5 text-sm">
      {links.map((lk, idx) => (
        <li key={idx} className="rounded-md border border-border bg-background/50 p-2.5">
          <a
            href={lk?.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#1E3A8A] hover:underline break-all"
          >
            {idx + 1}. {lk?.url || "—"}
          </a>
          {lk?.why && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Why: </span>
              {lk.why}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function renderField(label, value) {
  if (!value || (typeof value === "string" && !value.trim())) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm whitespace-pre-wrap">{value}</div>
    </div>
  );
}

export default function OnboardingAdmin() {
  const api = useAdminApi();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ client_email: "", client_name: "" });
  const [viewOb, setViewOb] = useState(null); // { onboarding, focusPhase? }
  const [viewErrors, setViewErrors] = useState(null); // onboarding doc

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/onboarding");
      setItems(r.data);
    } catch {
      toast.error("Failed to load onboardings");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onStart = async () => {
    if (!newForm.client_email.trim()) return;
    try {
      const r = await api.post("/admin/onboarding/start", newForm);
      toast.success("Onboarding ready");
      try {
        await navigator.clipboard.writeText(r.data.resume_url);
        toast.success("Resume link copied to clipboard");
      } catch {}
      setCreating(false);
      setNewForm({ client_email: "", client_name: "" });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start");
    }
  };

  const onRegen = async (id) => {
    try {
      const r = await api.post(`/admin/onboarding/${id}/regenerate-link`);
      try {
        await navigator.clipboard.writeText(r.data.resume_url);
        toast.success("New link copied to clipboard");
      } catch {
        toast.success("Link regenerated");
      }
      load();
    } catch {
      toast.error("Could not regenerate");
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this onboarding record?")) return;
    try {
      await api.delete(`/admin/onboarding/${id}`);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  const onReplay = async (id, phase) => {
    try {
      await api.post(`/admin/onboarding/${id}/replay/${phase}`);
      toast.success(`Phase ${phase} automation re-ran`);
      load();
    } catch {
      toast.error("Replay failed");
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-onboarding-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Onboarding</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Client onboardings + Nifty PM task automation. {items.length} total.
          </p>
        </div>
        <Button
          onClick={() => setCreating(true)}
          className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
          data-testid="onboarding-admin-new-button"
        >
          <Plus className="h-4 w-4 mr-2" />
          Start onboarding
        </Button>
      </div>

      {loading ? (
        <Card className="border-border"><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : items.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-12 text-center" data-testid="onboarding-admin-empty">
            <p className="font-display text-base font-medium">No onboardings yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Onboarding is auto-created on PayPal payment, or start one manually here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3" data-testid="onboarding-admin-list">
          {items.map((ob) => {
            const phasesDone = [ob.phase1_submitted_at, ob.phase2_submitted_at, ob.phase3_submitted_at]
              .filter(Boolean).length;
            const resumeUrl = `${window.location.origin}/portal/onboarding?token=${ob.resume_token}`;
            return (
              <Card key={ob.id} className="border-border" data-testid={`onboarding-row-${ob.id}`}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {ob.completed ? (
                          <Badge className="bg-green-100 text-green-800 border-0">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                          </Badge>
                        ) : (
                          <Badge variant="outline">Step {ob.current_phase}/3</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {phasesDone}/3 phases submitted
                        </span>
                        {(ob.nifty_errors || []).length > 0 && (
                          <button
                            type="button"
                            onClick={() => setViewErrors(ob)}
                            data-testid={`onboarding-view-errors-${ob.id}`}
                            className="inline-flex items-center"
                          >
                            <Badge variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-50 cursor-pointer">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              {ob.nifty_errors.length} Nifty error(s) — view
                            </Badge>
                          </button>
                        )}
                      </div>
                      <p className="mt-2 font-display text-base font-medium">{ob.client_name || ob.client_email}</p>
                      <p className="text-xs text-muted-foreground break-anywhere">{ob.client_email}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(resumeUrl);
                          toast.success("Resume link copied");
                        }}
                        data-testid={`onboarding-copy-link-${ob.id}`}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy link
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onRegen(ob.id)}
                        title="Regenerate link"
                        data-testid={`onboarding-regen-${ob.id}`}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(ob.id)}
                        data-testid={`onboarding-delete-${ob.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                  {/* Per-phase status */}
                  <div className="mt-4 grid sm:grid-cols-3 gap-2 text-xs">
                    {[1, 2, 3].map((phase) => {
                      const submittedAt = ob[`phase${phase}_submitted_at`];
                      const taskIds = (ob.nifty_task_ids || {})[`phase${phase}`] || [];
                      return (
                        <div
                          key={phase}
                          className="rounded-lg border border-border bg-background p-3"
                          data-testid={`onboarding-phase-status-${ob.id}-${phase}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">Phase {phase}</span>
                            {submittedAt ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                            ) : null}
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {submittedAt
                              ? `Submitted ${new Date(submittedAt).toLocaleDateString()}`
                              : "Pending"}
                          </p>
                          <p className="text-muted-foreground">
                            Nifty tasks: {taskIds.length}
                          </p>
                          {submittedAt && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-[11px]"
                                onClick={() => setViewOb({ onboarding: ob, focusPhase: phase })}
                                data-testid={`onboarding-view-submission-${ob.id}-${phase}`}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-[11px]"
                                onClick={() => onReplay(ob.id, phase)}
                                data-testid={`onboarding-replay-${ob.id}-${phase}`}
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Re-run
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent data-testid="onboarding-admin-new-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Start onboarding</DialogTitle>
            <DialogDescription>
              We&apos;ll generate a secure resume link. You can share it via email or copy/paste anywhere.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Client email</Label>
              <Input
                type="email"
                value={newForm.client_email}
                onChange={(e) => setNewForm({ ...newForm, client_email: e.target.value })}
                placeholder="client@example.com"
                data-testid="onboarding-admin-new-email"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Client name <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={newForm.client_name}
                onChange={(e) => setNewForm({ ...newForm, client_name: e.target.value })}
                placeholder="Jane Doe"
                data-testid="onboarding-admin-new-name"
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              onClick={onStart}
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
              data-testid="onboarding-admin-start-submit"
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              Generate link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View submission dialog */}
      <Dialog open={Boolean(viewOb)} onOpenChange={(o) => !o && setViewOb(null)}>
        <DialogContent
          className="sm:max-w-2xl max-h-[85vh] overflow-y-auto"
          data-testid="onboarding-view-dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#1E3A8A]" />
              Client submission
            </DialogTitle>
            <DialogDescription>
              Everything the client typed across the 3-step onboarding.
            </DialogDescription>
          </DialogHeader>
          {viewOb?.onboarding && (
            <div className="space-y-5">
              <div className="rounded-lg border border-border bg-[var(--warm-50)] px-3 py-3 text-sm">
                <div className="font-medium">{viewOb.onboarding.client_name || viewOb.onboarding.client_email}</div>
                <div className="text-xs text-muted-foreground">{viewOb.onboarding.client_email}</div>
              </div>
              {[1, 2, 3].map((p) => {
                const phaseKey = `phase${p}`;
                const data = viewOb.onboarding[phaseKey] || {};
                const submittedAt = viewOb.onboarding[`${phaseKey}_submitted_at`];
                const isFocused = viewOb.focusPhase === p;
                if (!submittedAt && Object.keys(data).length === 0) {
                  return (
                    <details
                      key={p}
                      className="rounded-lg border border-border bg-card p-3 opacity-60"
                      data-testid={`onboarding-view-section-${phaseKey}`}
                    >
                      <summary className="cursor-pointer text-sm font-medium">
                        {PHASE_LABEL[phaseKey]} — Not submitted
                      </summary>
                    </details>
                  );
                }
                return (
                  <details
                    key={p}
                    open={isFocused || p === viewOb.focusPhase}
                    className={`rounded-lg border bg-card p-3 ${
                      isFocused ? "border-[#1E3A8A] ring-1 ring-[#1E3A8A]/20" : "border-border"
                    }`}
                    data-testid={`onboarding-view-section-${phaseKey}`}
                  >
                    <summary className="cursor-pointer flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{PHASE_LABEL[phaseKey]}</span>
                      {submittedAt && (
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(submittedAt).toLocaleString()}
                        </span>
                      )}
                    </summary>
                    <div className="mt-3 space-y-3">
                      {p === 1 && (
                        <>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                              Design Links
                            </div>
                            {renderLinkList(data.design_links)}
                          </div>
                          {renderField("Color Preferences", data.color_preferences)}
                          {renderField("Mood Keywords", data.mood_keywords)}
                        </>
                      )}
                      {p === 2 && (
                        <>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                              Function References
                            </div>
                            {renderLinkList(data.function_links)}
                          </div>
                          {renderField("Additional Requirements", data.additional_specs)}
                        </>
                      )}
                      {p === 3 && (
                        <>
                          {renderField("Company Name", data.company_name)}
                          {renderField("Industry", data.industry)}
                          {renderField("Target Audience", data.target_audience)}
                          {renderField("Unique Value Proposition", data.uvp)}
                          {renderField("Success Metrics", data.success_metrics)}
                          {renderField("Launch Date", data.launch_date)}
                          {renderField("Notes for the team", data.notes)}
                        </>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewOb(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Nifty errors dialog */}
      <Dialog open={Boolean(viewErrors)} onOpenChange={(o) => !o && setViewErrors(null)}>
        <DialogContent
          className="sm:max-w-2xl max-h-[85vh] overflow-y-auto"
          data-testid="onboarding-errors-dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Nifty automation errors
            </DialogTitle>
            <DialogDescription>
              These tasks couldn&apos;t be created in Nifty. Use the description below
              to add them manually, or click <strong>Re-run automation</strong> on the phase
              card after fixing the root cause (usually a stale Nifty OAuth token — Disconnect → Reconnect).
            </DialogDescription>
          </DialogHeader>
          {viewErrors?.nifty_errors && (
            <div className="space-y-3">
              {viewErrors.nifty_errors.map((err, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-amber-200 bg-amber-50/40 p-3.5"
                  data-testid={`onboarding-error-row-${idx}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {err.phase}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {err.at ? new Date(err.at).toLocaleString() : ""}
                    </span>
                  </div>
                  <div className="mt-1.5 font-medium text-sm">{err.task_name}</div>
                  <div className="mt-1 text-xs">
                    <span className="font-medium text-rose-700">Error: </span>
                    <span className="text-rose-700">
                      {err.error || "Unknown"} {err.status ? `(${err.status})` : ""}
                    </span>
                  </div>
                  {Array.isArray(err.assignees) && err.assignees.length > 0 && (
                    <div className="mt-1 text-xs">
                      <span className="font-medium text-muted-foreground">Assignees: </span>
                      {err.assignees.join(", ")}
                    </div>
                  )}
                  {err.description_preview && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                        Show task description
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap text-[11px] bg-background border border-border rounded p-2 max-h-48 overflow-y-auto">
                        {err.description_preview}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewErrors(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
