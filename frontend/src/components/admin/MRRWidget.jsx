import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  CircleDollarSign,
  Clock,
  AlertTriangle,
  CalendarClock,
  ArrowRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  useAgencyHandyResource,
  formatMoney,
} from "@/lib/agencyhandy";

const KIND_META = {
  proposal_follow_up: { label: "Follow up", icon: Clock, accent: "text-amber-600" },
  renewal_check_in: { label: "Renewal", icon: CalendarClock, accent: "text-[#3B82F6]" },
  collect_overdue: { label: "Collect", icon: AlertTriangle, accent: "text-rose-600" },
};

/**
 * Compact MRR + Revenue Actions widget for the dashboard home.
 * Shows MRR with MoM delta, plus top 3 revenue-driving actions for today.
 */
export default function MRRWidget() {
  const summary = useAgencyHandyResource("/summary");
  const actions = useAgencyHandyResource("/revenue-actions");

  if (summary.loading && !summary.data) {
    return <Skeleton className="h-44" data-testid="mrr-widget-loading" />;
  }

  if (summary.error && !summary.data) {
    return null; // silently skip if AH offline; dashboard still works
  }

  const sd = summary.data || {};
  const currency = sd.currency || "USD";
  const mrr = sd.mrr || {};
  const props = sd.proposals || {};
  const acts = (actions.data?.actions || []).slice(0, 3);
  const delta = mrr.mom_delta_pct;
  const TrendIcon = delta == null ? null : delta >= 0 ? TrendingUp : TrendingDown;

  return (
    <Card className="border-border" data-testid="mrr-widget">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <CircleDollarSign className="h-4 w-4 text-emerald-600" />
          Revenue snapshot
          <Badge variant="outline" className="text-[10px] font-normal h-5 px-1.5">
            Agency Handy
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* MRR + KPIs row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              MRR
            </div>
            <div className="font-display text-xl font-semibold tabular-nums">
              {formatMoney(mrr.total, currency)}
            </div>
            {delta != null && TrendIcon && (
              <div
                className={`text-[11px] mt-0.5 inline-flex items-center gap-0.5 ${
                  delta >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                <TrendIcon className="h-3 w-3" />
                {delta >= 0 ? "+" : ""}
                {delta}% MoM
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Active subs
            </div>
            <div className="font-display text-xl font-semibold tabular-nums">
              {mrr.active_subscriptions || 0}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              ARR ≈ {formatMoney(mrr.arr, currency)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Proposals
            </div>
            <div className="font-display text-xl font-semibold tabular-nums">
              {props.pending || 0}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">pending</div>
          </div>
        </div>

        {/* Revenue actions */}
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-2">
            Today's revenue actions
          </div>
          {acts.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-2">
              No urgent revenue actions — you're caught up.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {acts.map((a, idx) => {
                const meta = KIND_META[a.kind] || {
                  label: "Action",
                  icon: ArrowRight,
                  accent: "text-[#3B82F6]",
                };
                const Icon = meta.icon;
                return (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-sm border border-border rounded-lg px-3 py-2"
                    data-testid={`mrr-action-${idx}`}
                  >
                    <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${meta.accent}`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{a.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{a.detail}</div>
                    </div>
                    {a.value && (
                      <div className="text-xs tabular-nums text-muted-foreground flex-shrink-0">
                        {formatMoney(a.value, a.currency || currency)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Button
          asChild
          variant="link"
          className="px-0 h-auto text-xs"
          data-testid="mrr-widget-view-revenue"
        >
          <Link to="/admin/revenue">
            View full revenue dashboard <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
