/**
 * AbTestDetail — per-test results page.
 * Mounted at /admin/ab-tests/:testId.
 */
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  ChevronLeft,
  Trophy,
  Pause,
  Play,
  CheckCircle2,
  Loader2,
  Trash2,
} from "lucide-react";

const VARIANT_COLORS = ["#1E3A8A", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6", "#06B6D4"];

function StatRow({ row, color, isControl, controlConv }) {
  return (
    <tr className="border-t border-border" data-testid={`ab-detail-row-${row.variant_key}`}>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-medium text-sm">{row.label}</span>
          {isControl && <Badge variant="outline" className="text-[10px]">Control</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-1 max-w-md truncate" title={row.content}>{row.content}</p>
      </td>
      <td className="px-3 py-3 text-right text-sm tabular-nums">{row.page_views}</td>
      <td className="px-3 py-3 text-right text-sm tabular-nums">{(row.ctr * 100).toFixed(2)}%</td>
      <td className="px-3 py-3 text-right text-sm tabular-nums">{(row.conversion_rate * 100).toFixed(2)}%</td>
      <td className="px-3 py-3 text-right text-sm tabular-nums">{row.avg_session_seconds.toFixed(0)}s</td>
      <td className="px-3 py-3 text-right text-sm tabular-nums">
        {isControl ? (
          <span className="text-muted-foreground">—</span>
        ) : row.lift_pct > 0 ? (
          <span className="text-green-700 font-medium">+{row.lift_pct.toFixed(1)}%</span>
        ) : row.lift_pct < 0 ? (
          <span className="text-red-700 font-medium">{row.lift_pct.toFixed(1)}%</span>
        ) : (
          <span className="text-muted-foreground">0%</span>
        )}
      </td>
      <td className="px-3 py-3 text-right text-sm tabular-nums">
        {isControl ? (
          <span className="text-muted-foreground">—</span>
        ) : row.p_value === null || row.p_value === undefined ? (
          <span className="text-muted-foreground">—</span>
        ) : row.p_value <= 0.05 ? (
          <Badge className="bg-green-100 text-green-800 border-0 text-[10px]">
            <Trophy className="h-3 w-3 mr-1" />
            {row.confidence_pct?.toFixed(0)}%
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">{row.confidence_pct?.toFixed(0)}%</span>
        )}
      </td>
    </tr>
  );
}

export default function AbTestDetail() {
  const api = useAdminApi();
  const nav = useNavigate();
  const { testId } = useParams();
  const [test, setTest] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([
        api.get(`/admin/ab/v2/${testId}`),
        api.get(`/admin/ab/v2/${testId}/stats`),
      ]);
      setTest(t.data);
      setStats(s.data);
    } catch (e) {
      toast.error("Failed to load test");
    } finally {
      setLoading(false);
    }
  }, [api, testId]);

  useEffect(() => {
    load();
  }, [load]);

  const onAction = async (action) => {
    try {
      await api.post(`/admin/ab/v2/${testId}/${action}`, {});
      toast.success(`Test ${action}d`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    }
  };

  const onApplyWinner = async () => {
    if (!window.confirm("Mark the winning variation as the new control and archive this test?")) return;
    try {
      const r = await api.post(`/admin/ab/v2/${testId}/apply-winner`, {});
      toast.success("Winner recorded — see instructions");
      alert(
        `Winning copy for ${r.data.element_key}:\n\n"${r.data.winning_content}"\n\n${r.data.instructions}`
      );
      nav("/admin/ab-tests");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to apply winner");
    }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this test permanently?")) return;
    try {
      await api.delete(`/admin/ab/v2/${testId}`);
      toast.success("Deleted");
      nav("/admin/ab-tests");
    } catch {
      toast.error("Delete failed");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!test || !stats) {
    return <div className="text-sm text-muted-foreground">Test not found.</div>;
  }

  const controlKey = stats.control_key;
  const winnerKey = test.winner_variant_key;
  const variantKeys = (test.variants || []).map((v) => v.key);

  return (
    <div className="space-y-6" data-testid="ab-test-detail">
      <button
        onClick={() => nav("/admin/ab-tests")}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        data-testid="ab-detail-back"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to dashboard
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className={
              test.status === "active" ? "bg-green-100 text-green-800 border-0" :
              test.status === "paused" ? "bg-amber-100 text-amber-800 border-0" :
              test.status === "completed" ? "bg-blue-100 text-blue-800 border-0" :
              "bg-zinc-100 text-zinc-700 border-0"
            }>
              {test.status}
            </Badge>
            <Badge variant="outline" className="text-[10px]">{test.element_type}</Badge>
            <code className="text-xs text-muted-foreground">{test.element_key}</code>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">{test.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">{test.page_slug}</p>
        </div>
        <div className="flex items-center gap-2">
          {test.status === "active" && (
            <Button variant="outline" size="sm" onClick={() => onAction("pause")} data-testid="ab-detail-pause">
              <Pause className="h-4 w-4 mr-1" /> Pause
            </Button>
          )}
          {test.status === "paused" && (
            <Button variant="outline" size="sm" onClick={() => onAction("launch")} data-testid="ab-detail-resume">
              <Play className="h-4 w-4 mr-1" /> Resume
            </Button>
          )}
          {(test.status === "active" || test.status === "paused") && (
            <Button variant="outline" size="sm" onClick={() => onAction("complete")} data-testid="ab-detail-complete">
              <CheckCircle2 className="h-4 w-4 mr-1" /> Complete
            </Button>
          )}
          {winnerKey && test.status !== "archived" && (
            <Button onClick={onApplyWinner} className="bg-amber-600 hover:bg-amber-700 text-white" size="sm" data-testid="ab-detail-apply-winner">
              <Trophy className="h-4 w-4 mr-1" /> Apply winner
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDelete} data-testid="ab-detail-delete">
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {test.started_at && (
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>
                Started {new Date(test.started_at).toLocaleDateString()}
                {test.ends_at && ` · ends ${new Date(test.ends_at).toLocaleDateString()}`}
              </span>
              <span>
                {stats.pct_complete}% complete · {stats.days_remaining} days left
              </span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-[#1E3A8A] transition-all" style={{ width: `${stats.pct_complete}%` }} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hypothesis */}
      {test.hypothesis && (
        <Card className="border-border bg-secondary/30">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">Hypothesis</p>
            <p className="text-sm">{test.hypothesis}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats table */}
      <Card className="border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="ab-detail-stats-table">
            <thead className="bg-secondary/50">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variant</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sessions</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">CTR</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conv. Rate</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avg Session</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lift</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Significance</th>
              </tr>
            </thead>
            <tbody>
              {stats.per_variant.map((row, i) => (
                <StatRow
                  key={row.variant_key}
                  row={row}
                  color={VARIANT_COLORS[i % VARIANT_COLORS.length]}
                  isControl={row.variant_key === controlKey}
                  controlConv={stats.per_variant[0]?.conversion_rate || 0}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Trend chart */}
      {stats.daily.length > 0 && (
        <Card className="border-border">
          <CardContent className="p-5">
            <p className="font-medium mb-3">Conversion rate over time</p>
            <div className="h-72" data-testid="ab-detail-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip />
                  <Legend />
                  {variantKeys.map((vkey, i) => {
                    const row = stats.per_variant.find((r) => r.variant_key === vkey);
                    return (
                      <Line
                        key={vkey}
                        type="monotone"
                        dataKey={vkey}
                        stroke={VARIANT_COLORS[i % VARIANT_COLORS.length]}
                        name={row?.label || vkey}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Winner banner */}
      {test.status === "completed" && (
        <Card className={`border-2 ${winnerKey ? "border-amber-400 bg-amber-50" : "border-zinc-300 bg-zinc-50"}`}>
          <CardContent className="p-5">
            {winnerKey ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="h-5 w-5 text-amber-600" />
                  <p className="font-display text-lg font-semibold">Winner declared</p>
                </div>
                <p className="text-sm">
                  <span className="font-medium">{test.variants.find((v) => v.key === winnerKey)?.label}</span> beat
                  control with p = {test.p_value} ({((1 - test.p_value) * 100).toFixed(0)}% confidence).
                </p>
              </div>
            ) : (
              <div>
                <p className="font-display text-lg font-semibold">Inconclusive</p>
                <p className="text-sm text-muted-foreground mt-1">
                  None of the variations beat the control with statistical significance (p ≤ 0.05).
                  Consider running for longer or testing a more distinct variation.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
