/**
 * AbTestsDashboard — admin landing page for A/B tests.
 * Mounted at /admin/ab-tests.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  FlaskConical,
  TrendingUp,
  Trophy,
  Activity,
  Pause,
  Play,
  Trash2,
  CheckCircle2,
} from "lucide-react";

function StatTile({ icon: Icon, label, value, testid, sub }) {
  return (
    <Card className="border-border" data-testid={testid}>
      <CardContent className="p-5 flex items-start gap-3">
        <div className="rounded-lg bg-[#1E3A8A]/10 p-2.5">
          <Icon className="h-5 w-5 text-[#1E3A8A]" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
          <p className="font-display text-2xl font-semibold mt-0.5">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }) {
  const map = {
    active: "bg-green-100 text-green-800",
    paused: "bg-amber-100 text-amber-800",
    completed: "bg-blue-100 text-blue-800",
    archived: "bg-zinc-100 text-zinc-700",
    draft: "bg-zinc-100 text-zinc-700",
  };
  return (
    <Badge className={`${map[status] || map.draft} border-0 capitalize`} data-testid={`ab-status-${status}`}>
      {status}
    </Badge>
  );
}

export default function AbTestsDashboard() {
  const api = useAdminApi();
  const nav = useNavigate();
  const [summary, setSummary] = useState({
    active_tests: 0,
    tests_this_month: 0,
    avg_conversion_lift_pct: 0,
    best_test: null,
  });
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        api.get("/admin/ab/v2/summary"),
        api.get("/admin/ab/v2"),
      ]);
      setSummary(s.data);
      setTests(t.data);
    } catch (e) {
      toast.error("Failed to load A/B tests");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onAction = async (id, action) => {
    try {
      await api.post(`/admin/ab/v2/${id}/${action}`, {});
      toast.success(`Test ${action}d`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Failed to ${action} test`);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this test and all its events permanently?")) return;
    try {
      await api.delete(`/admin/ab/v2/${id}`);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  const active = tests.filter((t) => ["active", "paused", "draft"].includes(t.status));
  const completed = tests.filter((t) => ["completed", "archived"].includes(t.status));

  return (
    <div className="space-y-8" data-testid="ab-tests-dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">A/B Tests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated variations · auto-detected winners · live conversion tracking.
          </p>
        </div>
        <Button
          onClick={() => nav("/admin/ab-tests/new")}
          className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
          data-testid="ab-add-test-button"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Page for A/B Test
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Activity}
          label="Active Tests"
          value={summary.active_tests}
          testid="ab-stat-active"
        />
        <StatTile
          icon={FlaskConical}
          label="Tests This Month"
          value={summary.tests_this_month}
          testid="ab-stat-month"
        />
        <StatTile
          icon={TrendingUp}
          label="Avg Conversion Lift"
          value={`${summary.avg_conversion_lift_pct}%`}
          testid="ab-stat-lift"
        />
        <StatTile
          icon={Trophy}
          label="Top Winner"
          value={summary.best_test ? `+${summary.best_test.lift_pct}%` : "—"}
          sub={summary.best_test?.test_name}
          testid="ab-stat-top"
        />
      </div>

      <section>
        <h2 className="font-display text-lg font-semibold mb-3">Active & Draft</h2>
        {loading ? (
          <Card className="border-border"><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
        ) : active.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-12 text-center" data-testid="ab-empty-active">
              <FlaskConical className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 font-display text-base font-medium">No active tests</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Click "Add Page for A/B Test" to launch your first experiment.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {active.map((t) => (
              <Card key={t.id} className="border-border" data-testid={`ab-row-${t.id}`}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => nav(`/admin/ab-tests/${t.id}`)}
                      className="min-w-0 flex-1 text-left"
                      data-testid={`ab-row-link-${t.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <StatusBadge status={t.status} />
                        <Badge variant="outline" className="text-[10px]">{t.element_type}</Badge>
                        <span className="text-xs text-muted-foreground">{t.page_slug}</span>
                      </div>
                      <p className="mt-1.5 font-display text-base font-medium truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.variants?.length} variants · {t.duration_days} days
                        {t.started_at && ` · started ${new Date(t.started_at).toLocaleDateString()}`}
                      </p>
                    </button>
                    <div className="flex items-center gap-1">
                      {t.status === "draft" && (
                        <Button size="sm" variant="ghost" onClick={() => onAction(t.id, "launch")} data-testid={`ab-launch-${t.id}`}>
                          <Play className="h-4 w-4 text-green-700" />
                        </Button>
                      )}
                      {t.status === "active" && (
                        <Button size="sm" variant="ghost" onClick={() => onAction(t.id, "pause")} data-testid={`ab-pause-${t.id}`}>
                          <Pause className="h-4 w-4 text-amber-700" />
                        </Button>
                      )}
                      {t.status === "paused" && (
                        <Button size="sm" variant="ghost" onClick={() => onAction(t.id, "launch")} data-testid={`ab-resume-${t.id}`}>
                          <Play className="h-4 w-4 text-green-700" />
                        </Button>
                      )}
                      {(t.status === "active" || t.status === "paused") && (
                        <Button size="sm" variant="ghost" onClick={() => onAction(t.id, "complete")} data-testid={`ab-complete-${t.id}`}>
                          <CheckCircle2 className="h-4 w-4 text-blue-700" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => onDelete(t.id)} data-testid={`ab-delete-${t.id}`}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {completed.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3">Completed & Archive</h2>
          <div className="grid gap-3">
            {completed.map((t) => (
              <Card key={t.id} className="border-border" data-testid={`ab-archive-${t.id}`}>
                <CardContent className="p-4">
                  <button onClick={() => nav(`/admin/ab-tests/${t.id}`)} className="w-full text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={t.status} />
                      <Badge variant="outline" className="text-[10px]">{t.element_type}</Badge>
                      <span className="text-xs text-muted-foreground">{t.page_slug}</span>
                      {t.winner_variant_key && (
                        <Badge className="bg-amber-100 text-amber-900 border-0 text-[10px]">
                          <Trophy className="h-3 w-3 mr-1" />Winner declared
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1.5 font-display text-base font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Completed {t.completed_at && new Date(t.completed_at).toLocaleDateString()}
                      {t.p_value !== null && t.p_value !== undefined && ` · p=${t.p_value}`}
                    </p>
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
