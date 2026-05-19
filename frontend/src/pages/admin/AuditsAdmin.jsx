/**
 * AuditsAdmin — admin dashboard for incoming audit submissions.
 * Mounted at /admin/audits.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Inbox,
  TrendingUp,
  PhoneCall,
  DollarSign,
  Clock,
  Trash2,
  ChevronRight,
  Search,
  Sparkles,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const BUDGET_COLORS = {
  "$3K-$7K": "bg-red-100 text-red-800",
  "$7K-$12K": "bg-amber-100 text-amber-800",
  "$12K-$20K": "bg-emerald-100 text-emerald-800",
  "$20K+": "bg-green-100 text-green-900",
};

const STATUS_COLORS = {
  submitted: "bg-blue-100 text-blue-800",
  analyzed: "bg-purple-100 text-purple-800",
  reviewed: "bg-indigo-100 text-indigo-800",
  called: "bg-amber-100 text-amber-800",
  closed_won: "bg-green-100 text-green-900",
  closed_lost: "bg-zinc-200 text-zinc-700",
  abandoned: "bg-zinc-100 text-zinc-500",
};

function StatTile({ icon: Icon, label, value, sub, testid, accent = "#1E3A8A" }) {
  return (
    <Card className="border-border" data-testid={testid}>
      <CardContent className="p-5 flex items-start gap-3">
        <div className="rounded-lg p-2.5" style={{ backgroundColor: `${accent}1A` }}>
          <Icon className="h-5 w-5" style={{ color: accent }} />
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

export default function AuditsAdmin() {
  const api = useAdminApi();
  const nav = useNavigate();
  const [audits, setAudits] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterIndustry, setFilterIndustry] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([
        api.get("/admin/audits/reports/summary"),
        api.get("/admin/audits"),
      ]);
      setSummary(s.data);
      setAudits(l.data);
    } catch (e) {
      toast.error("Failed to load audits");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = async (id) => {
    if (!window.confirm("Delete this audit permanently?")) return;
    try {
      await api.delete(`/admin/audits/${id}`);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  const industries = Array.from(new Set(audits.map((a) => a.industry))).sort();

  const filtered = audits.filter((a) => {
    if (filterStatus !== "all" && a.status !== filterStatus) return false;
    if (filterIndustry !== "all" && a.industry !== filterIndustry) return false;
    if (search) {
      const s = search.toLowerCase();
      const blob = `${a.company_name} ${a.customer_name} ${a.customer_email} ${a.industry} ${a.pain_point}`.toLowerCase();
      if (!blob.includes(s)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8" data-testid="audits-admin">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Audit Submissions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Incoming leads from the <code>/get-audit</code> funnel. AI analysis runs automatically post-submit.
        </p>
      </div>

      {summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={Inbox} label="Total" value={summary.total} sub={`${summary.week} this week`} testid="audit-stat-total" />
            <StatTile icon={PhoneCall} label="Call Rate" value={`${summary.call_rate_pct}%`} sub={`${summary.called} called of ${summary.total}`} testid="audit-stat-call-rate" accent="#F59E0B" />
            <StatTile icon={TrendingUp} label="Win Rate" value={`${summary.win_rate_pct}%`} sub={`${summary.won} closed-won`} testid="audit-stat-win-rate" accent="#10B981" />
            <StatTile icon={DollarSign} label="Deal $ Won" value={`$${(summary.deal_value_won_usd || 0).toLocaleString()}`} sub={summary.avg_time_to_call_hours ? `Avg time-to-call ${summary.avg_time_to_call_hours}h` : "—"} testid="audit-stat-deal-value" accent="#1E3A8A" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {summary.daily?.length > 0 && (
              <Card className="border-border">
                <CardContent className="p-5">
                  <p className="font-medium text-sm mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Submissions · last 14 days
                  </p>
                  <div className="h-56" data-testid="audit-chart-daily">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={summary.daily}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="count" stroke="#1E3A8A" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
            {summary.by_industry?.length > 0 && (
              <Card className="border-border">
                <CardContent className="p-5">
                  <p className="font-medium text-sm mb-3">By industry</p>
                  <div className="h-56" data-testid="audit-chart-industry">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary.by_industry} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                        <YAxis dataKey="industry" type="category" tick={{ fontSize: 10 }} width={130} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#1E3A8A" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {summary.by_source_cta?.length > 0 && (
            <Card className="border-border">
              <CardContent className="p-5">
                <p className="font-medium text-sm mb-3">CTA source attribution</p>
                <div className="flex flex-wrap gap-2" data-testid="audit-cta-attribution">
                  {summary.by_source_cta.map((s) => (
                    <Badge key={s.cta} variant="outline" className="text-xs">
                      <span className="font-mono mr-1.5">{s.cta}</span> · {s.count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, name, email…"
            className="pl-9"
            data-testid="audit-search"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44" data-testid="audit-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="analyzed">Analyzed</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="called">Called</SelectItem>
            <SelectItem value="closed_won">Closed-Won</SelectItem>
            <SelectItem value="closed_lost">Closed-Lost</SelectItem>
            <SelectItem value="abandoned">Abandoned</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterIndustry} onValueChange={setFilterIndustry}>
          <SelectTrigger className="w-44" data-testid="audit-filter-industry">
            <SelectValue placeholder="Industry" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All industries</SelectItem>
            {industries.map((i) => (
              <SelectItem key={i} value={i}>{i}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Card className="border-border"><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-16 text-center" data-testid="audit-empty">
            <Inbox className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 font-display text-base font-medium">No audits yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once visitors submit /get-audit, leads appear here automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((a) => (
            <Card key={a.id} className="border-border hover:border-foreground/30 transition-colors" data-testid={`audit-row-${a.id}`}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <button onClick={() => nav(`/admin/audits/${a.id}`)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <Badge className={`${STATUS_COLORS[a.status] || "bg-zinc-100 text-zinc-700"} border-0 capitalize`}>
                        {a.status?.replace("_", "-")}
                      </Badge>
                      <Badge className={`${BUDGET_COLORS[a.budget_range] || ""} border-0 text-[10px]`}>
                        {a.budget_range}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{a.industry}</Badge>
                      {a.recommendation_titles?.length > 0 && (
                        <Badge className="bg-purple-100 text-purple-800 border-0 text-[10px]">
                          <Sparkles className="h-3 w-3 mr-1" />
                          {a.recommendation_titles.length} recs
                        </Badge>
                      )}
                    </div>
                    <p className="font-display text-base font-medium">
                      {a.customer_name} <span className="text-muted-foreground">@ {a.company_name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.pain_point} · {a.timeline} · submitted {new Date(a.created_at).toLocaleString()}
                    </p>
                  </button>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => nav(`/admin/audits/${a.id}`)} data-testid={`audit-open-${a.id}`}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(a.id)} data-testid={`audit-delete-${a.id}`}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
