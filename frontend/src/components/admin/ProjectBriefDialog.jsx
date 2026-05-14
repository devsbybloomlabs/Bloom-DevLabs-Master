/**
 * ProjectBriefDialog — admin per-phase brief composer.
 *
 * New workflow (Phase D part 3):
 *   1. Open with an onboarding row. We fetch the 3 pre-filled Claude prompts
 *      + the brief doc (creates one lazily on first open).
 *   2. Per phase tab: copy the prompt → paste back the summary in TipTap →
 *      Save. If a client comment exists for this phase, it's pinned at the
 *      top with an optional admin reply chip.
 *   3. Click "Send Phase X for review" — status flips to sent_for_review;
 *      email goes to client with the rendered HTML.
 *   4. Approved phases are locked (read-only); revision history is browsable.
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Copy,
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Wand2,
  Lock,
  MessageSquare,
  History,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import RichTextEditor from "@/components/RichTextEditor";

const PHASE_META = {
  phase1: { num: 1, label: "Design Language", promptKey: "design", color: "text-pink-600" },
  phase2: { num: 2, label: "Functionality", promptKey: "function", color: "text-blue-600" },
  phase3: { num: 3, label: "Company Background", promptKey: "company", color: "text-emerald-600" },
};

const STATUS_META = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200" },
  sent_for_review: {
    label: "Awaiting client",
    color: "bg-blue-100 text-blue-800 border-blue-200",
  },
  in_revision: {
    label: "Client commented",
    color: "bg-amber-100 text-amber-800 border-amber-200",
  },
  approved: {
    label: "Approved",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
};

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function ProjectBriefDialog({ open, onClose, onboarding, api }) {
  const [bundle, setBundle] = useState(null);
  const [brief, setBrief] = useState(null);
  const [activePhase, setActivePhase] = useState("phase1");
  const [draft, setDraft] = useState({ phase1: "", phase2: "", phase3: "" });
  const [adminReplyNote, setAdminReplyNote] = useState({
    phase1: "",
    phase2: "",
    phase3: "",
  });
  const [noteToClient, setNoteToClient] = useState({
    phase1: "",
    phase2: "",
    phase3: "",
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState({});

  // -----------------------------------------------------------------------
  // Load / sync
  // -----------------------------------------------------------------------
  const loadBundle = useCallback(async () => {
    if (!onboarding?.id) return;
    setLoading(true);
    try {
      const r = await api.get(`/admin/briefs/prompts/${onboarding.id}`);
      setBundle(r.data);
      const existing = await api.get(
        `/admin/briefs?client_email=${encodeURIComponent(r.data.client_email)}`
      );
      let b =
        (existing.data || []).find((x) => x.status !== "archived") || null;
      if (!b) {
        const created = await api.post("/admin/briefs", {
          client_email: r.data.client_email,
          onboarding_id: onboarding.id,
        });
        b = created.data;
      }
      setBrief(b);
      const ps = b.phase_summaries || {};
      setDraft({
        phase1: ps.phase1?.summary || "",
        phase2: ps.phase2?.summary || "",
        phase3: ps.phase3?.summary || "",
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load brief");
    } finally {
      setLoading(false);
    }
  }, [onboarding, api]);

  useEffect(() => {
    if (open) loadBundle();
    else {
      // Clear local state when closed so the dialog opens fresh next time.
      setBundle(null);
      setBrief(null);
      setAdminReplyNote({ phase1: "", phase2: "", phase3: "" });
      setNoteToClient({ phase1: "", phase2: "", phase3: "" });
      setShowHistory({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const phase = brief?.phase_summaries?.[activePhase] || {};
  const phaseStatus = phase.status || "draft";
  const isLocked = phaseStatus === "approved";
  const hasComment = Boolean(phase.latest_comment);

  // Compute brief-level rollup
  const phaseStatuses = useMemo(
    () => ({
      phase1: brief?.phase_summaries?.phase1?.status || "draft",
      phase2: brief?.phase_summaries?.phase2?.status || "draft",
      phase3: brief?.phase_summaries?.phase3?.status || "draft",
    }),
    [brief]
  );
  const allApproved =
    phaseStatuses.phase1 === "approved" &&
    phaseStatuses.phase2 === "approved" &&
    phaseStatuses.phase3 === "approved";

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  const copyPrompt = (key) => {
    const p = bundle?.prompts?.[PHASE_META[key].promptKey];
    if (!p) return;
    navigator.clipboard?.writeText(p);
    toast.success("Prompt copied — paste into Claude.");
  };

  const saveSummary = async (key, { resendAfter = false } = {}) => {
    if (!brief) return;
    if (!draft[key]?.trim() || draft[key] === "<p></p>") {
      toast.error("Add a summary first.");
      return;
    }
    setBusy(true);
    try {
      const payload = { summary: draft[key] };
      if (adminReplyNote[key]?.trim()) payload.admin_reply_note = adminReplyNote[key];
      const r = await api.patch(
        `/admin/briefs/${brief.id}/phase/${key}`,
        payload
      );
      let updated = r.data;
      if (resendAfter) {
        // Chain Save → Send for review so the client sees the new version
        // immediately. Uses the existing note_to_client if the admin typed one.
        const s = await api.post(
          `/admin/briefs/${brief.id}/phase/${key}/send-for-review`,
          { note_to_client: noteToClient[key] || null }
        );
        updated = s.data;
        setNoteToClient({ ...noteToClient, [key]: "" });
      }
      setBrief(updated);
      toast.success(resendAfter ? "Saved & re-sent for review" : "Saved");
      setAdminReplyNote({ ...adminReplyNote, [key]: "" });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const sendForReview = async (key) => {
    if (!brief) return;
    setBusy(true);
    try {
      const r = await api.post(
        `/admin/briefs/${brief.id}/phase/${key}/send-for-review`,
        { note_to_client: noteToClient[key] || null }
      );
      setBrief(r.data);
      toast.success(`${PHASE_META[key].label} sent for review`);
      setNoteToClient({ ...noteToClient, [key]: "" });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent
        className="sm:max-w-[820px] max-h-[92vh] overflow-y-auto"
        data-testid="brief-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Wand2 className="h-5 w-5 text-primary" />
            AI Project Brief
            {brief?.status && (
              <Badge variant="outline" className="ml-2 text-xs">
                {brief.status.replace("_", " ")}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {onboarding?.client_email} · {brief?.project_name || "—"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading brief…
          </div>
        ) : !bundle || !brief ? null : (
          <Tabs value={activePhase} onValueChange={setActivePhase}>
            {brief?.awaiting_contract_dispatch && !brief?.contract_dispatched_at && (
              <ContractDispatchBanner
                brief={brief}
                api={api}
                onDispatched={(updated) => setBrief(updated)}
              />
            )}
            {brief?.contract_dispatched_at && (
              <div
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 mb-4 text-sm text-emerald-900"
                data-testid="brief-contract-sent-banner"
              >
                <strong>Contract sent.</strong> Sent {new Date(brief.contract_dispatched_at).toLocaleString()}
                {brief?.contract_dispatch_result?.sign_url && (
                  <>
                    {" · "}
                    <a
                      href={brief.contract_dispatch_result.sign_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      View signing link
                    </a>
                  </>
                )}
              </div>
            )}
            <TabsList className="grid grid-cols-3 w-full">
              {Object.entries(PHASE_META).map(([k, m]) => {
                const st = STATUS_META[phaseStatuses[k]] || STATUS_META.draft;
                return (
                  <TabsTrigger
                    key={k}
                    value={k}
                    data-testid={`brief-tab-${k}`}
                    className="text-xs flex items-center gap-1.5"
                  >
                    <span className={`font-semibold ${m.color}`}>
                      Phase {m.num}
                    </span>
                    <span className="text-foreground/70">· {m.label}</span>
                    <span className={`text-[9px] uppercase tracking-wider rounded px-1 py-0.5 ${st.color} ml-1`}>
                      {st.label}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {Object.entries(PHASE_META).map(([key, m]) => {
              const p = brief.phase_summaries?.[key] || {};
              const status = p.status || "draft";
              const locked = status === "approved";
              return (
                <TabsContent key={key} value={key} className="mt-5 space-y-4">
                  {/* Status banner */}
                  <Card className={STATUS_META[status]?.color ? "" : ""}>
                    <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap text-sm">
                      <div className="flex items-center gap-2">
                        {locked ? (
                          <Lock className="h-4 w-4 text-emerald-600" />
                        ) : status === "in_revision" ? (
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                        ) : status === "sent_for_review" ? (
                          <Sparkles className="h-4 w-4 text-blue-600" />
                        ) : (
                          <FileBadge />
                        )}
                        <span className="font-medium">
                          {STATUS_META[status]?.label || status}
                        </span>
                        {p.sent_at && (
                          <span className="text-xs text-muted-foreground">
                            · sent {fmtDate(p.sent_at)}
                          </span>
                        )}
                        {p.approved_at && (
                          <span className="text-xs text-muted-foreground">
                            · approved {fmtDate(p.approved_at)}
                          </span>
                        )}
                      </div>
                      {(p.revisions?.length || 0) > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            setShowHistory({
                              ...showHistory,
                              [key]: !showHistory[key],
                            })
                          }
                          data-testid={`brief-history-toggle-${key}`}
                        >
                          <History className="h-3.5 w-3.5 mr-1" />
                          {showHistory[key] ? "Hide" : "Show"} history ({p.revisions.length})
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                  {/* Client comment pinned at top if exists */}
                  {p.latest_comment && status !== "approved" && (
                    <Card className="border-amber-200 bg-amber-50/60">
                      <CardContent className="p-3.5">
                        <p className="text-[11px] uppercase tracking-wider font-semibold text-amber-700 inline-flex items-center gap-1.5 mb-1">
                          <MessageSquare className="h-3 w-3" />
                          Latest comment from client
                        </p>
                        <p className="text-sm whitespace-pre-wrap text-foreground/90">
                          {p.latest_comment}
                        </p>
                        <p className="text-[11px] text-muted-foreground italic mt-2">
                          Re-roll Claude with this comment in mind, paste the new summary, then re-send.
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Prompt + Copy */}
                  <Card>
                    <CardContent className="p-3.5">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground inline-flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3" /> Claude prompt
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyPrompt(key)}
                          className="h-7 px-2 text-xs"
                          data-testid={`brief-prompt-copy-${key}`}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <pre
                        className="text-xs bg-secondary/40 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono leading-snug"
                        data-testid={`brief-prompt-${key}`}
                      >
                        {bundle.prompts?.[m.promptKey]}
                      </pre>
                    </CardContent>
                  </Card>

                  {/* Summary editor */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                      Claude's summary (paste + format)
                    </p>
                    {locked ? (
                      <RichTextEditor
                        value={p.summary || ""}
                        readOnly
                        dataTestId={`brief-summary-readonly-${key}`}
                      />
                    ) : (
                      <RichTextEditor
                        value={draft[key]}
                        onChange={(v) => setDraft({ ...draft, [key]: v })}
                        dataTestId={`brief-summary-${key}`}
                        placeholder="Paste the Claude summary here and format it…"
                      />
                    )}
                  </div>

                  {/* Optional admin reply chip (only shown when there's a comment we're addressing) */}
                  {hasComment && status === "in_revision" && !locked && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                        Reply chip (optional — shows next to the new summary)
                      </p>
                      <Input
                        value={adminReplyNote[key] || ""}
                        onChange={(e) =>
                          setAdminReplyNote({
                            ...adminReplyNote,
                            [key]: e.target.value,
                          })
                        }
                        placeholder="e.g. Updated based on your feedback re: warmer accent."
                        data-testid={`brief-reply-${key}`}
                      />
                    </div>
                  )}

                  {/* Optional note-to-client */}
                  {!locked && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                        Note to client (optional — included in the email)
                      </p>
                      <Textarea
                        value={noteToClient[key] || ""}
                        onChange={(e) =>
                          setNoteToClient({
                            ...noteToClient,
                            [key]: e.target.value,
                          })
                        }
                        rows={2}
                        placeholder="Anything you want to say with this phase? Optional."
                        data-testid={`brief-note-${key}`}
                      />
                    </div>
                  )}

                  {/* Action buttons */}
                  {!locked && (
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => saveSummary(key)}
                        disabled={busy}
                        data-testid={`brief-save-${key}`}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : null}
                        Save draft
                      </Button>
                      {hasComment && status === "in_revision" ? (
                        // Combined Save + Re-send when responding to a client comment.
                        // This is the most common admin action after a re-roll.
                        <Button
                          onClick={() => saveSummary(key, { resendAfter: true })}
                          disabled={busy || !draft[key]?.trim()}
                          data-testid={`brief-save-and-resend-${key}`}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Save & re-send for review
                        </Button>
                      ) : (
                        <Button
                          onClick={() => sendForReview(key)}
                          disabled={busy || !p.summary}
                          data-testid={`brief-send-${key}`}
                        >
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                          {status === "sent_for_review"
                            ? "Re-send for review"
                            : "Send for review"}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Revision history */}
                  {showHistory[key] && (p.revisions?.length || 0) > 0 && (
                    <Card className="border-dashed">
                      <CardContent className="p-3.5 space-y-2.5">
                        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                          Revision history
                        </p>
                        {p.revisions.map((rev, i) => (
                          <div
                            key={i}
                            className="rounded-md border border-border bg-secondary/30 p-2.5"
                            data-testid={`brief-revision-${key}-${i}`}
                          >
                            <div className="flex items-center justify-between mb-1.5 text-[10px] text-muted-foreground">
                              <span>
                                Version {i + 1} · {rev.created_by}
                              </span>
                              <span className="tabular-nums">
                                {fmtDate(rev.created_at)}
                              </span>
                            </div>
                            {rev.comment && (
                              <div className="text-[11px] bg-amber-50 border border-amber-200 rounded p-1.5 mb-1.5">
                                <strong>Triggered by comment:</strong> {rev.comment}
                              </div>
                            )}
                            {rev.admin_reply_note && (
                              <div className="text-[11px] bg-blue-50 border border-blue-100 rounded p-1.5 mb-1.5">
                                <strong>Reply chip:</strong>{" "}
                                <span dangerouslySetInnerHTML={{ __html: rev.admin_reply_note }} />
                              </div>
                            )}
                            <RichTextEditor value={rev.summary} readOnly />
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}

        <DialogFooter className="border-t border-border pt-3 mt-2">
          {allApproved ? (
            <span className="text-xs text-emerald-700 inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              All 3 phases approved — client signed off the brief.
            </span>
          ) : (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <ArrowRight className="h-3 w-3" />
              Send each phase for review. The brief auto-locks once all three are
              approved.
            </span>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileBadge() {
  return <CheckCircle2 className="h-4 w-4 text-slate-400" />;
}


function ContractDispatchBanner({ brief, api, onDispatched }) {
  const [busy, setBusy] = useState(false);

  const dispatch = async () => {
    if (
      !window.confirm(
        "Dispatch the Master Services Agreement to the client?\n\nThis will:\n• Compile the brief + onboarding + paid invoice into one PDF\n• Send for e-signature via BreezeDocs\n• Email the signing link to the client\n• Add a 'Contract & Invoice Sent' milestone"
      )
    )
      return;
    setBusy(true);
    try {
      const r = await api.post(`/admin/briefs/${brief.id}/dispatch-contract`);
      toast.success("Contract sent for signing");
      onDispatched && onDispatched(r.data.brief);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Dispatch failed");
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    setBusy(true);
    try {
      const r = await api.get(`/admin/briefs/${brief.id}/contract-preview`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(r.data);
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3"
      data-testid="brief-contract-dispatch-banner"
    >
      <div className="text-sm text-amber-900">
        <strong>Brief fully approved.</strong> Ready to compile contract + invoice and send for signing.
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={preview}
          disabled={busy}
          data-testid="brief-contract-preview"
        >
          Preview PDF
        </Button>
        <Button
          size="sm"
          onClick={dispatch}
          disabled={busy}
          data-testid="brief-contract-dispatch-btn"
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
          Send contract + invoice
        </Button>
      </div>
    </div>
  );
}
