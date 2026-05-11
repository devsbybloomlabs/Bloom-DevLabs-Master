/**
 * Admin Integrations — connect/disconnect 3rd-party services.
 *
 * Currently supports: Nifty PM (OAuth2 + manual token fallback).
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
import { toast } from "sonner";
import {
  Link2,
  Unlink,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  KeyRound,
  Copy,
} from "lucide-react";

export default function IntegrationsAdmin() {
  return (
    <div className="space-y-6" data-testid="admin-integrations-page">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
          Integrations
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect Bloom Labs to your stack. We&apos;ll handle the token
          lifecycle (refresh + retry) automatically.
        </p>
      </div>
      <NiftyCard />
    </div>
  );
}

function NiftyCard() {
  const api = useAdminApi();
  const [status, setStatus] = useState(null);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualToken, setManualToken] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/integrations/nifty/status");
      setStatus(r.data);
      if (r.data?.connected && r.data?.ping_ok) {
        const [pRes, mRes] = await Promise.allSettled([
          api.get("/admin/integrations/nifty/projects"),
          api.get("/admin/integrations/nifty/members"),
        ]);
        const pData =
          pRes.status === "fulfilled" ? pRes.value.data : null;
        const mData =
          mRes.status === "fulfilled" ? mRes.value.data : null;
        setProjects(
          (pData?.projects || pData?.data || (Array.isArray(pData) ? pData : [])) || []
        );
        setMembers(
          (mData?.members || mData?.data || (Array.isArray(mData) ? mData : [])) || []
        );
      } else {
        setProjects([]);
        setMembers([]);
      }
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
    if (!window.confirm("Disconnect Nifty? All synced tokens will be erased.")) return;
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
      toast.success("Token saved + verified");
      setManualOpen(false);
      setManualToken("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Token rejected");
    } finally {
      setBusy(false);
    }
  };

  const connected = !!status?.connected;
  const pingOk = !!status?.ping_ok;

  return (
    <Card className="border-border" data-testid="nifty-integration-card">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-[#1E3A8A] text-white flex items-center justify-center flex-shrink-0 font-display font-semibold">
              N
            </div>
            <div className="min-w-0">
              <CardTitle className="font-display text-lg flex items-center gap-2">
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
                {!status?.oauth_configured && (
                  <Badge variant="outline" className="border-red-300 text-red-700">
                    OAuth not configured
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Task automation + milestone sync. Tokens auto-refresh.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
      <CardContent>
        {status && (
          <div className="rounded-lg bg-secondary/40 p-3 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Redirect URI:</span>
              <code className="font-mono">{status.redirect_uri}</code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Default project ID:</span>
              <code className="font-mono">{status.default_project_id || "—"}</code>
            </div>
            {status.stored && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Token source:</span>
                <code className="font-mono">{status.stored.source || "—"}</code>
              </div>
            )}
          </div>
        )}
        {connected && pingOk && (
          <div className="mt-4 space-y-4">
            {projects.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground mb-2">
                  Projects ({projects.length})
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {projects.slice(0, 8).map((p) => {
                    const pid = p.id || p._id || p.project_id || "";
                    return (
                      <div
                        key={pid}
                        className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm"
                        data-testid={`nifty-project-${pid}`}
                      >
                        <span className="truncate">{p.name || p.title || pid}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(pid);
                            toast.success("Project ID copied");
                          }}
                          className="h-7"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Tip: Set <code>NIFTY_PROJECT_ID</code> in <code>/app/backend/.env</code>{" "}
                  to the project where onboarding tasks should land, then restart the backend.
                </p>
              </div>
            )}
            {members.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground mb-2">
                  Members ({members.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {members.slice(0, 12).map((m, i) => (
                    <Badge key={i} variant="outline" className="text-[11px]">
                      {m.name || m.email || m.user_id || `Member ${i + 1}`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-lg border border-border bg-card p-3 text-xs">
              <p className="font-medium">Live wiring active:</p>
              <ul className="mt-1.5 space-y-0.5 text-muted-foreground list-disc list-inside">
                <li>Onboarding phase submission → Nifty task creation</li>
                <li>Nifty webhook → milestone status sync (in_progress / complete / blocked)</li>
                <li>Comments &quot;Client Notes:&quot; → portal milestone notes</li>
                <li>Daily 8am timeline refresh + 5-min comment poll</li>
              </ul>
            </div>
          </div>
        )}
        {!connected && status?.oauth_configured && (
          <div className="mt-4 rounded-lg border border-[#3B82F6]/30 bg-[#3B82F6]/5 p-4 text-sm">
            <p className="font-medium">Connect to enable:</p>
            <ul className="mt-1.5 ml-5 list-disc text-muted-foreground space-y-0.5">
              <li>Auto-create tasks on onboarding submission</li>
              <li>Sync task status to client portal milestones</li>
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
              isn&apos;t whitelisted. Get this from Nifty&apos;s developer
              portal or by running the OAuth flow manually.
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
