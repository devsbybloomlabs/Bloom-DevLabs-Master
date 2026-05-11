/**
 * Admin Integrations — friction-reducer hub.
 *
 * One page to:
 *   • Connect/disconnect Nifty (OAuth + manual-token fallback)
 *   • Sync Nifty projects & members ONCE (cached in DB; click Sync to refresh)
 *   • Pick the default Nifty project + per-team assignees via dropdowns
 *   • See status + test ping for OpenRouter, Emailit, AgencyHandy, PayPal
 */
import { useEffect, useState, useCallback } from "react";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import IntegrationCredentialsForm from "@/components/admin/IntegrationCredentialsForm";
import {
  Link2,
  Unlink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  KeyRound,
  Save,
  Activity,
  Plug,
  Database,
  Mail,
  Sparkles,
  CreditCard,
  Users,
} from "lucide-react";

const PROVIDER_META = {
  openrouter: { label: "OpenRouter", icon: Sparkles, color: "#8B5CF6", desc: "AI text generation (routine, content, blog drafts)" },
  emailit: { label: "Emailit", icon: Mail, color: "#3B82F6", desc: "Transactional email (testimonials, onboarding, drip)" },
  agencyhandy: { label: "AgencyHandy", icon: Users, color: "#0EA5E9", desc: "Revenue + invoices + proposals sync" },
  paypal: { label: "PayPal", icon: CreditCard, color: "#1E3A8A", desc: "Payment processing (one-time + subscriptions)" },
};

export default function IntegrationsAdmin() {
  return (
    <div className="space-y-6" data-testid="admin-integrations-page">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
          Integrations
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect Bloom Labs to your stack. Tokens auto-refresh; data is cached
          locally so admin pages stay fast.
        </p>
      </div>
      <NiftyCard />
      <ProvidersGrid />
      <IntegrationCredentialsForm />
    </div>
  );
}

// ============================================================================
// Nifty (rebuilt with cache + Sync button + preference dropdowns)
// ============================================================================
function NiftyCard() {
  const api = useAdminApi();
  const [status, setStatus] = useState(null);
  const [cache, setCache] = useState(null);
  const [prefs, setPrefs] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [savingPrefs, setSavingPrefs] = useState(false);

  // local working copy for prefs dropdowns
  const [draftPrefs, setDraftPrefs] = useState({
    default_project_id: "",
    designer_assignees: [],
    pm_assignees: [],
    developer_assignees: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, cRes] = await Promise.allSettled([
        api.get("/admin/integrations/nifty/status"),
        api.get("/admin/integrations/nifty/cache"),
      ]);
      const sData = sRes.status === "fulfilled" ? sRes.value.data : null;
      const cData = cRes.status === "fulfilled" ? cRes.value.data : { cache: null, preferences: {} };
      setStatus(sData);
      setCache(cData.cache);
      setPrefs(cData.preferences || {});
      setDraftPrefs({
        default_project_id: cData.preferences?.default_project_id || "",
        designer_assignees: cData.preferences?.designer_assignees || [],
        pm_assignees: cData.preferences?.pm_assignees || [],
        developer_assignees: cData.preferences?.developer_assignees || [],
      });
    } catch {
      toast.error("Could not load Nifty status");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onConnect = async () => {
    setBusy(true);
    try {
      const r = await api.get("/admin/integrations/nifty/authorize-url");
      window.location.href = r.data.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not generate authorize URL");
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    if (!window.confirm("Disconnect Nifty? Cached projects/members will remain but tokens are wiped.")) return;
    setBusy(true);
    try {
      await api.post("/admin/integrations/nifty/disconnect");
      toast.success("Disconnected");
      load();
    } catch {
      toast.error("Disconnect failed");
    } finally {
      setBusy(false);
    }
  };

  const onSaveManualToken = async () => {
    if (!manualToken.trim()) return;
    setBusy(true);
    try {
      await api.post("/admin/integrations/nifty/manual-token", {
        access_token: manualToken.trim(),
      });
      toast.success("Token saved");
      setManualOpen(false);
      setManualToken("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Token rejected");
    } finally {
      setBusy(false);
    }
  };

  const onSync = async () => {
    setSyncing(true);
    try {
      const r = await api.post("/admin/integrations/nifty/sync");
      toast.success(
        `Synced ${r.data.counts.projects} projects, ${r.data.counts.members} members`
      );
      setCache(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const onSavePrefs = async () => {
    setSavingPrefs(true);
    try {
      const r = await api.put("/admin/integrations/nifty/preferences", draftPrefs);
      setPrefs(r.data);
      toast.success("Preferences saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSavingPrefs(false);
    }
  };

  const connected = !!status?.connected;
  const pingOk = !!status?.ping_ok;
  const projects = cache?.projects || [];
  const members = cache?.members || [];

  const setAssignee = (key, email) => {
    setDraftPrefs((p) => ({ ...p, [key]: email ? [email] : [] }));
  };

  return (
    <Card className="border-border" data-testid="nifty-integration-card">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-[#1E3A8A] text-white flex items-center justify-center flex-shrink-0 font-display font-semibold">
              N
            </div>
            <div className="min-w-0">
              <CardTitle className="font-display text-lg flex items-center gap-2 flex-wrap">
                Nifty PM
                {connected && pingOk && (
                  <Badge className="bg-green-100 text-green-800 border-0">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                )}
                {connected && !pingOk && (
                  <Badge className="bg-amber-100 text-amber-800 border-0">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Token saved · ping failed
                  </Badge>
                )}
                {!connected && status?.oauth_configured && (
                  <Badge variant="outline">Not connected</Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Task automation + milestone sync · tokens auto-refresh
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="ghost"
              onClick={load}
              disabled={loading}
              data-testid="nifty-refresh-status"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            {!connected ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setManualOpen(true)}
                  disabled={!status?.oauth_configured}
                  data-testid="nifty-manual-token-button"
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  Paste token
                </Button>
                <Button
                  size="sm"
                  onClick={onConnect}
                  disabled={busy || !status?.oauth_configured}
                  className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                  data-testid="nifty-connect-button"
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Connect Nifty
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={onDisconnect}
                disabled={busy}
                data-testid="nifty-disconnect-button"
              >
                <Unlink className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <div className="rounded-lg bg-secondary/40 p-3 text-xs grid sm:grid-cols-2 gap-2">
            <div>
              <span className="text-muted-foreground">Redirect URI:</span>{" "}
              <code className="font-mono">{status.redirect_uri}</code>
            </div>
            <div>
              <span className="text-muted-foreground">Default project ID:</span>{" "}
              <code className="font-mono">
                {prefs.default_project_id || status.default_project_id || "—"}
              </code>
            </div>
          </div>
        )}

        {connected && (
          <>
            {!pingOk && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Token saved but live ping failed — Sync may not retrieve data
                until you reconnect with a valid token.
              </div>
            )}

            {/* SYNC SECTION */}
            <div className="rounded-xl border border-border bg-[var(--warm-50)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-sm font-medium flex items-center gap-2">
                    <Database className="h-4 w-4 text-[#1E3A8A]" />
                    Workspace data
                  </p>
                  {cache ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {cache.counts?.projects ?? 0} projects · {cache.counts?.members ?? 0} members ·
                      last synced {cache.synced_at && new Date(cache.synced_at).toLocaleString()}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      No cached data — click Sync to fetch projects + members from Nifty.
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={onSync}
                  disabled={syncing}
                  className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                  data-testid="nifty-sync-button"
                >
                  {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Sync now
                </Button>
              </div>
            </div>

            {/* PREFERENCES — always show; dropdowns are empty if no cache yet */}
            <div className="rounded-xl border border-border bg-background p-4 space-y-4" data-testid="nifty-preferences-section">
              <p className="font-display text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#1E3A8A]" />
                Default project + team assignees
              </p>

              <div>
                <Label className="text-sm">Default project</Label>
                <Select
                  value={draftPrefs.default_project_id || "__none__"}
                  onValueChange={(v) =>
                    setDraftPrefs((p) => ({ ...p, default_project_id: v === "__none__" ? "" : v }))
                  }
                >
                  <SelectTrigger className="mt-1.5" data-testid="nifty-default-project-select">
                    <SelectValue placeholder={projects.length === 0 ? "Sync first to see projects" : "Select a project..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None (no default) —</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id} data-testid={`nifty-project-option-${p.id}`}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Onboarding tasks land in this project unless overridden per phase.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <AssigneeSelect
                  label="Lead Designer"
                  members={members}
                  value={draftPrefs.designer_assignees[0] || ""}
                  onChange={(v) => setAssignee("designer_assignees", v)}
                  testid="nifty-designer-select"
                />
                <AssigneeSelect
                  label="Project Manager"
                  members={members}
                  value={draftPrefs.pm_assignees[0] || ""}
                  onChange={(v) => setAssignee("pm_assignees", v)}
                  testid="nifty-pm-select"
                />
                <AssigneeSelect
                  label="Lead Developer"
                  members={members}
                  value={draftPrefs.developer_assignees[0] || ""}
                  onChange={(v) => setAssignee("developer_assignees", v)}
                  testid="nifty-developer-select"
                />
              </div>
              {members.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No members cached. Click Sync to load members — they&apos;re
                  scoped to your default project, so pick one above first if
                  needed.
                </p>
              )}

              <div className="flex items-center justify-end">
                <Button
                  size="sm"
                  onClick={onSavePrefs}
                  disabled={savingPrefs}
                  className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                  data-testid="nifty-save-prefs-button"
                >
                  {savingPrefs ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save preferences
                </Button>
              </div>
            </div>
          </>
        )}

        {!connected && status?.oauth_configured && (
          <div className="rounded-lg border border-[#3B82F6]/30 bg-[#3B82F6]/5 p-4 text-sm">
            <p className="font-medium">Connect to enable:</p>
            <ul className="mt-1.5 ml-5 list-disc text-muted-foreground space-y-0.5">
              <li>Auto-create tasks on onboarding submission</li>
              <li>Sync task status → client portal milestones</li>
              <li>Client notes via task comments</li>
            </ul>
          </div>
        )}
      </CardContent>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent data-testid="nifty-manual-token-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Paste Nifty access token</DialogTitle>
            <DialogDescription>
              Useful for testing in environments where the OAuth redirect URL
              isn&apos;t whitelisted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Access token</Label>
              <Input
                type="password"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Paste token here"
                data-testid="nifty-manual-token-input"
                className="mt-1.5 font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button
              onClick={onSaveManualToken}
              disabled={busy || !manualToken.trim()}
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
              data-testid="nifty-manual-token-save"
            >
              Save token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AssigneeSelect({ label, members, value, onChange, testid }) {
  return (
    <div>
      <Label className="text-sm">{label}</Label>
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger className="mt-1.5" data-testid={testid}>
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Unassigned —</SelectItem>
          {members.map((m, idx) => {
            const ident = m.email || m.id;
            return (
              <SelectItem key={ident || idx} value={ident}>
                {m.name}
                {m.email ? <span className="text-muted-foreground"> · {m.email}</span> : null}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================================================
// Provider Friction-Reducer Grid
// ============================================================================
function ProvidersGrid() {
  const api = useAdminApi();
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/integrations/providers");
      setProviders(r.data);
    } catch {
      toast.error("Could not load integrations");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onTest = async (provider) => {
    setTesting((t) => ({ ...t, [provider]: true }));
    try {
      const r = await api.post(`/admin/integrations/${provider}/test`);
      if (r.data?.ok) {
        toast.success(`${PROVIDER_META[provider].label} ✓ connection OK`);
      } else {
        toast.warning(`${PROVIDER_META[provider].label} returned no error but also no ok flag`);
      }
    } catch (e) {
      toast.error(
        `${PROVIDER_META[provider].label}: ${e?.response?.data?.detail || "test failed"}`
      );
    } finally {
      setTesting((t) => ({ ...t, [provider]: false }));
    }
  };

  return (
    <Card className="border-border" data-testid="providers-grid">
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Plug className="h-5 w-5 text-[#1E3A8A]" />
          API integrations
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Status + live verification ping for each connected service. Keys are
          stored in <code>/app/backend/.env</code>; values shown are masked.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {providers.map((p) => {
              const meta = PROVIDER_META[p.provider] || { label: p.provider, icon: Plug, color: "#64748B" };
              const Icon = meta.icon;
              return (
                <div
                  key={p.provider}
                  className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3"
                  data-testid={`provider-card-${p.provider}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                      style={{ background: meta.color }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-sm font-medium">{meta.label}</span>
                        {p.configured ? (
                          <Badge className="bg-green-100 text-green-800 border-0 text-[10px]">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Configured
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Not configured
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{meta.desc}</p>
                    </div>
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Env var:</span>
                      <code className="font-mono">{p.env_var}</code>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Key:</span>
                      <code className="font-mono">{p.masked_key || "—"}</code>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onTest(p.provider)}
                    disabled={!p.configured || testing[p.provider]}
                    className="w-full"
                    data-testid={`provider-test-${p.provider}`}
                  >
                    {testing[p.provider] ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Activity className="h-4 w-4 mr-2" />
                    )}
                    Test connection
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
