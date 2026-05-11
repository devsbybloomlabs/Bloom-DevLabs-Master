/**
 * DemoModeCard
 *
 * One-click sandbox seeder for sales / Loom demos.
 *
 * Spawns 13 synthetic records across every Bloom Labs integration:
 *   - 2 clients with portal access (password `demo1234`)
 *   - 2 milestones (one in-progress, one complete)
 *   - 3 design approvals (in_review / revision / approved)
 *   - 4 ThriveDesk escalations (mixed urgent + feature, mixed status)
 *   - 1 onboarding submission
 *   - 1 lead capture
 *
 * All records flagged `demo: True` so the same endpoint wipes them. Idempotent.
 */
import { useEffect, useState, useCallback } from "react";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Sparkles, Trash2, RefreshCw, PlayCircle, Copy } from "lucide-react";

export default function DemoModeCard() {
  const api = useAdminApi();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/demo/status");
      setStatus(r.data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onSeed = async () => {
    setBusy(true);
    try {
      const r = await api.post("/admin/demo/seed");
      const counts = r.data.seeded || {};
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      toast.success(
        `Demo mode armed — ${total} records seeded. Login as ${r.data.demo_clients[0]} / demo1234`
      );
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Seed failed");
    } finally {
      setBusy(false);
    }
  };

  const onWipe = async () => {
    if (!window.confirm("Remove all demo records? Real data is untouched.")) return;
    setBusy(true);
    try {
      const r = await api.delete("/admin/demo/seed");
      const total = Object.values(r.data.wiped || {}).reduce((a, b) => a + b, 0);
      toast.success(`Cleared ${total} demo records`);
      load();
    } catch {
      toast.error("Wipe failed");
    } finally {
      setBusy(false);
    }
  };

  const onCopyCreds = async () => {
    try {
      await navigator.clipboard.writeText("demo.acme@bloomlabs.demo / demo1234");
      toast.success("Demo credentials copied");
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <Card className="border-border" data-testid="demo-mode-card-loading">
        <CardContent className="p-4">
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const active = status?.active;
  const total = status?.total || 0;

  return (
    <Card
      className={`border-2 ${
        active
          ? "border-amber-300 bg-amber-50/40"
          : "border-dashed border-border"
      }`}
      data-testid="demo-mode-card"
    >
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#1E3A8A] to-[#3B82F6] text-white flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display text-sm font-semibold">Demo Mode</span>
                {active ? (
                  <Badge className="bg-amber-100 text-amber-900 border-0 text-[10px]">
                    Active · {total} synthetic records
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    Off
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Spawns clients, milestones, approvals & escalations for a 2-min Loom recording.
                Real data stays untouched.
              </p>
              {active && (
                <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                  {Object.entries(status?.counts || {})
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => (
                      <span key={k}>
                        <strong className="text-foreground">{v}</strong> {k.replace(/_/g, " ")}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {active && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCopyCreds}
                data-testid="demo-mode-copy-creds"
                title="Copy demo client credentials"
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy creds
              </Button>
            )}
            {active ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onSeed}
                  disabled={busy}
                  data-testid="demo-mode-reseed"
                >
                  {busy ? (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Re-seed
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onWipe}
                  disabled={busy}
                  className="text-rose-700 hover:text-rose-800 hover:bg-rose-50"
                  data-testid="demo-mode-wipe"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Wipe demo data
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={onSeed}
                disabled={busy}
                className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                data-testid="demo-mode-seed"
              >
                {busy ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-2" />
                )}
                Arm demo
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
