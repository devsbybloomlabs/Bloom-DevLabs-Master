/**
 * EscalationTimelineDialog
 *
 * Renders a chronological timeline of every event tied to a support escalation:
 *   • ThriveDesk webhook receipt + verification
 *   • Classification + Nifty task creation outcome
 *   • Slack alert / admin notification fallback
 *   • Manual replies and final resolution
 *
 * Also shows live ThriveDesk conversation thread when the API key has
 * conversation-scope (currently public-scope JWTs return scope_limited).
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
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Webhook,
  CheckCheck,
  MessageSquare,
} from "lucide-react";

const ICON_MAP = {
  alert: AlertTriangle,
  check: CheckCircle2,
  error: XCircle,
  info: Info,
  webhook: Webhook,
  check_circle: CheckCheck,
};

const ICON_COLOR = {
  alert: "bg-rose-100 text-rose-700",
  check: "bg-emerald-100 text-emerald-700",
  error: "bg-rose-100 text-rose-700",
  info: "bg-blue-100 text-blue-700",
  webhook: "bg-violet-100 text-violet-700",
  check_circle: "bg-emerald-100 text-emerald-700",
};

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

export default function EscalationTimelineDialog({ escalationId, open, onClose }) {
  const api = useAdminApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !escalationId) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const r = await api.get(`/admin/support-triage/${escalationId}/timeline`);
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
  }, [escalationId, open, api]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        data-testid="escalation-timeline-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-[#1E3A8A]" />
            Escalation timeline
          </DialogTitle>
          <DialogDescription>
            {data?.escalation
              ? `${data.escalation.subject} · ${data.escalation.client_name}`
              : "Every touchpoint in the ThriveDesk → Nifty loop"}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          {loading ? (
            <div className="space-y-3 py-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !data ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No timeline data.
            </div>
          ) : (
            <div className="py-3">
              {/* Escalation summary card */}
              <div className="rounded-xl border border-border bg-secondary/30 p-3 mb-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge className="bg-[#1E3A8A] text-white border-0">
                    {data.escalation.escalation_type?.toUpperCase()}
                  </Badge>
                  <Badge variant="outline">{data.escalation.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Ticket {data.escalation.ticket_id}
                  </span>
                </div>
                <div className="text-sm font-medium">{data.escalation.subject}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.escalation.client_name}
                  {data.escalation.client_email && ` · ${data.escalation.client_email}`}
                </div>
              </div>

              {/* Vertical event timeline */}
              <ol className="relative border-l border-border/70 ml-3 space-y-4">
                {data.events.length === 0 ? (
                  <li className="text-sm text-muted-foreground pl-6">
                    No events recorded yet.
                  </li>
                ) : (
                  data.events.map((ev, idx) => {
                    const Icon = ICON_MAP[ev.icon] || Info;
                    const iconColor = ICON_COLOR[ev.icon] || ICON_COLOR.info;
                    return (
                      <li
                        key={`${ev.kind}-${idx}`}
                        className="pl-6 relative"
                        data-testid={`timeline-event-${ev.kind}`}
                      >
                        <span
                          className={`absolute -left-3 top-0.5 h-6 w-6 rounded-full ${iconColor} flex items-center justify-center ring-2 ring-background`}
                        >
                          <Icon className="h-3 w-3" />
                        </span>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="text-sm font-medium">{ev.title}</div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
                            {ev.actor} · {fmtTime(ev.at)}
                          </div>
                        </div>
                        {ev.body && (
                          <pre className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-words font-sans">
                            {ev.body}
                          </pre>
                        )}
                      </li>
                    );
                  })
                )}
              </ol>

              {/* Live ThriveDesk thread (only if API key has scope) */}
              {data.live_thread && (
                <div className="mt-5 pt-4 border-t border-border">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground mb-2">
                    Live ThriveDesk thread
                  </div>
                  <pre className="text-xs bg-secondary/40 rounded-lg p-3 whitespace-pre-wrap break-words font-sans max-h-48 overflow-y-auto">
                    {JSON.stringify(data.live_thread, null, 2)}
                  </pre>
                </div>
              )}

              {/* Scope-limited note */}
              {!data.live_thread && data.td_mode === "live" && (
                <div className="mt-5 pt-4 border-t border-border">
                  <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <strong>Heads-up:</strong> Your ThriveDesk JWT has the
                    <code className="mx-1 px-1 py-0.5 rounded bg-white text-[10px]">public</code>
                    scope — live conversation threads aren&apos;t exposed.
                    Replies + status updates fall back to mock log.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
