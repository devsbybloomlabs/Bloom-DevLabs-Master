/**
 * ProjectBriefDialog — admin AI prompt generator + brief composer.
 *
 * Workflow:
 *   1. Open with an onboarding's record. We fetch 3 ready-to-paste AI prompts
 *      pre-filled with the client's actual answers (via `/admin/briefs/prompts/{onboarding_id}`).
 *   2. Admin clicks "Copy prompt" → pastes into Claude → pastes the
 *      generated summary back into the textarea per phase.
 *   3. Save → PATCH /admin/briefs/{id}/phase/phase1 (and 2, 3).
 *   4. Click "Send for approval" → email goes to client + status flips to
 *      `sent_for_approval`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Copy,
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

const PHASE_META = {
  phase1: { num: 1, label: "Design Language", promptKey: "design", color: "text-pink-600" },
  phase2: { num: 2, label: "Function Language", promptKey: "function", color: "text-blue-600" },
  phase3: { num: 3, label: "Company & Goals", promptKey: "company", color: "text-emerald-600" },
};

export default function ProjectBriefDialog({ open, onClose, onboarding, api }) {
  const [bundle, setBundle] = useState(null); // {prompts, answers, phases_submitted, client_email}
  const [brief, setBrief] = useState(null);
  const [activePhase, setActivePhase] = useState("phase1");
  const [draft, setDraft] = useState({ phase1: "", phase2: "", phase3: "" });
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [noteToClient, setNoteToClient] = useState("");

  const load = useCallback(async () => {
    if (!open || !onboarding?.id) return;
    setBusy(true);
    try {
      // 1. fetch prompts
      const promptsRes = await api.get(`/admin/briefs/prompts/${onboarding.id}`);
      setBundle(promptsRes.data);
      // 2. find existing brief or create one
      const listRes = await api.get(
        `/admin/briefs?client_email=${encodeURIComponent(onboarding.client_email)}`
      );
      const existing = (listRes.data || []).find(
        (b) => b.onboarding_id === onboarding.id && b.status !== "archived"
      );
      let b = existing;
      if (!b) {
        const createRes = await api.post("/admin/briefs", {
          client_email: onboarding.client_email,
          onboarding_id: onboarding.id,
        });
        b = createRes.data;
      }
      setBrief(b);
      setDraft({
        phase1: b.phase_summaries?.phase1?.summary || "",
        phase2: b.phase_summaries?.phase2?.summary || "",
        phase3: b.phase_summaries?.phase3?.summary || "",
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load brief");
    } finally {
      setBusy(false);
    }
  }, [open, onboarding, api]);

  useEffect(() => {
    if (open) load();
    else {
      setBundle(null);
      setBrief(null);
      setDraft({ phase1: "", phase2: "", phase3: "" });
      setActivePhase("phase1");
      setNoteToClient("");
    }
  }, [open, load]);

  const copy = async (text, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      window.prompt("Copy this:", text);
    }
  };

  const saveSummary = async (phase) => {
    if (!brief || !draft[phase]?.trim()) return;
    setBusy(true);
    try {
      const r = await api.patch(`/admin/briefs/${brief.id}/phase/${phase}`, {
        summary: draft[phase].trim(),
      });
      setBrief(r.data);
      toast.success(`${PHASE_META[phase].label} saved`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const sendForApproval = async () => {
    if (!brief) return;
    const hasAny = Object.values(draft).some((s) => (s || "").trim().length > 10);
    if (!hasAny) {
      toast.error("Add at least one phase summary before sending");
      return;
    }
    // Auto-save anything that hasn't been saved
    for (const ph of ["phase1", "phase2", "phase3"]) {
      if (
        (draft[ph] || "").trim() &&
        (draft[ph] || "").trim() !== (brief.phase_summaries?.[ph]?.summary || "").trim()
      ) {
        try {
          await api.patch(`/admin/briefs/${brief.id}/phase/${ph}`, {
            summary: draft[ph].trim(),
          });
        } catch {
          /* keep going */
        }
      }
    }
    setSending(true);
    try {
      const r = await api.post(`/admin/briefs/${brief.id}/send-for-approval`, {
        note_to_client: noteToClient.trim() || null,
      });
      setBrief(r.data);
      toast.success("Brief sent — client will see the approval prompt in their portal");
      setTimeout(() => onClose?.(), 1200);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const summary = useMemo(() => {
    if (!brief) return null;
    const filled = ["phase1", "phase2", "phase3"].filter(
      (p) => (draft[p] || "").trim().length > 10
    );
    return {
      filled: filled.length,
      total: 3,
      status: brief.status,
      readonly: brief.status === "approved",
    };
  }, [brief, draft]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent
        className="sm:max-w-[820px] max-h-[90vh] overflow-y-auto"
        data-testid="brief-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <Wand2 className="h-5 w-5 text-primary" />
            AI Project Brief —{" "}
            <span className="text-muted-foreground font-normal">
              {onboarding?.client_name || onboarding?.client_email}
            </span>
          </DialogTitle>
          <DialogDescription>
            We pre-filled 3 AI prompts using the client's actual onboarding
            answers. Copy each into Claude (or your AI of choice), paste the
            summary back below, and send the brief for approval.
          </DialogDescription>
        </DialogHeader>

        {busy && !bundle ? (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading brief…
          </div>
        ) : bundle && brief ? (
          <>
            {/* Status pill */}
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2">
              <Badge
                variant="outline"
                className={
                  brief.status === "approved"
                    ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                    : brief.status === "sent_for_approval"
                    ? "bg-amber-100 text-amber-900 border-amber-300"
                    : "bg-secondary text-foreground"
                }
                data-testid="brief-dialog-status"
              >
                {brief.status === "approved" ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Approved {brief.approved_at?.slice(0, 10)}
                  </>
                ) : brief.status === "sent_for_approval" ? (
                  <>
                    <Send className="h-3.5 w-3.5 mr-1" />
                    Sent for approval
                  </>
                ) : (
                  <>
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    Draft · {summary?.filled || 0}/3 phases filled
                  </>
                )}
              </Badge>
            </div>

            {/* Phase tabs */}
            <Tabs value={activePhase} onValueChange={setActivePhase} className="w-full">
              <TabsList className="grid grid-cols-3 w-full">
                {Object.entries(PHASE_META).map(([key, meta]) => {
                  const filled = (draft[key] || "").trim().length > 10;
                  return (
                    <TabsTrigger key={key} value={key} data-testid={`brief-tab-${key}`}>
                      <span className={`mr-1.5 ${meta.color}`}>{meta.num}.</span>
                      {meta.label}
                      {filled && (
                        <CheckCircle2 className="h-3 w-3 ml-1.5 text-emerald-600" />
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {Object.entries(PHASE_META).map(([key, meta]) => (
                <TabsContent key={key} value={key} className="space-y-4 mt-4">
                  {!bundle.phases_submitted?.[key] && (
                    <Card className="border-amber-200 bg-amber-50">
                      <CardContent className="p-3 flex items-center gap-2 text-sm text-amber-900">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        Client hasn&apos;t submitted this phase yet — the prompt below uses placeholders.
                      </CardContent>
                    </Card>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3" />
                        AI prompt — paste into Claude
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copy(bundle.prompts[meta.promptKey], "Prompt copied")}
                        data-testid={`brief-copy-prompt-${key}`}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy prompt
                      </Button>
                    </div>
                    <Textarea
                      value={bundle.prompts[meta.promptKey]}
                      readOnly
                      rows={10}
                      className="font-mono text-xs bg-secondary/30 resize-none"
                      data-testid={`brief-prompt-${key}`}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Claude&apos;s summary — paste back here
                      </p>
                      {brief.phase_summaries?.[key]?.summary &&
                        draft[key] !==
                          brief.phase_summaries[key].summary && (
                          <span className="text-[10px] text-amber-600 uppercase tracking-wider">
                            Unsaved changes
                          </span>
                        )}
                    </div>
                    <Textarea
                      value={draft[key]}
                      onChange={(e) =>
                        setDraft({ ...draft, [key]: e.target.value })
                      }
                      readOnly={summary?.readonly}
                      rows={10}
                      placeholder="Paste the AI-generated summary here. The client will see exactly this text."
                      data-testid={`brief-summary-${key}`}
                    />
                    {!summary?.readonly && (
                      <div className="flex justify-end mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => saveSummary(key)}
                          disabled={busy || !(draft[key] || "").trim()}
                          data-testid={`brief-save-${key}`}
                        >
                          Save {meta.label}
                        </Button>
                      </div>
                    )}
                  </div>
                </TabsContent>
              ))}
            </Tabs>

            {/* Note + send */}
            {!summary?.readonly && brief.status !== "approved" && (
              <div className="border-t border-border pt-4 mt-2 space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                    Optional message to the client (shown in the email)
                  </p>
                  <Textarea
                    value={noteToClient}
                    onChange={(e) => setNoteToClient(e.target.value)}
                    rows={2}
                    placeholder="e.g. Take your time — anything you'd like reworded, just reply to this email."
                    data-testid="brief-note-to-client"
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Open an onboarding first.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {bundle && brief && brief.status !== "approved" && (
            <Button
              onClick={sendForApproval}
              disabled={sending}
              data-testid="brief-send-for-approval"
            >
              {sending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {brief.status === "sent_for_approval"
                    ? "Re-send for approval"
                    : "Send for approval"}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
