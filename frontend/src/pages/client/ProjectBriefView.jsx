/**
 * ProjectBriefView — client-portal "Project Brief" tab.
 *
 * Visible when a pending brief exists (`status === sent_for_approval`).
 * Renders the 3 phase summaries inside an elegant scannable layout
 * with a single big Approve button at the bottom. Once approved the
 * tab disappears (parent gates rendering by `?tab=brief` AND pending).
 *
 * Approved briefs are shown by `ApprovedBriefsAccordion` (used inside
 * the Orders tab) — see component below.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { CheckCircle2, FileText, Sparkles, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

const PHASE_META = {
  phase1: { label: "Design Language", num: 1, accent: "border-l-pink-500" },
  phase2: { label: "Function & Features", num: 2, accent: "border-l-blue-500" },
  phase3: { label: "Company, Goals & Plan", num: 3, accent: "border-l-emerald-500" },
};

export default function ProjectBriefView({ brief, api, onApproved }) {
  const [approving, setApproving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!brief) return null;

  const filledPhases = ["phase1", "phase2", "phase3"].filter(
    (k) => brief.phase_summaries?.[k]?.summary
  );

  const approve = async () => {
    setConfirmOpen(false);
    setApproving(true);
    try {
      await api.post(`/clients/me/briefs/${brief.id}/approve`);
      toast.success("Brief approved — the team has been notified");
      onApproved?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Approval failed");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="portal-brief-view">
      {/* Hero */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-white to-blue-50 p-6 sm:p-8">
        <Badge
          variant="outline"
          className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] uppercase tracking-wider mb-3"
        >
          <Sparkles className="h-3 w-3 mr-1" />
          Awaiting your approval
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-display font-bold mb-2">
          {brief.project_name}
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          We've put your onboarding answers through our brief writer.
          Below is what we heard, what we're building, and how — in plain
          English. Read it through and approve when ready. Anything off?
          Just reply to the email and we'll iterate.
        </p>
      </div>

      {/* Phase summaries */}
      <div className="space-y-4">
        {filledPhases.length === 0 && (
          <Card className="border-rose-200 bg-rose-50">
            <CardContent className="p-4 flex items-center gap-2 text-sm text-rose-900">
              <AlertCircle className="h-4 w-4 shrink-0" />
              No phase summaries on this brief yet — your project team should
              be along shortly.
            </CardContent>
          </Card>
        )}
        {filledPhases.map((key) => {
          const meta = PHASE_META[key];
          return (
            <Card
              key={key}
              className={`border-l-4 ${meta.accent}`}
              data-testid={`portal-brief-phase-${key}`}
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    Section {meta.num}
                  </Badge>
                  <p className="font-display font-medium">{meta.label}</p>
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {brief.phase_summaries[key].summary}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Approve CTA */}
      {filledPhases.length > 0 && (
        <div className="rounded-2xl border-2 border-primary/30 bg-white p-6 sm:p-8 text-center space-y-4">
          <CheckCircle2 className="h-10 w-10 mx-auto text-primary" />
          <h2 className="font-display text-xl font-semibold">
            Ready to approve?
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Approving locks the brief and kicks off the Design phase. You can
            always reach the team via the Contact tab for tweaks during the build.
          </p>
          <Button
            size="lg"
            onClick={() => setConfirmOpen(true)}
            disabled={approving}
            className="text-base px-8 py-6"
            data-testid="portal-brief-approve-btn"
          >
            {approving ? "Approving…" : "Approve project brief"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Stamped with your email + the exact UTC timestamp.
          </p>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="portal-brief-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this brief?</AlertDialogTitle>
            <AlertDialogDescription>
              Once you approve the project brief for{" "}
              <strong>{brief.project_name}</strong>, we'll lock it and kick off
              the Design phase. You can still reach the team via the Support
              tab for any tweaks during the build.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="portal-brief-confirm-cancel">
              Not yet
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={approve}
              data-testid="portal-brief-confirm-approve"
            >
              Yes, approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* --- Approved briefs accordion (used inside Orders tab) --- */
export function ApprovedBriefsAccordion({ briefs }) {
  const [openId, setOpenId] = useState(null);
  if (!Array.isArray(briefs) || briefs.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="portal-approved-briefs">
      <p className="text-xs uppercase tracking-wider text-muted-foreground mt-2">
        Approved project briefs
      </p>
      {briefs.map((b) => {
        const isOpen = openId === b.id;
        return (
          <Card key={b.id} className="border-border" data-testid={`portal-approved-brief-${b.id}`}>
            <CardContent className="p-0">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : b.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-secondary/40 transition-colors"
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{b.project_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Approved{" "}
                    {b.approved_at
                      ? new Date(b.approved_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                    {b.approved_by_email ? ` by ${b.approved_by_email}` : ""}
                  </p>
                </div>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>
              {isOpen && (
                <div className="border-t border-border px-4 pb-5 pt-3 space-y-3">
                  {["phase1", "phase2", "phase3"].map((k) => {
                    const meta = PHASE_META[k];
                    const text = b.phase_summaries?.[k]?.summary;
                    if (!text) return null;
                    return (
                      <div key={k} className="text-sm">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                          {meta.label}
                        </p>
                        <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
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
