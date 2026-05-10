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
} from "lucide-react";

export default function OnboardingAdmin() {
  const api = useAdminApi();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ client_email: "", client_name: "" });

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
                          <Badge variant="outline" className="border-amber-400 text-amber-700">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {ob.nifty_errors.length} Nifty error(s)
                          </Badge>
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
                            <Button
                              size="sm"
                              variant="ghost"
                              className="mt-2 h-7 text-[11px]"
                              onClick={() => onReplay(ob.id, phase)}
                              data-testid={`onboarding-replay-${ob.id}-${phase}`}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Re-run automation
                            </Button>
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
    </div>
  );
}
