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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Plus,
  Pencil,
  Trash2,
  Loader2,
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
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "", name: "", company: "", status: "active", send_setup_email: true,
  });
  const [editClient, setEditClient] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", company: "", status: "active", notes: "" });
  const [deleteClient, setDeleteClient] = useState(null);

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

  const onCreate = async () => {
    const email = createForm.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Valid email required");
      return;
    }
    setBusyEmail("__create__");
    try {
      const r = await api.post("/admin/clients", {
        email,
        name: createForm.name.trim(),
        company: createForm.company.trim() || null,
        status: createForm.status,
        send_setup_email: createForm.send_setup_email,
      });
      if (r.data?.setup_url) {
        try {
          await navigator.clipboard.writeText(r.data.setup_url);
        } catch {
          // ignore
        }
        toast.success("Client created — setup link emailed + copied to clipboard");
      } else {
        toast.success("Client created");
      }
      setCreateOpen(false);
      setCreateForm({ email: "", name: "", company: "", status: "active", send_setup_email: true });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create client");
    } finally {
      setBusyEmail(null);
    }
  };

  const openEdit = (c) => {
    setEditClient(c);
    setEditForm({
      name: c.name || "",
      company: c.company || "",
      status: c.status || "active",
      notes: c.notes || "",
    });
  };

  const onSaveEdit = async () => {
    if (!editClient) return;
    setBusyEmail(editClient.email);
    try {
      await api.patch(`/admin/clients/${encodeURIComponent(editClient.email)}`, {
        name: editForm.name.trim(),
        company: editForm.company.trim() || null,
        status: editForm.status,
        notes: editForm.notes.trim() || null,
      });
      toast.success("Client updated");
      setEditClient(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update client");
    } finally {
      setBusyEmail(null);
    }
  };

  const onConfirmDelete = async () => {
    if (!deleteClient) return;
    setBusyEmail(deleteClient.email);
    try {
      await api.delete(`/admin/clients/${encodeURIComponent(deleteClient.email)}`);
      toast.success("Client archived");
      setDeleteClient(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not archive client");
    } finally {
      setBusyEmail(null);
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
        <div className="flex flex-wrap items-center gap-2">
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
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="admin-clients-new-button"
          >
            <Plus className="h-4 w-4 mr-2" />
            New client
          </Button>
        </div>
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
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(c)}
                            data-testid={`admin-client-edit-${c.email}`}
                            title="Edit details"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteClient(c)}
                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            data-testid={`admin-client-delete-${c.email}`}
                            title="Archive client"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {/* New client dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="admin-clients-create-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <Plus className="h-5 w-5 text-[#1E3A8A]" />
              New client
            </DialogTitle>
            <DialogDescription>
              Provision a client portal account. They&apos;ll get a branded password
              setup email so they can log in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="new-client-email">Email *</Label>
              <Input
                id="new-client-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="client@company.com"
                data-testid="admin-clients-create-email"
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="new-client-name">Name</Label>
                <Input
                  id="new-client-name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Doe"
                  data-testid="admin-clients-create-name"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="new-client-company">Company</Label>
                <Input
                  id="new-client-company"
                  value={createForm.company}
                  onChange={(e) => setCreateForm((f) => ({ ...f, company: e.target.value }))}
                  placeholder="Acme Inc."
                  data-testid="admin-clients-create-company"
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={createForm.status}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger className="mt-1.5" data-testid="admin-clients-create-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm pt-1.5">
              <input
                type="checkbox"
                checked={createForm.send_setup_email}
                onChange={(e) => setCreateForm((f) => ({ ...f, send_setup_email: e.target.checked }))}
                data-testid="admin-clients-create-send-email"
              />
              Send password setup email + copy link to clipboard
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={onCreate}
              disabled={busyEmail === "__create__"}
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
              data-testid="admin-clients-create-submit"
            >
              {busyEmail === "__create__" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1.5" />
              )}
              Create client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={Boolean(editClient)} onOpenChange={(o) => !o && setEditClient(null)}>
        <DialogContent data-testid="admin-clients-edit-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <Pencil className="h-5 w-5 text-[#1E3A8A]" />
              Edit {editClient?.email}
            </DialogTitle>
          </DialogHeader>
          {editClient && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    data-testid="admin-clients-edit-name"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-company">Company</Label>
                  <Input
                    id="edit-company"
                    value={editForm.company}
                    onChange={(e) => setEditForm((f) => ({ ...f, company: e.target.value }))}
                    data-testid="admin-clients-edit-company"
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger className="mt-1.5" data-testid="admin-clients-edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-notes">Internal notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Anything the team should know about this client…"
                  rows={3}
                  data-testid="admin-clients-edit-notes"
                  className="mt-1.5"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditClient(null)}>Cancel</Button>
            <Button
              onClick={onSaveEdit}
              disabled={busyEmail === editClient?.email}
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
              data-testid="admin-clients-edit-submit"
            >
              {busyEmail === editClient?.email ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={Boolean(deleteClient)} onOpenChange={(o) => !o && setDeleteClient(null)}>
        <DialogContent data-testid="admin-clients-delete-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-600" />
              Archive client
            </DialogTitle>
            <DialogDescription>
              This archives <strong>{deleteClient?.email}</strong>. Their login + portal
              access is revoked, but their payments, onboarding, milestones, and support
              history are preserved. You can restore by editing them and switching status
              back to Active.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteClient(null)}>Cancel</Button>
            <Button
              onClick={onConfirmDelete}
              disabled={busyEmail === deleteClient?.email}
              className="bg-rose-600 hover:bg-rose-700 text-white"
              data-testid="admin-clients-delete-confirm"
            >
              {busyEmail === deleteClient?.email ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
