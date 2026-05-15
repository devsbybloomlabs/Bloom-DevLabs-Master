/**
 * Admin Integrations — friction-reducer hub.
 *
 * One page to:
 *   • Connect/disconnect Nifty (OAuth + manual-token fallback)
 *   • Sync Nifty projects & members ONCE (cached in DB; click Sync to refresh)
 *   • Pick the default Nifty project + per-team assignees via dropdowns
 *   • See status + test ping for OpenRouter, Emailit, PayPal, BreezeDocs
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
import AbStatsCard from "@/components/admin/AbStatsCard";
import NiftyWorkspacesPanel from "@/components/admin/NiftyWorkspacesPanel";
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
  FolderSync,
  ExternalLink,
} from "lucide-react";

const PROVIDER_META = {
  openrouter: { label: "OpenRouter", icon: Sparkles, color: "#8B5CF6", desc: "AI text generation (routine, content, blog drafts)" },
  emailit: { label: "Emailit", icon: Mail, color: "#3B82F6", desc: "Transactional email (testimonials, onboarding, drip)" },
  paypal: { label: "PayPal", icon: CreditCard, color: "#1E3A8A", desc: "Payment processing (one-time + subscriptions)" },
};

export default function IntegrationsAdmin() {
  // Surface the `?drive_connected=1` / `?drive_error=...` notice from the
  // Google OAuth callback so the founder gets immediate feedback.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("drive_connected")) {
      toast.success("Google Drive connected");
      window.history.replaceState({}, "", window.location.pathname);
    }
    const err = params.get("drive_error");
    if (err) {
      toast.error(`Google Drive: ${err}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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
      <ProvidersGrid />
      <GoogleDriveCard />
      <IntegrationCredentialsForm />
      <AbStatsCard />
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

  const [reconnecting, setReconnecting] = useState(false);

  const onSync = async () => {
    setSyncing(true);
    try {
      const r = await api.post("/admin/integrations/nifty/sync");
      toast.success(
        `Synced ${r.data.counts.projects} projects, ${r.data.counts.members} members`
      );
      setCache(r.data);
    } catch (e) {
      const detail = e?.response?.data?.detail || "Sync failed";
      const tokenIssue =
        e?.response?.status === 401 || /reconnect|token|connect/i.test(detail);
      if (tokenIssue) {
        toast.error(detail, {
          action: {
            label: "Reconnect now",
            onClick: () => onReconnect(),
          },
          duration: 8000,
        });
      } else {
        toast.error(detail);
      }
    } finally {
      setSyncing(false);
    }
  };

  const onReconnect = async () => {
    setReconnecting(true);
    try {
      // Clear stale tokens and restart OAuth in one click.
      try {
        await api.post("/admin/integrations/nifty/disconnect");
      } catch {
        // ignore — may already be disconnected
      }
      const r = await api.get("/admin/integrations/nifty/authorize-url");
      const url = r.data?.url || r.data?.authorize_url;
      if (url) {
        window.location.href = url;
      } else {
        toast.error("Could not start Nifty OAuth — check Integrations health");
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reconnect failed");
    } finally {
      setReconnecting(false);
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

        {/* Multi-workspace snapshot panel (Phase 15) */}
        <NiftyWorkspacesPanel />
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


// ============================================================================
// Google Drive Mirror Sync
// ============================================================================
function GoogleDriveCard() {
  const api = useAdminApi();
  const [status, setStatus] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        api.get("/admin/google-drive/status"),
        api.get("/admin/pm/projects"),
      ]);
      setStatus(s.data);
      setProjects(p.data || []);
    } catch {
      // tolerate — show whatever loaded
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const connect = async () => {
    setBusy(true);
    try {
      const r = await api.get("/admin/google-drive/connect");
      window.location.href = r.data.authorization_url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Connect failed");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Google Drive? Per-project toggles will stop syncing.")) return;
    setBusy(true);
    try {
      await api.post("/admin/google-drive/disconnect");
      toast.success("Disconnected");
      load();
    } catch (e) {
      toast.error("Disconnect failed");
    } finally {
      setBusy(false);
    }
  };

  const togglePromise = async (projectId, enable) => {
    try {
      await api.post(`/admin/google-drive/projects/${projectId}/toggle?enable=${enable}`);
      toast.success(enable ? "Drive sync enabled" : "Drive sync disabled");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Toggle failed");
    }
  };

  const syncNow = async (projectId) => {
    setBusy(true);
    try {
      const r = await api.post(`/admin/google-drive/projects/${projectId}/sync-now`);
      toast.success(`Synced ${r.data.synced} file(s), ${r.data.failed} failed`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const isConfigured = status?.configured;
  const isConnected = status?.connected;

  return (
    <Card data-testid="gdrive-card">
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2">
          <FolderSync className="h-5 w-5" style={{ color: "#0F9D58" }} />
          Google Drive Mirror Sync
          {isConnected ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="h-3 w-3 mr-0.5" /> Connected
            </Badge>
          ) : isConfigured ? (
            <Badge variant="outline">Not connected</Badge>
          ) : (
            <Badge className="bg-rose-100 text-rose-700 border-rose-200">
              Not configured
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          When enabled, every project file you upload is mirrored into a
          "Bloom Labs — {`{Project Name}`}" folder inside your Google Drive.
        </p>

        {/* OAuth credentials form — Phase F (Feb 2026) */}
        <DriveCredentialsForm
          api={api}
          credentials={status?.credentials}
          onSaved={load}
        />

        {isConfigured && !isConnected && (
          <Button onClick={connect} disabled={busy} data-testid="gdrive-connect-btn">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
            Connect Google Drive
          </Button>
        )}
        {isConnected && (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 px-3 py-2">
              <div className="text-sm">
                <p className="font-medium">{status.account_email || "Connected"}</p>
                <p className="text-xs text-muted-foreground">
                  Last refresh:{" "}
                  {status.last_refresh_at
                    ? new Date(status.last_refresh_at).toLocaleString()
                    : "—"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={disconnect} disabled={busy} data-testid="gdrive-disconnect-btn">
                <Unlink className="h-3.5 w-3.5 mr-1.5" />
                Disconnect
              </Button>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-2">
                Per-project sync ({projects.length} project{projects.length === 1 ? "" : "s"})
              </p>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : projects.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No PM projects yet — create one in Project Mode first.
                </p>
              ) : (
                <div className="space-y-2" data-testid="gdrive-projects-list">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                      data-testid={`gdrive-project-row-${p.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.client_email || "no client"}
                          {p.last_sync_at &&
                            ` · last synced ${new Date(p.last_sync_at).toLocaleString()}`}
                        </p>
                      </div>
                      {p.drive_folder_link && (
                        <a
                          href={p.drive_folder_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </a>
                      )}
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(p.sync_to_drive)}
                          onChange={(e) => togglePromise(p.id, e.target.checked)}
                          data-testid={`gdrive-toggle-${p.id}`}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="text-xs">Sync</span>
                      </label>
                      {p.sync_to_drive && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => syncNow(p.id)}
                          disabled={busy}
                          data-testid={`gdrive-sync-now-${p.id}`}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}


// ============================================================================
// DriveCredentialsForm — admin can paste/rotate OAuth Client ID + Secret +
// Redirect URI without redeploying. Saves to the `google_drive_oauth_config`
// settings row; backend prefers this over env vars.
// ============================================================================
function DriveCredentialsForm({ api, credentials, onSaved }) {
  const [open, setOpen] = useState(!credentials?.client_id);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [saving, setSaving] = useState(false);
  const isConfigured = Boolean(credentials?.client_id);

  // Seed inputs from existing config so the admin can tweak one field without
  // re-entering everything. client_secret is intentionally NOT pre-filled
  // (we only have the redacted preview).
  useEffect(() => {
    if (credentials) {
      setClientId(credentials.client_id || "");
      setRedirectUri(credentials.redirect_uri || "");
    }
  }, [credentials]);

  const save = async () => {
    if (!clientId.trim() || !clientSecret.trim() || !redirectUri.trim()) {
      toast.error("Fill all three fields");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/google-drive/credentials", {
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        redirect_uri: redirectUri.trim(),
      });
      toast.success("Drive credentials saved");
      setClientSecret("");
      setOpen(false);
      onSaved && onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const clearStored = async () => {
    if (!window.confirm("Clear stored Drive credentials? You'll need to re-enter them to use Drive sync.")) return;
    setSaving(true);
    try {
      await api.delete("/admin/google-drive/credentials");
      toast.success("Stored credentials cleared");
      setClientId("");
      setClientSecret("");
      setRedirectUri("");
      onSaved && onSaved();
    } catch {
      toast.error("Clear failed");
    } finally {
      setSaving(false);
    }
  };

  if (!open && isConfigured) {
    return (
      <div
        className="rounded-lg bg-secondary/40 border border-border p-3 text-xs"
        data-testid="gdrive-credentials-summary"
      >
        <p className="font-medium text-foreground">OAuth credentials</p>
        <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
          <p>
            <strong>Client ID:</strong>{" "}
            <span className="font-mono break-all">
              {credentials.client_id?.slice(0, 18)}…{credentials.client_id?.slice(-18)}
            </span>
          </p>
          <p>
            <strong>Secret:</strong>{" "}
            <span className="font-mono">{credentials.client_secret_preview || "—"}</span>
          </p>
          <p className="sm:col-span-2">
            <strong>Redirect URI:</strong>{" "}
            <span className="font-mono break-all">{credentials.redirect_uri}</span>
          </p>
          <p className="sm:col-span-2 text-[10px] uppercase tracking-wider opacity-70">
            Source: client_id={credentials.source_client_id} · secret={credentials.source_client_secret} · redirect={credentials.source_redirect_uri}
            {credentials.updated_at &&
              ` · updated ${new Date(credentials.updated_at).toLocaleString()}`}
          </p>
        </div>
        <div className="mt-2.5 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
            data-testid="gdrive-credentials-edit"
          >
            Edit credentials
          </Button>
          {credentials.source_client_id === "db" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clearStored}
              disabled={saving}
              data-testid="gdrive-credentials-clear"
              className="text-rose-600 hover:bg-rose-50"
            >
              Clear & use env vars
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-border bg-card p-4 space-y-3"
      data-testid="gdrive-credentials-form"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">Google OAuth credentials</p>
        {isConfigured && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
            data-testid="gdrive-credentials-cancel"
          >
            Cancel
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Paste the values from your Google Cloud Console OAuth 2.0 Client.
        Stored credentials override any env vars set at deploy time.
      </p>
      <div>
        <Label className="text-xs">Client ID</Label>
        <Input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="123456789-abc...apps.googleusercontent.com"
          autoComplete="off"
          spellCheck={false}
          data-testid="gdrive-credentials-client-id"
          className="mt-1 font-mono text-xs"
        />
      </div>
      <div>
        <Label className="text-xs">
          Client Secret
          {credentials?.client_secret_set && (
            <span className="ml-1.5 text-[10px] text-muted-foreground">
              (current: {credentials.client_secret_preview} — re-enter to save changes)
            </span>
          )}
        </Label>
        <Input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="GOCSPX-…"
          autoComplete="off"
          spellCheck={false}
          data-testid="gdrive-credentials-client-secret"
          className="mt-1 font-mono text-xs"
        />
      </div>
      <div>
        <Label className="text-xs">Authorized Redirect URI</Label>
        <Input
          value={redirectUri}
          onChange={(e) => setRedirectUri(e.target.value)}
          placeholder="https://yourdomain.com/api/admin/google-drive/oauth/callback"
          autoComplete="off"
          spellCheck={false}
          data-testid="gdrive-credentials-redirect-uri"
          className="mt-1 font-mono text-xs"
        />
        <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
          Must match EXACTLY one of the Authorized redirect URIs in your Google
          Cloud Console OAuth Client.
        </p>
      </div>
      <div className="flex gap-2 justify-end">
        <Button
          size="sm"
          onClick={save}
          disabled={saving}
          data-testid="gdrive-credentials-save"
          className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
          Save credentials
        </Button>
      </div>
    </div>
  );
}
