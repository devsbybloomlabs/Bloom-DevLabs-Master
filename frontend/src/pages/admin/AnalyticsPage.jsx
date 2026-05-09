import { useEffect, useMemo, useState } from "react";
import { authClient, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function AnalyticsPage() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [week, setWeek] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [w, p, t] = await Promise.all([
        api.get("/metrics/week"),
        api.get("/pipeline/summary"),
        api.get("/metrics/today"),
      ]);
      setWeek(w.data);
      setPipeline(p.data);
      setToday(t.data);
      setForm({
        outreach_done: t.data.outreach_done,
        outreach_target: t.data.outreach_target,
        calls_scheduled: t.data.calls_scheduled,
        calls_completed: t.data.calls_completed,
        closes: t.data.closes,
        revenue_generated: t.data.revenue_generated,
        content_pieces_published: t.data.content_pieces_published,
      });
    } catch { toast.error("Failed to load analytics"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const saveToday = async () => {
    setSaving(true);
    try {
      const payload = {};
      Object.entries(form).forEach(([k, v]) => {
        if (v === "" || v === null || v === undefined) return;
        payload[k] = Number(v);
      });
      await api.patch("/metrics/today", payload);
      toast.success("Updated");
      load();
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-64" /></div>;
  }

  const trend = (cur, prev) => {
    if (!prev || prev === 0) return null;
    const pct = ((cur - prev) / prev) * 100;
    return { pct: Math.round(pct * 10) / 10, up: pct >= 0 };
  };

  return (
    <div className="space-y-6" data-testid="analytics-page">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Weekly performance, pipeline progress, and AI recommendations.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KPI label="This week outreach" value={week?.totals?.outreach || 0} />
        <KPI label="This week calls" value={week?.totals?.calls_completed || 0} />
        <KPI label="This week closes" value={week?.totals?.closes || 0} />
        <KPI label="This week revenue" value={`$${(week?.totals?.revenue || 0).toLocaleString()}`} />
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Daily trend (last 7 days)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(week?.days || []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No data yet. Update today's numbers below to start tracking.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-normal">Date</th>
                  <th className="px-3 py-2 font-normal text-right">Outreach</th>
                  <th className="px-3 py-2 font-normal text-right">Calls done</th>
                  <th className="px-3 py-2 font-normal text-right">Closes</th>
                  <th className="px-3 py-2 font-normal text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {week.days.map((d) => (
                  <tr key={d.date} data-testid={`analytics-row-${d.date}`} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 tabular-nums">{d.date}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.outreach_done}/{d.outreach_target}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.calls_completed}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.closes}</td>
                    <td className="px-3 py-2 text-right tabular-nums">${(d.revenue_generated || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Update today's numbers</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {[
            ["outreach_done", "Outreach done"],
            ["outreach_target", "Outreach target"],
            ["calls_scheduled", "Calls scheduled"],
            ["calls_completed", "Calls completed"],
            ["closes", "Closes"],
            ["revenue_generated", "Revenue ($)"],
            ["content_pieces_published", "Content pieces"],
          ].map(([k, label]) => (
            <div key={k}>
              <Label className="text-sm" htmlFor={k}>{label}</Label>
              <Input
                id={k}
                type="number"
                value={form[k] ?? ""}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                data-testid={`analytics-input-${k}`}
                className="mt-1.5"
              />
            </div>
          ))}
        </CardContent>
        <div className="px-6 pb-6">
          <Button onClick={saveToday} disabled={saving} className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white" data-testid="analytics-save-button">
            {saving ? "Saving…" : "Save today's metrics"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function KPI({ label, value }) {
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
        <div className="font-display text-2xl font-semibold tabular-nums mt-2">{value}</div>
      </CardContent>
    </Card>
  );
}
