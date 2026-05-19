/**
 * WarmLeadRevenueWidget — surfaces SUM(tier_price) of captured-but-not-
 * converted warm leads (i.e., visitors who left email at the checkout
 * gate but never paid). This is "fold the rest of your pipeline" money.
 *
 * Data: GET /api/admin/leads/warm/revenue-stats
 */
import { useCallback, useEffect, useState } from "react";
import { authClient, useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Flame, ArrowRight, Users, TrendingUp } from "lucide-react";

const NICHE_LABELS = {
  gym: "Gym Owners",
  gym_owners: "Gym Owners",
  coaches: "Coaches",
  "real-estate": "Real Estate",
  realestate: "Real Estate",
  unknown: "Unknown",
};

export default function WarmLeadRevenueWidget() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const api = authClient(token);
      const r = await api.get("/admin/leads/warm/revenue-stats");
      setData(r.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <Skeleton className="h-44 w-full" data-testid="warm-lead-widget-loading" />;
  }
  if (!data) return null;

  const total = Number(data.total_pipeline_usd || 0);
  const leadsCount = Number(data.total_leads || 0);
  const niches = Object.entries(data.by_niche || {})
    .map(([k, v]) => ({ key: k, ...v }))
    .sort((a, b) => (b.pipeline_usd || 0) - (a.pipeline_usd || 0));

  return (
    <Card
      className="border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50"
      data-testid="warm-lead-revenue-widget"
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <Flame className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-amber-700 font-semibold">
                Warm-lead pipeline
              </p>
              <h3 className="font-display text-sm font-medium text-slate-700">
                Captured but not converted
              </h3>
            </div>
          </div>
          <Link to="/admin/warm-leads">
            <Button variant="ghost" size="sm" data-testid="warm-lead-widget-cta">
              View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div>
            <p className="font-display text-3xl sm:text-4xl font-semibold tabular-nums text-slate-900">
              ${total.toLocaleString()}
            </p>
            <p className="text-xs text-slate-600 mt-1">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {leadsCount} {leadsCount === 1 ? "lead" : "leads"}
              </span>{" "}
              · re-engageable revenue
            </p>
          </div>
          {niches.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium inline-flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                By niche
              </p>
              {niches.slice(0, 3).map((n) => (
                <div
                  key={n.key}
                  className="flex items-center justify-between text-xs"
                  data-testid={`warm-lead-widget-niche-${n.key}`}
                >
                  <span className="text-slate-700">{NICHE_LABELS[n.key] || n.key}</span>
                  <span className="tabular-nums text-slate-900 font-medium">
                    ${Number(n.pipeline_usd || 0).toLocaleString()}
                    <span className="text-slate-400 font-normal ml-1.5">({n.count})</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {total === 0 && (
          <p className="text-xs text-slate-500 italic mt-4" data-testid="warm-lead-widget-empty">
            No abandoned-checkout leads yet — once visitors enter email at the niche checkout gate, you'll see them here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
