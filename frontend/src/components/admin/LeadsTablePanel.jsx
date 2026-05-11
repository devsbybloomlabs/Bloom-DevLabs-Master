/**
 * LeadsTablePanel — scored leads + segmentation filters.
 *
 * Embeds inside `/admin/lead-magnets` (Phase 15).
 *
 * Filters:
 *   • magnet (slug dropdown)
 *   • source (contains text — e.g., 'blog')
 *   • segment (hot / warm / cold)
 *   • minimum score (range slider)
 *
 * Each row shows the computed score + segment pill. Aggregate counts are
 * shown above (avg score, segment distribution, top sources).
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Filter, Flame, Snowflake, RefreshCw } from "lucide-react";

const SEGMENT_META = {
  hot: { label: "Hot", color: "bg-rose-100 text-rose-900", Icon: Flame },
  warm: { label: "Warm", color: "bg-amber-100 text-amber-900", Icon: Flame },
  cold: { label: "Cold", color: "bg-slate-100 text-slate-900", Icon: Snowflake },
};

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function LeadsTablePanel({ api }) {
  const [segments, setSegments] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    magnet_slug: "all",
    source_contains: "",
    segment: "all",
    score_min: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.magnet_slug !== "all") params.magnet_slug = filters.magnet_slug;
      if (filters.source_contains.trim()) params.source_contains = filters.source_contains.trim();
      if (filters.segment !== "all") params.segment = filters.segment;
      if (filters.score_min > 0) params.score_min = filters.score_min;
      const [segRes, leadsRes] = await Promise.allSettled([
        api.get("/admin/leads/segments"),
        api.get("/admin/leads", { params }),
      ]);
      setSegments(segRes.status === "fulfilled" ? segRes.value.data : null);
      setLeads(leadsRes.status === "fulfilled" ? leadsRes.value.data : []);
    } finally {
      setLoading(false);
    }
  }, [api, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const magnetOptions = useMemo(() => {
    const seen = new Map();
    leads.forEach((l) => {
      const slug = l.magnet_slug;
      if (!slug) return;
      seen.set(slug, (seen.get(slug) || 0) + 1);
    });
    if (segments?.by_magnet) {
      segments.by_magnet.forEach(({ magnet, count }) => {
        if (magnet && magnet !== "—" && !seen.has(magnet)) seen.set(magnet, count);
      });
    }
    return Array.from(seen.entries()).map(([slug, count]) => ({ slug, count }));
  }, [leads, segments]);

  return (
    <Card className="border-border" data-testid="lead-scoring-panel">
      <CardHeader>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-[#1E3A8A]" />
              Lead scoring & segmentation
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Score 0-100 based on magnet weight, source, recency, and engagement.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={load}
            disabled={loading}
            data-testid="leads-refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Aggregate cards */}
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Total leads" value={segments?.total || 0} />
          <Stat label="Avg score" value={segments?.avg_score ?? "—"} />
          <Stat
            label="Hot (≥70)"
            value={segments?.segments?.hot || 0}
            color="text-rose-600"
          />
          <Stat
            label="Cold (<40)"
            value={segments?.segments?.cold || 0}
            color="text-slate-600"
          />
        </div>

        {/* Filters */}
        <div className="rounded-lg bg-secondary/40 border border-border p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground mb-3">
            <Filter className="h-3.5 w-3.5" />
            Filters
          </div>
          <div className="grid sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Segment</Label>
              <Select
                value={filters.segment}
                onValueChange={(v) => setFilters({ ...filters, segment: v })}
              >
                <SelectTrigger className="mt-1" data-testid="leads-filter-segment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All segments</SelectItem>
                  <SelectItem value="hot">Hot only</SelectItem>
                  <SelectItem value="warm">Warm only</SelectItem>
                  <SelectItem value="cold">Cold only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Magnet</Label>
              <Select
                value={filters.magnet_slug}
                onValueChange={(v) => setFilters({ ...filters, magnet_slug: v })}
              >
                <SelectTrigger className="mt-1" data-testid="leads-filter-magnet">
                  <SelectValue placeholder="All magnets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All magnets</SelectItem>
                  {magnetOptions.map((m) => (
                    <SelectItem key={m.slug} value={m.slug}>
                      {m.slug} ({m.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Source contains</Label>
              <Input
                value={filters.source_contains}
                onChange={(e) =>
                  setFilters({ ...filters, source_contains: e.target.value })
                }
                placeholder="blog, twitter, …"
                className="mt-1 h-9"
                data-testid="leads-filter-source"
              />
            </div>
            <div>
              <Label className="text-xs">Min score: {filters.score_min}</Label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={filters.score_min}
                onChange={(e) =>
                  setFilters({ ...filters, score_min: Number(e.target.value) })
                }
                className="mt-3 w-full"
                data-testid="leads-filter-score"
              />
            </div>
          </div>
        </div>

        {/* Leads table */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div
            className="py-8 text-center text-sm text-muted-foreground"
            data-testid="leads-table-empty"
          >
            No leads match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.12em] text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Magnet</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Captured</th>
                  <th className="py-2 pr-3 font-medium text-right">Score</th>
                  <th className="py-2 pr-3 font-medium">Segment</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const meta = SEGMENT_META[l.segment] || SEGMENT_META.cold;
                  const SegIcon = meta.Icon;
                  return (
                    <tr
                      key={l.id || l.email}
                      className="border-b border-border/60 hover:bg-secondary/40"
                      data-testid={`lead-row-${l.email}`}
                    >
                      <td className="py-2.5 pr-3 font-mono text-xs">{l.email}</td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                        {l.magnet_slug || "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground truncate max-w-[200px]">
                        {l.source_url || "direct"}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground tabular-nums">
                        {fmtTime(l.created_at)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-display font-semibold tabular-nums">
                        {l.score}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge className={`${meta.color} border-0 text-[10px]`}>
                          <SegIcon className="h-3 w-3 mr-1" />
                          {meta.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-display text-xl font-semibold mt-1 tabular-nums ${color || ""}`}>
        {value}
      </div>
    </div>
  );
}
