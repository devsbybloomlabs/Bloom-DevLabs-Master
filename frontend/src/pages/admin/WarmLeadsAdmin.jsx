/**
 * /admin/warm-leads — admin dashboard for captured warm leads
 * (checkout abandoners from the gym/coach/realestate funnels).
 *
 * Pulls from GET /api/leads/warm and groups by niche.
 */
import { useEffect, useState, useMemo } from "react";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox, RefreshCw, Filter, TrendingUp, Mail, Phone, MapPin, Search } from "lucide-react";

const NICHE_META = {
  gym: { label: "Gym Owners", color: "bg-blue-100 text-blue-800 border-blue-200" },
  coaches: { label: "Coaches", color: "bg-teal-100 text-teal-800 border-teal-200" },
  "real-estate": { label: "Real Estate", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
};
const STATUS_META = {
  captured: { label: "Captured", color: "bg-slate-100 text-slate-700" },
  nurtured: { label: "Nurtured (email sent)", color: "bg-amber-100 text-amber-800" },
  converted: { label: "Converted ✓", color: "bg-emerald-100 text-emerald-800" },
  discarded: { label: "Discarded", color: "bg-rose-100 text-rose-700" },
};

export default function WarmLeadsAdmin() {
  const adminApi = useAdminApi();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get("/admin/leads/warm?limit=200");
      setLeads(data.items || []);
    } finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (filter !== "all" && l.niche !== filter) return false;
      if (term && !(l.email?.includes(term) || l.name?.toLowerCase().includes(term) || (l.gym_name || "").toLowerCase().includes(term) || (l.market || "").toLowerCase().includes(term))) return false;
      return true;
    });
  }, [leads, filter, search]);

  const stats = useMemo(() => {
    const byNiche = { gym: 0, coaches: 0, "real-estate": 0 };
    let converted = 0, nurtured = 0;
    for (const l of leads) {
      if (byNiche[l.niche] != null) byNiche[l.niche] += 1;
      if (l.status === "converted") converted += 1;
      if (l.status === "nurtured") nurtured += 1;
    }
    return { total: leads.length, byNiche, converted, nurtured, conversion: leads.length ? Math.round((converted / leads.length) * 100) : 0 };
  }, [leads]);

  return (
    <div className="space-y-6" data-testid="warm-leads-admin">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <Inbox className="h-6 w-6 text-indigo-700" />
            Warm Leads
          </h1>
          <p className="text-sm text-muted-foreground">
            Prospects who started checkout but didn't pay. Re-engagement email fires automatically at 24–72h.
          </p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900" data-testid="warm-leads-refresh">
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </button>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Total captured" value={stats.total} icon={Inbox} />
        <Stat label="Gym Owners" value={stats.byNiche.gym} />
        <Stat label="Coaches" value={stats.byNiche.coaches} />
        <Stat label="Real Estate" value={stats.byNiche["real-estate"]} />
        <Stat label="Converted →" value={`${stats.conversion}%`} icon={TrendingUp} tone="emerald" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, market…" className="pl-9 h-10" data-testid="warm-leads-search" />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500"><Filter className="h-3.5 w-3.5" />Filter:</div>
        {["all", "gym", "coaches", "real-estate"].map((k) => (
          <button key={k} type="button" onClick={() => setFilter(k)} data-testid={`warm-leads-filter-${k}`}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
              filter === k ? "bg-indigo-700 text-white border-indigo-700" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
            }`}>
            {k === "all" ? "All" : NICHE_META[k]?.label || k}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <Inbox className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">{search || filter !== "all" ? "No warm leads match those filters." : "No warm leads yet."}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              {filtered.map((l) => {
                const niche = NICHE_META[l.niche] || { label: l.niche, color: "bg-slate-100 text-slate-700" };
                const status = STATUS_META[l.status] || { label: l.status, color: "bg-slate-100 text-slate-700" };
                return (
                  <li key={l.id} className="px-5 py-4" data-testid={`warm-lead-row-${l.id}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900 truncate">{l.name}</span>
                          <Badge className={`${niche.color} border text-[10px] uppercase tracking-wider`}>{niche.label}</Badge>
                          <Badge className={`${status.color} text-[10px] uppercase tracking-wider`}>{status.label}</Badge>
                          {l.visits > 1 && (
                            <Badge variant="outline" className="text-[10px]">{l.visits}× visits</Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1 hover:text-indigo-700"><Mail className="h-3 w-3" />{l.email}</a>
                          {l.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{l.phone}</span>}
                          {(l.gym_name || l.coaching_niche || l.market) && (
                            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{l.gym_name || l.coaching_niche || l.market}</span>
                          )}
                          <span className="font-mono text-[10px] text-slate-400">tier: {l.tier}</span>
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <div>captured</div>
                        <div className="font-mono text-[10px]">{(l.created_at || "").slice(0, 16).replace("T", " ")}</div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-white",
    emerald: "border-emerald-200 bg-emerald-50/50",
  };
  return (
    <Card className={tones[tone]}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">
          {Icon && <Icon className="h-3.5 w-3.5" />}{label}
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      </CardContent>
    </Card>
  );
}
