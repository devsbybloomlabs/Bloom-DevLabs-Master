/**
 * Admin · Clients
 *
 * Read-and-resend hub for paid clients (the `clients` Mongo collection).
 * Lists all client portal accounts with status, source, last login, and
 * a one-click "Resend password setup" action for accounts that still need
 * to set a password (auto-provisioned from PayPal).
 */
import { useEffect, useMemo, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Users,
  Mail,
  RefreshCw,
  Search,
  KeyRound,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
} from "lucide-react";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function sourceLabel(src) {
  if (!src) return "—";
  const map = {
    paypal: "PayPal",
    agencyhandy: "AgencyHandy",
    self_register: "Self-register",
    tidycal: "TidyCal",
  };
  return map[src] || src;
}

export default function ClientsAdmin() {
  const api = useAdminApi();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busyEmail, setBusyEmail] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/clients");
      setRows(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load clients");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (c) =>
        (c.email || "").toLowerCase().includes(q) ||
        (c.name || "").toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((c) => c.status === "active").length;
    const pending = rows.filter((c) => c.needs_password_setup).length;
    return { total, active, pending };
  }, [rows]);

  const onResendSetup = async (email) => {
    setBusyEmail(email);
    try {
      const r = await api.post(`/admin/clients/${encodeURIComponent(email)}/resend-setup`);
      if (r.data?.setup_url) {
        try {
          await navigator.clipboard.writeText(r.data.setup_url);
          toast.success("Password setup link emailed and copied to clipboard");
        } catch {
          toast.success("Password setup link emailed");
        }
      } else {
        toast.success("Password setup link sent");
      }
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not resend setup link");
    } finally {
      setBusyEmail(null);
    }
  };

  const onCopyEmail = async (email) => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied");
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-clients-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-[#1E3A8A]" />
            Clients
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paid customers with access to the client portal. Auto-provisioned
            from PayPal captures and AgencyHandy webhooks.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          data-testid="admin-clients-refresh"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Total clients" value={stats.total} icon={Users} />
        <StatTile label="Active" value={stats.active} icon={CheckCircle2} accent="text-emerald-600" />
        <StatTile label="Awaiting setup" value={stats.pending} icon={Clock} accent="text-amber-600" />
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="font-display text-lg">All clients</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, or company"
                className="pl-9"
                data-testid="admin-clients-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="py-12 text-center text-sm text-muted-foreground"
              data-testid="admin-clients-empty"
            >
              {rows.length === 0
                ? "No clients yet. They'll appear here when paid orders capture or AgencyHandy adds them."
                : "No clients match that search."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.12em] text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Client</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 pr-3 font-medium">Last login</th>
                    <th className="py-2 pr-3 font-medium">Joined</th>
                    <th className="py-2 pr-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr
                      key={c.email}
                      className="border-b border-border/60 hover:bg-secondary/40 transition-colors"
                      data-testid={`admin-client-row-${c.email}`}
                    >
                      <td className="py-3 pr-3">
                        <div className="font-medium">{c.name || c.email.split("@")[0]}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                          {c.email}
                          <button
                            type="button"
                            aria-label="Copy email"
                            onClick={() => onCopyEmail(c.email)}
                            className="hover:text-foreground"
                            data-testid={`admin-client-copy-email-${c.email}`}
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                        {c.company && (
                          <div className="text-xs text-muted-foreground mt-0.5">{c.company}</div>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        {c.needs_password_setup ? (
                          <Badge className="bg-amber-100 text-amber-900 border-0">
                            <Clock className="h-3 w-3 mr-1" />
                            Awaiting setup
                          </Badge>
                        ) : c.status === "active" ? (
                          <Badge className="bg-emerald-100 text-emerald-900 border-0">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline">{c.status || "—"}</Badge>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-xs text-muted-foreground">
                        {sourceLabel(c.source)}
                      </td>
                      <td className="py-3 pr-3 text-xs text-muted-foreground tabular-nums">
                        {formatDate(c.last_login_at)}
                      </td>
                      <td className="py-3 pr-3 text-xs text-muted-foreground tabular-nums">
                        {formatDate(c.created_at)}
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <div className="inline-flex items-center gap-2 flex-wrap justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onResendSetup(c.email)}
                            disabled={busyEmail === c.email}
                            data-testid={`admin-client-resend-${c.email}`}
                            title={
                              c.needs_password_setup
                                ? "Send password setup link"
                                : "Send password reset link"
                            }
                          >
                            <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                            {c.needs_password_setup ? "Send setup" : "Reset link"}
                          </Button>
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            data-testid={`admin-client-mailto-${c.email}`}
                          >
                            <a href={`mailto:${c.email}`}>
                              <Mail className="h-3.5 w-3.5 mr-1.5" />
                              Email
                            </a>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ label, value, icon: Icon, accent }) {
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
          <Icon className={`h-4 w-4 ${accent || "text-[#3B82F6]"}`} />
        </div>
        <div className="font-display text-2xl font-semibold mt-2 tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
