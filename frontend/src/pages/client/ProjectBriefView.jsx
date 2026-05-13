/**
 * ProjectBriefView — client portal "Project Brief" tab (per-phase flow).
 *
 * Shows a 3-phase progress bar at the top, then a card per phase with:
 *   • Approved → read-only summary with green badge
 *   • Sent for review → summary + comment textarea + legal checkbox +
 *     "Approve Phase X" button (disabled until checkbox ticked)
 *   • In revision → "Our team is reviewing your comments…" banner
 *   • Draft → "Coming soon" pill
 *
 * Bottom: "Approve full Project Brief" button that's disabled until ALL 3
 * phases are individually approved. Triggers a shadcn AlertDialog with the
 * additional-scope warning.
 */
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  FileText,
  Sparkles,
  AlertCircle,
  Lock,
  Hourglass,
  Loader2,
  MessageSquare,
  History,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import RichTextEditor from "@/components/RichTextEditor";
import { toast } from "sonner";

const PHASES = [
  { key: "phase1", num: 1, label: "Design Language", tone: "from-pink-50 to-rose-50/50 border-pink-100" },
  { key: "phase2", num: 2, label: "Functionality", tone: "from-blue-50 to-sky-50/50 border-blue-100" },
  { key: "phase3", num: 3, label: "Company Background", tone: "from-emerald-50 to-teal-50/50 border-emerald-100" },
];

function PhaseStatusBadge({ status }) {
  if (status === "approved") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200" variant="outline">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Approved
      </Badge>
    );
  }
  if (status === "sent_for_review") {
    return (
      <Badge className="bg-blue-100 text-blue-800 border-blue-200" variant="outline">
        <Hourglass className="h-3 w-3 mr-1" /> Waiting for your review
      </Badge>
    );
  }
  if (status === "in_revision") {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200" variant="outline">
        <Sparkles className="h-3 w-3 mr-1" /> Our team is reviewing…
      </Badge>
    );
  }
  return (
    <Badge className="bg-slate-100 text-slate-700 border-slate-200" variant="outline">
      <FileText className="h-3 w-3 mr-1" /> Drafting
    </Badge>
  );
}

function ProgressDot({ status, num }) {
  let icon = <span>{num}</span>;
  let cls = "bg-slate-200 text-slate-500";
  if (status === "approved") {
    icon = <CheckCircle2 className="h-3.5 w-3.5" />;
    cls = "bg-emerald-500 text-white";
  } else if (status === "sent_for_review") {
    cls = "bg-blue-500 text-white animate-pulse";
  } else if (status === "in_revision") {
    cls = "bg-amber-500 text-white";
  }
  return (
    <div
      className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold ${cls}`}
    >
      {icon}
    </div>
  );
}

function ProgressBar({ brief }) {
  return (
    <div className="flex items-center gap-2 mb-1" data-testid="brief-progress-bar">
      {PHASES.map((p, idx) => {
        const status = brief.phase_summaries?.[p.key]?.status || "draft";
        return (
          <div key={p.key} className="flex items-center gap-2 flex-1">
            <ProgressDot status={status} num={p.num} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Phase {p.num}
              </p>
              <p className="text-xs font-medium truncate">{p.label}</p>
            </div>
            {idx < PHASES.length - 1 && (
              <div
                className={`h-px flex-1 mx-1 ${
                  status === "approved" ? "bg-emerald-300" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PhaseCard({ phase, meta, api, briefId, onChanged }) {
  const status = phase?.status || "draft";
  const [comment, setComment] = useState("");
  const [noCommentsTicked, setNoCommentsTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const postComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api.post(
        `/clients/me/briefs/${briefId}/phase/${meta.key}/comment`,
        { comment: comment.trim() }
      );
      toast.success("Comment sent — your team has been notified");
      setComment("");
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not send");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      await api.post(
        `/clients/me/briefs/${briefId}/phase/${meta.key}/approve`,
        { no_comments_confirmed: true }
      );
      toast.success(`${meta.label} approved`);
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Approval failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      className={`bg-gradient-to-br ${meta.tone} border`}
      data-testid={`portal-brief-phase-${meta.key}`}
    >
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Phase {meta.num}
            </p>
            <h3 className="font-display text-lg font-semibold">{meta.label}</h3>
          </div>
          <PhaseStatusBadge status={status} />
        </div>

        {status === "draft" && (
          <p className="text-sm text-muted-foreground italic">
            We're drafting this phase summary now. We'll let you know as soon
            as it's ready for your review.
          </p>
        )}

        {status === "in_revision" && (
          <div className="text-sm bg-amber-50/80 border border-amber-200 rounded-md px-3 py-2.5 inline-flex items-start gap-2 text-amber-900">
            <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Our team has your feedback and is re-rolling this phase. You'll
              get an email as soon as the new version is ready.
            </span>
          </div>
        )}

        {(status === "sent_for_review" || status === "approved") && phase?.summary && (
          <div className="bg-white/80 rounded-md border border-border p-3.5">
            <RichTextEditor
              value={phase.summary}
              readOnly
              dataTestId={`portal-brief-summary-${meta.key}`}
            />
            {phase.admin_reply_note && (
              <div className="mt-3 text-[11px] bg-blue-50 border border-blue-100 rounded px-2 py-1.5 inline-flex items-start gap-1">
                <MessageSquare className="h-3 w-3 mt-0.5 text-blue-600 shrink-0" />
                <span>
                  <strong>From your team: </strong>
                  <span dangerouslySetInnerHTML={{ __html: phase.admin_reply_note }} />
                </span>
              </div>
            )}
          </div>
        )}

        {/* Approval form — only when sent_for_review */}
        {status === "sent_for_review" && (
          <div className="space-y-3 pt-2">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                Anything you want changed?
              </p>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Leave a comment and we'll iterate. (Otherwise, tick the box below and approve.)"
                data-testid={`portal-brief-comment-${meta.key}`}
              />
              <p className="text-[10px] text-muted-foreground italic mt-1 inline-flex items-center gap-1">
                <Info className="h-2.5 w-2.5" />
                Your team typically responds within 24 hours.
              </p>
            </div>

            <Button
              size="sm"
              onClick={postComment}
              disabled={!comment.trim() || busy}
              variant="outline"
              data-testid={`portal-brief-comment-submit-${meta.key}`}
            >
              {busy ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <MessageSquare className="h-3 w-3 mr-1.5" />}
              Send comment
            </Button>

            <div className="border-t border-border/50 pt-3">
              <label
                className="flex items-start gap-2 text-xs text-foreground/85 cursor-pointer"
                data-testid={`portal-brief-checkbox-label-${meta.key}`}
              >
                <Checkbox
                  checked={noCommentsTicked}
                  onCheckedChange={(v) => setNoCommentsTicked(Boolean(v))}
                  data-testid={`portal-brief-checkbox-${meta.key}`}
                  className="mt-0.5"
                />
                <span>
                  I have reviewed <strong>Phase {meta.num}'s summary</strong>, I
                  confirm that this is correct and I am leaving no comments. By
                  checking this box, I understand that any requests made outside
                  the scope of this summary may incur new fees.
                </span>
              </label>
              <Button
                onClick={approve}
                disabled={!noCommentsTicked || busy}
                className="mt-3"
                data-testid={`portal-brief-approve-${meta.key}`}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                Approve Phase {meta.num}
              </Button>
            </div>
          </div>
        )}

        {/* Revision history — visible on any phase that has > 1 revision */}
        {(phase?.revisions?.length || 0) > 1 && (
          <div className="border-t border-border/50 pt-2">
            <button
              type="button"
              onClick={() => setHistoryOpen(!historyOpen)}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              data-testid={`portal-brief-history-toggle-${meta.key}`}
            >
              <History className="h-3 w-3" />
              {historyOpen ? "Hide" : "View"} previous versions ({phase.revisions.length - 1})
              {historyOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {historyOpen && (
              <div className="mt-2 space-y-2" data-testid={`portal-brief-history-${meta.key}`}>
                {phase.revisions.slice(0, -1).map((rev, i) => (
                  <div
                    key={i}
                    className="rounded border border-border bg-white/60 p-2.5"
                  >
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Version {i + 1}</span>
                      <span>{new Date(rev.created_at).toLocaleString()}</span>
                    </div>
                    {rev.comment && (
                      <div className="text-[10px] bg-amber-50 border border-amber-200 rounded p-1 mb-1.5">
                        Your comment: <em>"{rev.comment}"</em>
                      </div>
                    )}
                    <RichTextEditor value={rev.summary} readOnly />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {status === "approved" && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 mt-2">
            <Lock className="h-3 w-3" />
            Locked at {new Date(phase.approved_at).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProjectBriefView({ brief, api, onApproved }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const refreshRef = useRef(0);

  if (!brief) return null;

  const phases = {
    phase1: brief.phase_summaries?.phase1 || {},
    phase2: brief.phase_summaries?.phase2 || {},
    phase3: brief.phase_summaries?.phase3 || {},
  };
  const allApproved =
    phases.phase1.status === "approved" &&
    phases.phase2.status === "approved" &&
    phases.phase3.status === "approved";

  const finalize = async () => {
    setConfirmOpen(false);
    setFinalizing(true);
    try {
      await api.post(`/clients/me/briefs/${brief.id}/approve`);
      toast.success("Project Brief approved — let's build!");
      onApproved?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Approval failed");
    } finally {
      setFinalizing(false);
    }
  };

  const onPhaseChanged = () => {
    refreshRef.current += 1;
    onApproved?.();
  };

  return (
    <div className="space-y-5" data-testid="portal-brief-view">
      <Card className="bg-gradient-to-br from-primary/5 to-blue-50/40 border-primary/20">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-semibold">
                Project Brief · review by phase
              </p>
              <h2 className="font-display text-xl font-semibold mt-0.5">
                {brief.project_name}
              </h2>
            </div>
            {allApproved && (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200" variant="outline">
                <CheckCircle2 className="h-3 w-3 mr-1" /> All phases approved
              </Badge>
            )}
          </div>
          <ProgressBar brief={brief} />
        </CardContent>
      </Card>

      {PHASES.map((meta) => (
        <PhaseCard
          key={meta.key}
          phase={phases[meta.key]}
          meta={meta}
          briefId={brief.id}
          api={api}
          onChanged={onPhaseChanged}
        />
      ))}

      {/* Final approve gate */}
      <Card
        className={`${
          allApproved
            ? "border-emerald-200 bg-emerald-50/30"
            : "border-dashed border-border bg-secondary/20"
        }`}
        data-testid="portal-brief-final-card"
      >
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                Final approval
              </p>
              <h3 className="font-display text-base font-semibold mt-0.5">
                {allApproved
                  ? "Sign off and kick the build off"
                  : "Approve each phase above first"}
              </h3>
            </div>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!allApproved || finalizing}
              size="lg"
              className="text-base px-6"
              data-testid="portal-brief-approve-btn"
            >
              {finalizing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {allApproved ? "Approve Project Brief" : "Locked"}
            </Button>
          </div>
          {!allApproved && (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              The final approve button unlocks once all 3 phases are
              individually approved.
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="portal-brief-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign off on the full project brief?</AlertDialogTitle>
            <AlertDialogDescription>
              Once you approve <strong>{brief.project_name}</strong>:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>The brief locks — no edits to the approved phases.</li>
                <li>The Design phase kicks off automatically.</li>
                <li>
                  Any requests outside the scope of the approved phases may incur
                  new fees at your dedicated team's discretion.
                </li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="portal-brief-confirm-cancel">
              Not yet
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={finalize}
              data-testid="portal-brief-confirm-approve"
            >
              Yes, approve and kick off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Backward-compat named export. The Orders accordion still consumes
// the approved list shape, which is unchanged.
export function ApprovedBriefsAccordion({ briefs }) {
  const [openId, setOpenId] = useState(null);
  if (!Array.isArray(briefs) || briefs.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="portal-approved-briefs">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mt-2">
        Approved briefs
      </p>
      {briefs.map((b) => {
        const open = openId === b.id;
        return (
          <Card key={b.id} className="border-emerald-200">
            <CardContent className="p-3.5">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : b.id)}
                className="w-full flex items-center justify-between gap-2 text-left"
              >
                <div>
                  <p className="font-display text-sm font-medium">{b.project_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Approved {b.approved_at ? new Date(b.approved_at).toLocaleDateString() : "—"}
                  </p>
                </div>
                {open ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {open && (
                <div className="mt-3 space-y-3 border-t border-border pt-3">
                  {PHASES.map((m) => {
                    const p = b.phase_summaries?.[m.key];
                    if (!p?.summary) return null;
                    return (
                      <div key={m.key}>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                          Phase {m.num} · {m.label}
                        </p>
                        <div className="bg-white border border-border rounded p-2.5">
                          <RichTextEditor value={p.summary} readOnly />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
