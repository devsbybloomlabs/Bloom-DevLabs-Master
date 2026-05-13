/**
 * TeamActivityWidget — "team is heads-down right now" live indicator.
 *
 * Renders inside the client portal's Milestones tab. Pulls aggregated
 * Project Mode task counts + the 5 most-recent task updates. Hides
 * completely when the client has zero PM activity (no spam).
 */
import { useEffect, useState, useCallback } from "react";
import { Activity, Clock, CheckCircle2, Eye, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const STATUS_LABEL = {
  todo: "Queued",
  in_progress: "In progress",
  review: "In review",
  blocked: "Blocked",
  done: "Done",
};

const STATUS_DOT = {
  todo: "bg-slate-400",
  in_progress: "bg-blue-500",
  review: "bg-amber-500",
  blocked: "bg-rose-500",
  done: "bg-emerald-500",
};

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function TeamActivityWidget({ api }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const r = await api.get("/clients/me/team-activity");
      setData(r.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
    // Refresh every 30s while the tab is mounted — gives a live feel without
    // hammering the API.
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return (
      <Card className="border-border bg-white/60" data-testid="team-activity-widget-loading">
        <CardContent className="p-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Checking on the team…
        </CardContent>
      </Card>
    );
  }

  // No PM activity wired yet → hide entirely. Don't show empty noise to the client.
  if (!data?.has_activity) return null;

  const { counts, active_count, completed_this_week, recent } = data;
  return (
    <Card
      className="border-primary/20 bg-gradient-to-br from-blue-50/60 via-white to-emerald-50/50 overflow-hidden"
      data-testid="team-activity-widget"
    >
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </div>
          <p className="text-xs uppercase tracking-[0.15em] font-semibold text-emerald-700">
            Team is heads-down
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <Stat
            value={counts.in_progress}
            label="In progress"
            Icon={Activity}
            color="text-blue-600"
            testid="team-stat-in-progress"
          />
          <Stat
            value={counts.review}
            label="In review"
            Icon={Eye}
            color="text-amber-600"
            testid="team-stat-review"
          />
          <Stat
            value={completed_this_week}
            label="Shipped this wk"
            Icon={CheckCircle2}
            color="text-emerald-600"
            testid="team-stat-shipped"
          />
        </div>

        {counts.blocked > 0 && (
          <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 mb-4">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>
              {counts.blocked} task{counts.blocked === 1 ? "" : "s"} flagged — we'll surface a note in
              your portal as soon as we have a fix lined up.
            </span>
          </div>
        )}

        {recent.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Latest moves
            </p>
            <ul className="space-y-1.5" data-testid="team-activity-recent">
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2 text-xs"
                  data-testid={`team-activity-item-${r.id}`}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                      STATUS_DOT[r.status] || "bg-slate-300"
                    }`}
                  />
                  <span className="truncate flex-1 text-foreground/85">{r.title}</span>
                  <span className="text-muted-foreground text-[10px] tabular-nums shrink-0">
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                  <span className="text-muted-foreground/70 text-[10px] tabular-nums shrink-0">
                    <Clock className="inline h-2.5 w-2.5 mr-0.5" />
                    {relativeTime(r.updated_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {active_count === 0 && counts.done > 0 && (
          <p className="text-xs text-muted-foreground italic mt-2">
            Nothing actively in flight right now — the team is regrouping for the next sprint.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ value, label, Icon, color, testid }) {
  return (
    <div className="rounded-lg bg-white border border-border p-2.5 text-center" data-testid={testid}>
      <Icon className={`h-3.5 w-3.5 mx-auto mb-0.5 ${color}`} />
      <p className="font-display text-lg font-semibold tabular-nums leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
