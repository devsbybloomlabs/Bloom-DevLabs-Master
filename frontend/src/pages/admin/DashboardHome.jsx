import { useEffect, useState, useMemo } from "react";
import { authClient, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Sparkles,
  Trophy,
  Target,
  TrendingUp,
  CheckCircle2,
  Circle,
  RefreshCw,
  Calendar,
  Loader2,
  Phone,
  Award,
  Mic,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import BlockTimer from "@/components/admin/BlockTimer";
import MRRWidget from "@/components/admin/MRRWidget";

const BLOCK_BG = {
  OUTREACH: "bg-[#3B82F6]/10 text-[#1E3A8A] border-[#3B82F6]/30",
  CONTENT: "bg-emerald-100 text-emerald-900 border-emerald-200",
  CALLS: "bg-amber-100 text-amber-900 border-amber-200",
  CLIENT_MGMT: "bg-purple-100 text-purple-900 border-purple-200",
  LUNCH: "bg-secondary text-foreground border-border",
  CUSTOM: "bg-secondary text-foreground border-border",
};

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </div>
          <Icon className={`h-4 w-4 ${accent || "text-[#3B82F6]"}`} />
        </div>
        <div className="font-display text-2xl font-semibold mt-2 tabular-nums">
          {value}
        </div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function DashboardHome() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/dashboard/home", { timeout: 180000 });
      setData(r.data);
    } catch (e) {
      toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      await api.post("/routine/generate", { force: true }, { timeout: 180000 });
      toast.success("Routine regenerated");
      await load();
    } catch (e) {
      toast.error("Failed to regenerate");
    } finally {
      setRegenerating(false);
    }
  };

  const toggleItem = async (block, item) => {
    try {
      await api.post("/routine/checklist/toggle", {
        block_id: block.id,
        item_id: item.id,
        done: !item.done,
      });
      // optimistic
      setData((d) => {
        if (!d?.routine) return d;
        const r = JSON.parse(JSON.stringify(d));
        for (const b of r.routine.blocks) {
          if (b.id === block.id) {
            for (const c of b.checklist) {
              if (c.id === item.id) c.done = !item.done;
            }
            b.completed = b.checklist.length > 0 && b.checklist.every((c) => c.done);
          }
        }
        return r;
      });
    } catch (e) {
      toast.error("Failed to update task");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" data-testid="dashboard-loading">
        <Skeleton className="h-12 w-1/2" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) {
    return (
      <div data-testid="dashboard-empty" className="text-center text-muted-foreground py-16">
        Couldn&apos;t load dashboard. <Button onClick={load} variant="link">Retry</Button>
      </div>
    );
  }

  const { routine, metric, pipeline, upcoming_calls, credibility, date } = data;
  const trackBadge = {
    ahead: { label: "↑ Ahead of pace", className: "bg-emerald-100 text-emerald-900" },
    on_track: { label: "On track", className: "bg-blue-100 text-blue-900" },
    behind: { label: "↓ Behind pace", className: "bg-amber-100 text-amber-900" },
  }[pipeline.track_status] || { label: "—", className: "" };

  return (
    <div className="space-y-6" data-testid="dashboard-home">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            {new Date(date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-1">
            Hey Ryan — here&apos;s your day.
          </h1>
          {routine?.notes && (
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{routine.notes}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={trackBadge.className}>
            {trackBadge.label}
          </Badge>
          <Button
            onClick={regenerate}
            variant="outline"
            size="sm"
            disabled={regenerating}
            data-testid="dashboard-regenerate-button"
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Regenerate routine
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          icon={Target}
          label="Revenue toward target"
          value={`$${(pipeline.closed_revenue || 0).toLocaleString()}`}
          sub={`of $${pipeline.target.toLocaleString()} — ${pipeline.progress_pct}%`}
        />
        <StatCard
          icon={TrendingUp}
          label="Pipeline value"
          value={`$${(pipeline.pipeline_value || 0).toLocaleString()}`}
          sub={`${(pipeline.by_status?.qualified || 0) + (pipeline.by_status?.proposal || 0)} active deals`}
          accent="text-[#1E3A8A]"
        />
        <StatCard
          icon={Award}
          label="Case studies"
          value={credibility.case_studies}
          sub="Goal: 3+"
          accent="text-emerald-600"
        />
        <StatCard
          icon={Mic}
          label="Testimonials"
          value={credibility.testimonials}
          sub="Goal: 5+"
          accent="text-amber-600"
        />
      </div>

      {/* Block timer + Today's Routine */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <BlockTimer blocks={routine?.blocks || []} />

          {/* MRR + revenue actions snapshot from Agency Handy */}
          <MRRWidget />

          {/* Upcoming calls */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Phone className="h-4 w-4 text-[#3B82F6]" />
                Upcoming today
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {upcoming_calls.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No calls scheduled for today.
                </div>
              ) : (
                <ul className="space-y-2">
                  {upcoming_calls.map((c) => (
                    <li
                      key={c.id}
                      className="text-sm flex items-center justify-between border border-border rounded-lg px-3 py-2"
                    >
                      <div>
                        <div className="font-medium">{c.name}</div>
                        {c.company && (
                          <div className="text-xs text-muted-foreground">{c.company}</div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {c.next_action_at?.slice(11, 16)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Button asChild variant="link" className="px-0 mt-2 h-auto" data-testid="dashboard-view-pipeline">
                <Link to="/admin/pipeline">
                  View pipeline <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Routine */}
        <Card className="lg:col-span-2 border-border" data-testid="dashboard-routine">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#3B82F6]" />
              Today&apos;s routine
              {routine?.generated_by_ai && (
                <Badge variant="outline" className="text-[10px] font-normal h-5 px-1.5">
                  AI
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {(routine?.blocks || []).map((b) => (
              <div
                key={b.id}
                data-testid={`dashboard-block-${b.id}`}
                className={`rounded-xl border ${BLOCK_BG[b.type] || BLOCK_BG.CUSTOM} px-4 py-3`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    <span className="tabular-nums">{b.start}–{b.end}</span>
                    <span className="mx-2">·</span>
                    <span className="uppercase tracking-wider text-[10px] opacity-80">
                      {b.type.replace("_", " ")}
                    </span>
                  </div>
                  {b.completed && (
                    <Badge className="bg-[#16A34A] text-white border-0">Done</Badge>
                  )}
                </div>
                <div className="font-display text-base font-semibold mt-1">{b.title}</div>
                {b.description && (
                  <div className="text-xs opacity-80 mt-1">{b.description}</div>
                )}
                {b.checklist?.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {b.checklist.map((c) => (
                      <li key={c.id} className="flex items-start gap-2 text-sm">
                        <button
                          type="button"
                          onClick={() => toggleItem(b, c)}
                          aria-label={c.done ? "Mark incomplete" : "Mark complete"}
                          data-testid={`block-${b.id}-item-${c.id}-toggle`}
                          className="flex-shrink-0 mt-0.5"
                        >
                          {c.done ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground/60" />
                          )}
                        </button>
                        <span className={c.done ? "line-through opacity-60" : ""}>
                          {c.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
