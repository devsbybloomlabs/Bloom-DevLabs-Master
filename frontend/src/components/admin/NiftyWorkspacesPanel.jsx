/**
 * NiftyWorkspacesPanel — snapshot + switch between connected Nifty workspaces.
 *
 * Embedded inside IntegrationsAdmin's NiftyCard. Lets the founder:
 *   • Save the currently-OAuthed workspace as a named snapshot
 *   • List all saved snapshots with last_activated timestamp
 *   • One-click activate any snapshot (copies tokens back into live integration)
 *   • Delete snapshots
 */
import { useEffect, useState, useCallback } from "react";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Save,
  Layers,
  CheckCircle2,
  Trash2,
  RefreshCw,
} from "lucide-react";

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

export default function NiftyWorkspacesPanel() {
  const api = useAdminApi();
  const [name, setName] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/integrations/nifty/workspaces");
      setData(r.data);
    } catch {
      setData({ snapshots: [] });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onSnapshot = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give the workspace a name");
      return;
    }
    setBusy(true);
    try {
      await api.post("/admin/integrations/nifty/workspaces", { name: trimmed });
      toast.success(`Snapshot "${trimmed}" saved`);
      setName("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save snapshot");
    } finally {
      setBusy(false);
    }
  };

  const onActivate = async (snapshot) => {
    setBusy(true);
    try {
      await api.post(`/admin/integrations/nifty/workspaces/${snapshot.id}/activate`);
      toast.success(`Switched to ${snapshot.name}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not activate");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (snapshot) => {
    if (!window.confirm(`Delete snapshot "${snapshot.name}"? Live integration is untouched.`)) {
      return;
    }
    try {
      await api.delete(`/admin/integrations/nifty/workspaces/${snapshot.id}`);
      toast.success("Snapshot deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  if (loading) {
    return <Skeleton className="h-32 w-full" data-testid="nifty-workspaces-loading" />;
  }

  const snapshots = data?.snapshots || [];
  const activeId = data?.active_workspace_id;

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3" data-testid="nifty-workspaces-panel">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
        <Layers className="h-3.5 w-3.5" />
        Saved workspaces
        <span className="text-muted-foreground/60 normal-case text-[10px] tracking-normal ml-1">
          (snapshot current OAuth + switch instantly)
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Production, NorthPeak Sandbox"
            className="h-9"
            data-testid="nifty-workspace-name-input"
          />
        </div>
        <Button
          size="sm"
          onClick={onSnapshot}
          disabled={busy}
          className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
          data-testid="nifty-workspace-save"
        >
          <Save className="h-3.5 w-3.5 mr-1.5" />
          Save current
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={load}
          data-testid="nifty-workspace-refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {snapshots.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2" data-testid="nifty-workspaces-empty">
          No saved workspaces yet. Connect via OAuth above, then save this connection
          under a memorable name.
        </div>
      ) : (
        <div className="space-y-1.5">
          {snapshots.map((s) => {
            const isActive = activeId === s.id;
            return (
              <div
                key={s.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border ${
                  isActive ? "border-emerald-300 bg-emerald-50/50" : "border-border bg-background"
                } p-2`}
                data-testid={`nifty-workspace-row-${s.id}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{s.name}</span>
                  {isActive && (
                    <Badge className="bg-emerald-100 text-emerald-900 border-0 text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-0.5" />
                      Active
                    </Badge>
                  )}
                  {s.workspace_user_email && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {s.workspace_user_email}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground tabular-nums mr-2">
                    {fmtTime(s.last_activated_at)}
                  </span>
                  {!isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onActivate(s)}
                      disabled={busy}
                      data-testid={`nifty-workspace-activate-${s.id}`}
                    >
                      Activate
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(s)}
                    disabled={busy}
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    data-testid={`nifty-workspace-delete-${s.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
