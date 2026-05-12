/**
 * InvoicesAdmin — full CRUD for the internal invoice system that replaced AgencyHandy.
 *
 * Capabilities:
 *  • List invoices with status filter + email search
 *  • Create a manual invoice (line items, discount, tax, due date)
 *  • View / edit status + notes
 *  • Download branded PDF (or open in a new tab)
 *  • Resend invoice email
 *  • Void invoice
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
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
  FileText,
  Plus,
  Search,
  RefreshCw,
  Download,
  Send,
  Trash2,
  ExternalLink,
  Pencil,
  Receipt,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";

const STATUS_STYLES = {
  paid: "bg-emerald-100 text-emerald-900",
  issued: "bg-blue-100 text-blue-900",
  draft: "bg-secondary text-foreground",
  void: "bg-rose-100 text-rose-900",
  overdue: "bg-rose-100 text-rose-900",
  partial: "bg-amber-100 text-amber-900",
};

const STATUSES = ["issued", "paid", "draft", "partial", "overdue", "void"];

function fmtMoney(n, c = "USD") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c,
      maximumFractionDigits: 2,
    }).format(Number(n || 0));
  } catch {
    return `${c} ${Number(n || 0).toFixed(2)}`;
  }
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function InvoicesAdmin() {
  const api = useAdminApi();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(_emptyCreate());
  const [busyId, setBusyId] = useState(null);
  const [editInv, setEditInv] = useState(null);
  const [editForm, setEditForm] = useState({ status: "issued", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/invoices");
      setInvoices(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load invoices");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (!q) return true;
      return (
        inv.number.toLowerCase().includes(q) ||
        (inv.client_email || "").toLowerCase().includes(q) ||
        (inv.client_name || "").toLowerCase().includes(q) ||
        (inv.client_company || "").toLowerCase().includes(q)
      );
    });
  }, [invoices, query, statusFilter]);

  const stats = useMemo(() => {
    let outstanding = 0;
    let collected = 0;
    let drafts = 0;
    for (const inv of invoices) {
      if (inv.status === "paid") collected += Number(inv.total || 0);
      else if (inv.status === "draft") drafts += 1;
      else if (["issued", "partial", "overdue"].includes(inv.status))
        outstanding += Number(inv.balance_due || inv.total || 0);
    }
    return { outstanding, collected, drafts, count: invoices.length };
  }, [invoices]);

  const openCreate = () => {
    setCreateForm(_emptyCreate());
    setCreateOpen(true);
  };

  const onCreate = async () => {
    const cleaned = createForm.line_items
      .filter((li) => li.description && Number(li.unit_price) > 0)
      .map((li) => ({
        description: li.description,
        quantity: Number(li.quantity) || 1,
        unit_price: Number(li.unit_price),
        amount: (Number(li.quantity) || 1) * Number(li.unit_price),
      }));
    if (!createForm.client_email || cleaned.length === 0) {
      toast.error("Client email + at least one line item required");
      return;
    }
    setBusyId("__create__");
    try {
      const r = await api.post("/admin/invoices", {
        client_email: createForm.client_email,
        client_name: createForm.client_name,
        client_company: createForm.client_company || null,
        line_items: cleaned,
        currency: createForm.currency,
        discount: Number(createForm.discount) || 0,
        tax: Number(createForm.tax) || 0,
        due_at: createForm.due_at || null,
        notes: createForm.notes || null,
        send_email: createForm.send_email,
      });
      toast.success(
        `Invoice ${r.data.number} created${createForm.send_email ? " + emailed" : ""}`
      );
      setCreateOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create invoice");
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (inv) => {
    setEditInv(inv);
    setEditForm({ status: inv.status, notes: inv.notes || "" });
  };

  const onSaveEdit = async () => {
    if (!editInv) return;
    setBusyId(editInv.id);
    try {
      await api.patch(`/admin/invoices/${editInv.id}`, {
        status: editForm.status,
        notes: editForm.notes || null,
      });
      toast.success("Invoice updated");
      setEditInv(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update");
    } finally {
      setBusyId(null);
    }
  };

  const onResend = async (inv) => {
    setBusyId(inv.id);
    try {
      const r = await api.post(`/admin/invoices/${inv.id}/send-email`);
      toast.success(r.data?.sent ? "Email sent" : "Email queued (check logs)");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not send");
    } finally {
      setBusyId(null);
    }
  };

  const copyPayLink = async (inv) => {
    const origin =
      (typeof window !== "undefined" && window.location.origin) ||
      BACKEND.replace("/api", "");
    const url = `${origin}/pay/invoice/${inv.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Pay link copied — paste into chat/email");
    } catch {
      window.prompt("Copy this pay link:", url);
    }
  };

  const onVoid = async (inv) => {
    if (!window.confirm(`Void invoice ${inv.number}? This sets status to "void".`))
      return;
    setBusyId(inv.id);
    try {
      await api.delete(`/admin/invoices/${inv.id}`);
      toast.success("Invoice voided");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not void");
    } finally {
      setBusyId(null);
    }
  };

  const downloadPdf = async (inv) => {
    try {
      const headers = {};
      const token = localStorage.getItem("auth_token");
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${BACKEND}/api/admin/invoices/${inv.id}/pdf`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inv.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("PDF download failed");
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-invoices-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-[#1E3A8A]" />
            Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            In-house invoices replace AgencyHandy entirely. Every PayPal capture auto-generates one,
            and you can issue ad-hoc invoices for add-ons + consulting hours below.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            data-testid="admin-invoices-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={openCreate}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="admin-invoices-new-button"
          >
            <Plus className="h-4 w-4 mr-2" />
            New invoice
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Total" value={stats.count} icon={Receipt} />
        <StatTile
          label="Outstanding"
          value={fmtMoney(stats.outstanding)}
          icon={FileText}
          accent="text-amber-600"
        />
        <StatTile
          label="Collected"
          value={fmtMoney(stats.collected)}
          icon={FileText}
          accent="text-emerald-600"
        />
        <StatTile
          label="Drafts"
          value={stats.drafts}
          icon={Pencil}
          accent="text-blue-600"
        />
      </div>

      <Card className="border-border">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {filtered.length} of {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36" data-testid="admin-invoices-status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by number / email / client"
                  className="pl-9"
                  data-testid="admin-invoices-search"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground" data-testid="admin-invoices-empty">
              {invoices.length === 0
                ? "No invoices yet. They'll appear here as payments are captured."
                : "No invoices match the filters."}
            </div>
          ) : (
            <div className="space-y-2" data-testid="admin-invoices-list">
              {filtered.map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-lg border border-border bg-card p-4 hover:bg-secondary/20 transition-colors"
                  data-testid={`admin-invoice-row-${inv.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${STATUS_STYLES[inv.status] || "bg-secondary"} border-0 text-[10px] capitalize`}>
                          {inv.status}
                        </Badge>
                        <span className="font-mono text-sm font-medium">{inv.number}</span>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {inv.source.replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {inv.client_name || inv.client_email}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {inv.client_email}
                        {inv.client_company && ` · ${inv.client_company}`}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Issued {fmtDate(inv.issued_at)}
                        {inv.due_at && ` · Due ${fmtDate(inv.due_at)}`}
                        {inv.paid_at && ` · Paid ${fmtDate(inv.paid_at)}`}
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="font-display text-lg font-semibold">
                        {fmtMoney(inv.total, inv.currency)}
                      </div>
                      {inv.balance_due > 0 && inv.status !== "paid" && (
                        <div className="text-[11px] text-rose-700">
                          {fmtMoney(inv.balance_due, inv.currency)} due
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => downloadPdf(inv)}
                      data-testid={`admin-invoice-pdf-${inv.id}`}
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(`${BACKEND}/api/admin/invoices/${inv.id}/pdf?inline=1`, "_blank")}
                      data-testid={`admin-invoice-view-${inv.id}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyPayLink(inv)}
                      disabled={inv.status === "paid" || inv.status === "void"}
                      data-testid={`admin-invoice-copy-pay-link-${inv.id}`}
                    >
                      <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                      Pay link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onResend(inv)}
                      disabled={busyId === inv.id}
                      data-testid={`admin-invoice-resend-${inv.id}`}
                    >
                      {busyId === inv.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(inv)}
                      data-testid={`admin-invoice-edit-${inv.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                    {inv.status !== "void" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onVoid(inv)}
                        disabled={busyId === inv.id}
                        className="text-rose-700 hover:bg-rose-50"
                        data-testid={`admin-invoice-void-${inv.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Void
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateInvoiceDialog
        open={createOpen}
        setOpen={setCreateOpen}
        form={createForm}
        setForm={setCreateForm}
        onSubmit={onCreate}
        busy={busyId === "__create__"}
      />

      <Dialog open={Boolean(editInv)} onOpenChange={(o) => !o && setEditInv(null)}>
        <DialogContent data-testid="admin-invoices-edit-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              Edit {editInv?.number}
            </DialogTitle>
            <DialogDescription>
              Update status + notes. Changing to <strong>paid</strong> stamps the paid date
              automatically. Voiding clears the balance.
            </DialogDescription>
          </DialogHeader>
          {editInv && (
            <div className="space-y-3">
              <div>
                <Label>Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger className="mt-1.5" data-testid="admin-invoices-edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-inv-notes">Notes (visible on PDF)</Label>
                <Textarea
                  id="edit-inv-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Thank-you note, payment terms, etc."
                  className="mt-1.5"
                  data-testid="admin-invoices-edit-notes"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditInv(null)}>Cancel</Button>
            <Button
              onClick={onSaveEdit}
              disabled={busyId === editInv?.id}
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
              data-testid="admin-invoices-edit-submit"
            >
              Save
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

function _emptyCreate() {
  return {
    client_email: "",
    client_name: "",
    client_company: "",
    line_items: [{ description: "", quantity: 1, unit_price: 0 }],
    currency: "USD",
    discount: 0,
    tax: 0,
    due_at: "",
    notes: "",
    send_email: true,
  };
}

function CreateInvoiceDialog({ open, setOpen, form, setForm, onSubmit, busy }) {
  const subtotal = form.line_items.reduce(
    (acc, li) => acc + (Number(li.quantity) || 1) * Number(li.unit_price || 0),
    0
  );
  const total = subtotal - Number(form.discount || 0) + Number(form.tax || 0);

  const updateItem = (i, patch) => {
    setForm((f) => {
      const items = [...f.line_items];
      items[i] = { ...items[i], ...patch };
      return { ...f, line_items: items };
    });
  };
  const addItem = () =>
    setForm((f) => ({
      ...f,
      line_items: [...f.line_items, { description: "", quantity: 1, unit_price: 0 }],
    }));
  const removeItem = (i) =>
    setForm((f) => ({
      ...f,
      line_items: f.line_items.filter((_, idx) => idx !== i),
    }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="admin-invoices-create-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Plus className="h-5 w-5 text-[#1E3A8A]" />
            New invoice
          </DialogTitle>
          <DialogDescription>
            Create a branded invoice manually. The client gets a PDF copy + a payable link.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inv-client-email">Client email *</Label>
              <Input
                id="inv-client-email"
                type="email"
                value={form.client_email}
                onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))}
                placeholder="client@company.com"
                className="mt-1.5"
                data-testid="admin-invoices-create-email"
              />
            </div>
            <div>
              <Label htmlFor="inv-client-name">Client name</Label>
              <Input
                id="inv-client-name"
                value={form.client_name}
                onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                placeholder="Jane Doe"
                className="mt-1.5"
                data-testid="admin-invoices-create-name"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="inv-client-company">Company (optional)</Label>
            <Input
              id="inv-client-company"
              value={form.client_company}
              onChange={(e) => setForm((f) => ({ ...f, client_company: e.target.value }))}
              placeholder="Acme Inc."
              className="mt-1.5"
              data-testid="admin-invoices-create-company"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Line items *</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={addItem}
                data-testid="admin-invoices-add-line"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add line
              </Button>
            </div>
            <div className="space-y-2">
              {form.line_items.map((li, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 items-end"
                  data-testid={`admin-invoices-line-${i}`}
                >
                  <Input
                    className="col-span-6"
                    placeholder="Description"
                    value={li.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                    data-testid={`admin-invoices-line-${i}-description`}
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={li.quantity}
                    onChange={(e) => updateItem(i, { quantity: e.target.value })}
                    placeholder="Qty"
                    data-testid={`admin-invoices-line-${i}-quantity`}
                  />
                  <Input
                    className="col-span-3"
                    type="number"
                    step="0.01"
                    min="0"
                    value={li.unit_price}
                    onChange={(e) => updateItem(i, { unit_price: e.target.value })}
                    placeholder="Unit price"
                    data-testid={`admin-invoices-line-${i}-price`}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="col-span-1 text-rose-600"
                    onClick={() => removeItem(i)}
                    disabled={form.line_items.length === 1}
                    data-testid={`admin-invoices-line-${i}-remove`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label htmlFor="inv-currency">Currency</Label>
              <Input
                id="inv-currency"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                className="mt-1.5"
                data-testid="admin-invoices-create-currency"
              />
            </div>
            <div>
              <Label htmlFor="inv-discount">Discount</Label>
              <Input
                id="inv-discount"
                type="number"
                step="0.01"
                min="0"
                value={form.discount}
                onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
                className="mt-1.5"
                data-testid="admin-invoices-create-discount"
              />
            </div>
            <div>
              <Label htmlFor="inv-tax">Tax</Label>
              <Input
                id="inv-tax"
                type="number"
                step="0.01"
                min="0"
                value={form.tax}
                onChange={(e) => setForm((f) => ({ ...f, tax: e.target.value }))}
                className="mt-1.5"
                data-testid="admin-invoices-create-tax"
              />
            </div>
            <div>
              <Label htmlFor="inv-due">Due date</Label>
              <Input
                id="inv-due"
                type="date"
                value={form.due_at}
                onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
                className="mt-1.5"
                data-testid="admin-invoices-create-due"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-[var(--warm-50)] px-4 py-3 text-sm space-y-1 tabular-nums">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{fmtMoney(subtotal, form.currency)}</span>
            </div>
            {Number(form.discount) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount</span>
                <span>−{fmtMoney(form.discount, form.currency)}</span>
              </div>
            )}
            {Number(form.tax) > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span>{fmtMoney(form.tax, form.currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold pt-1.5 border-t border-border/60">
              <span>Total</span>
              <span data-testid="admin-invoices-create-total">{fmtMoney(total, form.currency)}</span>
            </div>
          </div>

          <div>
            <Label htmlFor="inv-notes">Notes (shown on PDF + email)</Label>
            <Textarea
              id="inv-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Thank you for your business · Payable via PayPal within 7 days"
              className="mt-1.5"
              data-testid="admin-invoices-create-notes"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.send_email}
              onChange={(e) => setForm((f) => ({ ...f, send_email: e.target.checked }))}
              data-testid="admin-invoices-create-send-email"
            />
            Email the invoice to the client now
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={onSubmit}
            disabled={busy}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="admin-invoices-create-submit"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Create invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
