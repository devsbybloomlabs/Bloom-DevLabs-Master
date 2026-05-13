/**
 * TodaysCoachingCard — admin dashboard widget.
 *
 * Surfaces the 3 prospects most likely to close this week so the founder
 * never lets a deal go cold. Each card has stage + days-stale + AI-suggested
 * next action; clicking jumps straight into the Pipeline drawer for that
 * prospect.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  TrendingUp,
  ArrowRight,
  Loader2,
  Clock,
  RefreshCw,
} from "lucide-react";

const STAGE_TONE = {
  new: { label: "New", color: "bg-slate-100 text-slate-700" },
  contacted: { label: "Contacted", color: "bg-blue-100 text-blue-800" },
  qualified: { label: "Qualified", color: "bg-amber-100 text-amber-800" },
  proposal: { label: "Proposal", color: "bg-violet-100 text-violet-800" },
};

function fmtMoney(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return null;
  return `$${n.toLocaleString()}`;
}

function staleTone(days) {
  if (days < 2) return "text-emerald-600";
  if (days < 5) return "text-amber-600";
  return "text-rose-600";
}

function initialsFor(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function TodaysCoachingCard() {
  const api = useAdminApi();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setRefreshing(true);
      try {
        const r = await api.get("/pipeline/coaching/today?limit=3");
        setItems(r.data?.items || []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Card className="border-border" data-testid="coaching-card-loading">
        <CardContent className="p-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Picking today's hottest moves…
        </CardContent>
      </Card>
    );
  }

  if (!items.length) return null;

  return (
    <Card
      className="border-primary/15 bg-gradient-to-br from-blue-50/40 via-white to-violet-50/30 overflow-hidden"
      data-testid="coaching-card"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-display flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Today's coaching
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing}
            className="h-7 px-2 text-xs"
            data-testid="coaching-card-refresh"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </CardTitle>
        <p className="text-xs text-muted-foreground -mt-0.5">
          3 deals most likely to close this week — don't let them go cold.
        </p>
      </CardHeader>
      <CardContent className="pt-1 space-y-2">
        {items.map((p, idx) => {
          const stage = STAGE_TONE[p.status] || STAGE_TONE.new;
          const value = fmtMoney(p.deal_value);
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => navigate(`/admin/pipeline?focus=${p.id}`)}
              className="w-full text-left rounded-lg border border-border bg-background p-3 hover:shadow-md hover:border-primary/40 transition-all"
              data-testid={`coaching-item-${idx}`}
            >
              <div className="flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">
                  {initialsFor(p.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    {value && (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 tabular-nums shrink-0">
                        {value}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                    <Badge className={stage.color} variant="outline">
                      {stage.label}
                    </Badge>
                    {p.company && (
                      <span className="text-muted-foreground truncate">{p.company}</span>
                    )}
                    <span
                      className={`inline-flex items-center gap-0.5 ${staleTone(
                        p.days_stale
                      )}`}
                      title="Days since last activity"
                    >
                      <Clock className="h-2.5 w-2.5" />
                      {p.days_stale < 1
                        ? "today"
                        : `${Math.round(p.days_stale)}d stale`}
                    </span>
                  </div>
                  {p.next_action && (
                    <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-2 py-1 mt-1.5 line-clamp-2 inline-flex items-start gap-1">
                      <ArrowRight className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{p.next_action}</span>
                    </p>
                  )}
                </div>
                <TrendingUp className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
