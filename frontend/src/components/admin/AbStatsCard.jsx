/**
 * AbStatsCard — Admin embedded card showing /tour CTA-position A/B test results.
 * Pulled inline into IntegrationsAdmin or dropped on the Dashboard.
 */
import { useEffect, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, TrendingUp } from "lucide-react";

const COLORS = {
  header: "bg-[#1E3A8A] text-white",
  hero: "bg-violet-600 text-white",
  sticky: "bg-rose-600 text-white",
};

export default function AbStatsCard({ experiment = "tour_cta_position" }) {
  const api = useAdminApi();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await api.get(`/admin/ab/${experiment}/stats`);
        if (!cancel) setStats(r.data);
      } catch {
        if (!cancel) setStats({ variants: [], totals: {} });
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [api, experiment]);

  if (loading) {
    return (
      <Card className="border-border" data-testid="ab-stats-loading">
        <CardContent className="p-4">
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const winner =
    (stats?.variants || []).reduce(
      (best, v) => (!best || v.ctr > best.ctr ? v : best),
      null
    );

  return (
    <Card className="border-border" data-testid="ab-stats-card">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-[#1E3A8A]" />
          A/B test · CTA position on <code className="text-xs">/tour</code>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {stats.totals.unique_visitors || 0} unique visitors ·{" "}
          {stats.totals.cta_clicks || 0} CTA clicks
        </p>
      </CardHeader>
      <CardContent>
        {(stats.variants || []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-3">
            No data yet — share <code className="text-xs">/tour</code> to get
            traffic flowing.
          </div>
        ) : (
          <div className="space-y-2">
            {stats.variants.map((v) => {
              const isWinner = winner?.variant === v.variant && v.cta_clicks > 0;
              return (
                <div
                  key={v.variant}
                  className="rounded-lg border border-border p-3 flex flex-wrap items-center justify-between gap-3"
                  data-testid={`ab-variant-${v.variant}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge
                      className={`${COLORS[v.variant] || "bg-slate-200 text-slate-900"} border-0 capitalize`}
                    >
                      {v.variant}
                    </Badge>
                    {isWinner && (
                      <Badge className="bg-emerald-100 text-emerald-900 border-0 text-[10px]">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        Winning
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs tabular-nums">
                    <span className="text-muted-foreground">
                      {v.unique_impressions} impressions
                    </span>
                    <span className="text-muted-foreground">
                      {v.unique_clicks} clicks
                    </span>
                    <span className="font-display text-sm font-semibold">
                      CTR {(v.ctr * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
