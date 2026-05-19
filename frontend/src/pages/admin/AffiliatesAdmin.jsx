/**
 * AffiliatesAdmin — admin view of all affiliates + their referrals.
 * Founder can manually move referrals through stages; closed_won
 * triggers the affiliate's tier upgrade and email notification.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { authClient, useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  Users,
  Trophy,
  TrendingUp,
  MousePointerClick,
  Loader2,
} from "lucide-react";

const STAGES = [
  { id: "clicked", label: "Clicked", color: "bg-slate-200 text-slate-800" },
  { id: "contacted", label: "Contacted", color: "bg-blue-100 text-blue-800" },
  { id: "evaluating", label: "Evaluating", color: "bg-amber-100 text-amber-800" },
  { id: "proposed", label: "Proposed", color: "bg-violet-100 text-violet-800" },
  { id: "closed_won", label: "Closed Won", color: "bg-emerald-100 text-emerald-800" },
  { id: "closed_lost", label: "Closed Lost", color: "bg-rose-100 text-rose-800" },
];

function StageBadge({ stage }) {
  const meta = STAGES.find((s) => s.id === stage) || STAGES[0];
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function AffiliateDrawer({ affiliate, api, onClose, onChanged }) {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [dealValueInputs, setDealValueInputs] = useState({});

  const load = useCallback(async () => {
    if (!affiliate) return;
    setLoading(true);
    try {
      const r = await api.get(`/admin/affiliates/${affiliate.id}/referrals`);
      setReferrals(r.data || []);
      const initial = {};
      (r.data || []).forEach((ref) => {
        if (ref.deal_value_usd != null) initial[ref.id] = String(ref.deal_value_usd);
      });
      setDealValueInputs(initial);
    } catch {
      toast.error("Could not load referrals");
    } finally {
      setLoading(false);
    }
  }, [affiliate, api]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStage = async (ref, stage) => {
    setBusy(ref.id);
    try {
      const dv = dealValueInputs[ref.id];
      const payload = { stage };
      if (stage === "closed_won" && dv) payload.deal_value_usd = Number(dv);
      await api.patch(`/admin/affiliates/referrals/${ref.id}/stage`, payload);
      toast.success(`Marked ${stage}`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={Boolean(affiliate)} onOpenChange={(o) => !o && onClose?.()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto" data-testid="affiliate-admin-drawer">
        <SheetHeader>
          <SheetTitle className="font-display">{affiliate?.full_name}</SheetTitle>
          <SheetDescription>
            {affiliate?.email} · {affiliate?.company_name}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Card className="border-slate-200">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Tier</p>
              <p className="font-display text-2xl font-semibold mt-1">
                {affiliate?.tier_pct ?? 0}%
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Clicks</p>
              <p className="font-display text-2xl font-semibold mt-1">
                {affiliate?.total_clicks ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Won</p>
              <p className="font-display text-2xl font-semibold mt-1">
                {affiliate?.closed_won_count ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Code</p>
          <code className="text-sm bg-slate-100 px-2 py-1 rounded">{affiliate?.unique_code || "—"}</code>
        </div>

        <div className="mt-6">
          <h3 className="font-display font-medium mb-2">Referrals</h3>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : referrals.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No referrals attributed yet.</p>
          ) : (
            <div className="space-y-2" data-testid="affiliate-admin-referrals-list">
              {referrals.map((ref) => (
                <div key={ref.id} className="border border-slate-200 rounded-lg p-3" data-testid={`affiliate-admin-referral-${ref.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{ref.referred_company_name || "—"}</p>
                      <p className="text-xs text-slate-500">{ref.referred_contact_name} · {ref.referred_contact_email}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {ref.created_at ? new Date(ref.created_at).toLocaleDateString() : ""}
                      </p>
                    </div>
                    <StageBadge stage={ref.stage} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Select
                      value={ref.stage}
                      onValueChange={(v) => updateStage(ref, v)}
                      disabled={busy === ref.id}
                    >
                      <SelectTrigger className="h-8 text-xs w-44" data-testid={`affiliate-admin-stage-select-${ref.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => (
                          <SelectItem key={s.id} value={s.id} data-testid={`affiliate-admin-stage-option-${s.id}-${ref.id}`}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Deal value $"
                      value={dealValueInputs[ref.id] ?? ""}
                      onChange={(e) => setDealValueInputs({ ...dealValueInputs, [ref.id]: e.target.value })}
                      className="h-8 text-xs w-32"
                      type="number"
                      data-testid={`affiliate-admin-deal-value-${ref.id}`}
                    />
                    {busy === ref.id && <Loader2 className="h-3 w-3 animate-spin text-slate-500" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function AffiliatesAdmin() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openAff, setOpenAff] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/affiliates");
      setList(r.data || []);
    } catch {
      toast.error("Could not load affiliates");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    document.title = "Affiliates — Bloom Labs";
    load();
  }, [load]);

  const totals = useMemo(() => {
    return list.reduce(
      (acc, a) => {
        acc.clicks += a.total_clicks || 0;
        acc.referrals += a.total_referrals || 0;
        acc.won += a.closed_won_count || 0;
        if ((a.tier_pct || 0) > 0) acc.earners += 1;
        return acc;
      },
      { clicks: 0, referrals: 0, won: 0, earners: 0 }
    );
  }, [list]);

  return (
    <div className="space-y-6" data-testid="affiliates-admin-page">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Affiliates</p>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-0.5 inline-flex items-center gap-2">
          <Users className="h-6 w-6 text-[#1E3A8A]" />
          Affiliate Program
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Manage referrers and update referral stages. Closed-won updates auto-trigger tier upgrades + email notifications.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-slate-200">
          <CardContent className="p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Affiliates</p>
            <p className="font-display text-xl font-semibold tabular-nums mt-0.5">{list.length}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 inline-flex items-center gap-1">
              <MousePointerClick className="h-3 w-3" /> Total clicks
            </p>
            <p className="font-display text-xl font-semibold tabular-nums mt-0.5">{totals.clicks}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 inline-flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Referrals
            </p>
            <p className="font-display text-xl font-semibold tabular-nums mt-0.5">{totals.referrals}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-emerald-700 inline-flex items-center gap-1">
              <Trophy className="h-3 w-3" /> Tier earners
            </p>
            <p className="font-display text-xl font-semibold tabular-nums mt-0.5">{totals.earners}</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : list.length === 0 ? (
        <Card className="border-dashed border-slate-300">
          <CardContent className="p-10 text-center text-sm text-slate-500" data-testid="affiliates-admin-empty">
            No affiliates yet. Once clients enrol, they'll show up here.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm" data-testid="affiliates-admin-table">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2.5">Name</th>
                    <th className="px-3 py-2.5">Email</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Tier</th>
                    <th className="px-3 py-2.5 text-right">Clicks</th>
                    <th className="px-3 py-2.5 text-right">Referrals</th>
                    <th className="px-3 py-2.5 text-right">Won</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`affiliate-admin-row-${a.id}`}>
                      <td className="px-3 py-3 font-medium">{a.full_name}</td>
                      <td className="px-3 py-3 text-slate-700">{a.email}</td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className={a.status === "active" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}>
                          {a.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge className="bg-[#1E3A8A]/10 text-[#1E3A8A] border-0">
                          {a.tier_pct || 0}%
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.total_clicks ?? 0}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.total_referrals ?? 0}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.closed_won_count ?? 0}</td>
                      <td className="px-3 py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setOpenAff(a)}
                          data-testid={`affiliate-admin-open-${a.id}`}
                        >
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <AffiliateDrawer
        affiliate={openAff}
        api={api}
        onClose={() => setOpenAff(null)}
        onChanged={load}
      />
    </div>
  );
}
