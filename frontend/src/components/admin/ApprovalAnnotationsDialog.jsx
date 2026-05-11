/**
 * ApprovalAnnotationsDialog — live annotation preview for a design approval.
 *
 * Calls GET /api/admin/approvals/{id}/annotations which proxies to Approval
 * Studio's list_comments. In mock mode the backend returns a deterministic
 * thread so the UI remains useful before live credentials are wired.
 */
import { useEffect, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, CheckCircle2, Circle } from "lucide-react";

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ApprovalAnnotationsDialog({ approvalId, open, onClose }) {
  const api = useAdminApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !approvalId) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const r = await api.get(`/admin/approvals/${approvalId}/annotations`);
        if (!cancel) setData(r.data);
      } catch {
        if (!cancel) setData(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, approvalId, api]);

  const comments = data?.comments || [];
  const resolvedCount = comments.filter((c) => c.resolved).length;
  const openCount = comments.length - resolvedCount;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-xl max-h-[80vh] overflow-hidden flex flex-col"
        data-testid="approval-annotations-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-[#1E3A8A]" />
            Live annotation feed
          </DialogTitle>
          <DialogDescription>
            Approval Studio comments pulled in real-time.
            {data?.aps_mode === "mock" && (
              <span className="ml-1">
                Currently in <code className="text-[10px] px-1 py-0.5 rounded bg-secondary">mock</code> mode
                — showing synthetic thread.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 px-6 pb-2 -mt-2 text-xs">
          <Badge className="bg-emerald-100 text-emerald-900 border-0">
            {resolvedCount} resolved
          </Badge>
          <Badge className="bg-amber-100 text-amber-900 border-0">
            {openCount} open
          </Badge>
        </div>

        <div className="overflow-y-auto flex-1 -mx-6 px-6 pb-3">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No annotations yet.
            </div>
          ) : (
            <ol className="relative border-l border-border ml-3 space-y-3 mt-2">
              {comments.map((c) => {
                const Icon = c.resolved ? CheckCircle2 : Circle;
                return (
                  <li
                    key={c.id}
                    className="pl-5 relative"
                    data-testid={`annotation-${c.id}`}
                  >
                    <span
                      className={`absolute -left-2 top-1 h-4 w-4 rounded-full ${
                        c.resolved ? "bg-emerald-100" : "bg-amber-100"
                      } flex items-center justify-center ring-2 ring-background`}
                    >
                      <Icon
                        className={`h-2.5 w-2.5 ${
                          c.resolved ? "text-emerald-700" : "text-amber-700"
                        }`}
                      />
                    </span>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{c.author}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
                        {fmtTime(c.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80 mt-1">{c.text}</p>
                    {c.anchor && (
                      <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                        anchor: {c.anchor.x}%, {c.anchor.y}%
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
