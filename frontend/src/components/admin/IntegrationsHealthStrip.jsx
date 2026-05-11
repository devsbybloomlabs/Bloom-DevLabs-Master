/**
 * Integrations Health Strip
 *
 * Compact pill row on the admin dashboard home showing the current health of
 * every wired integration. Calls `/admin/integrations/health` once on mount —
 * no upstream pings, just reflects stored last-ping results.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  Mail,
  Users,
  CreditCard,
  Activity,
  ImagePlus,
  Plug,
  ArrowRight,
} from "lucide-react";

const META = {
  openrouter: { label: "OpenRouter", icon: Sparkles },
  emailit: { label: "Emailit", icon: Mail },
  agencyhandy: { label: "AgencyHandy", icon: Users },
  paypal: { label: "PayPal", icon: CreditCard },
  nifty: { label: "Nifty PM", icon: Activity },
  approval_studio: { label: "Approval Studio", icon: ImagePlus },
};

const COLOR = {
  green: "bg-emerald-100 text-emerald-900 border-emerald-200",
  yellow: "bg-amber-100 text-amber-900 border-amber-200",
  red: "bg-rose-100 text-rose-900 border-rose-200",
};

function relTime(iso) {
  if (!iso) return "never tested";
  try {
    const ts = new Date(iso).getTime();
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    return `${d}d ago`;
  } catch {
    return "—";
  }
}

export default function IntegrationsHealthStrip() {
  const api = useAdminApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await api.get("/admin/integrations/health");
        if (!cancel) setData(r.data);
      } catch {
        if (!cancel) setData({ providers: [] });
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [api]);

  if (loading) {
    return (
      <Card className="border-border" data-testid="health-strip-loading">
        <CardContent className="p-4">
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const providers = data?.providers || [];

  return (
    <Card className="border-border" data-testid="health-strip">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <Plug className="h-3.5 w-3.5" />
            Integrations health
          </div>
          <Link
            to="/admin/integrations"
            className="text-xs text-[#1E3A8A] hover:text-[#3B82F6] inline-flex items-center gap-1"
            data-testid="health-strip-manage-link"
          >
            Manage
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {providers.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">
              No integrations registered.
            </div>
          ) : (
            providers.map((p) => {
              const meta = META[p.provider] || { label: p.provider, icon: Plug };
              const Icon = meta.icon;
              const color = COLOR[p.status] || COLOR.yellow;
              const ts = p.last_ping?.at;
              const tip = !p.configured
                ? "Not configured"
                : ts
                ? `Last ping ${relTime(ts)}${p.last_ping?.ok ? "" : " · failed"}`
                : p.detail || "never tested";
              return (
                <Link
                  key={p.provider}
                  to="/admin/integrations"
                  title={tip}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-xs ${color} hover:opacity-90 transition-opacity`}
                  data-testid={`health-pill-${p.provider}`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      p.status === "green"
                        ? "bg-emerald-500"
                        : p.status === "yellow"
                        ? "bg-amber-500"
                        : "bg-rose-500"
                    }`}
                  />
                  <Icon className="h-3 w-3" />
                  <span className="font-medium">{meta.label}</span>
                  {ts && (
                    <span className="opacity-70 hidden sm:inline">· {relTime(ts)}</span>
                  )}
                </Link>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
