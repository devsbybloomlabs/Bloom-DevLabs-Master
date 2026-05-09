import { useEffect, useMemo, useState } from "react";
import { authClient, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Trash2, Edit2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

const STATUSES = [
  { value: "new", label: "New", color: "bg-secondary text-foreground" },
  { value: "contacted", label: "Contacted", color: "bg-blue-100 text-blue-900" },
  { value: "qualified", label: "Qualified", color: "bg-amber-100 text-amber-900" },
  { value: "proposal", label: "Proposal", color: "bg-purple-100 text-purple-900" },
  { value: "won", label: "Won", color: "bg-emerald-100 text-emerald-900" },
  { value: "lost", label: "Lost", color: "bg-red-100 text-red-900" },
];

const BLANK = {
  name: "",
  company: "",
  email: "",
  linkedin: "",
  industry: "",
  source: "manual",
  status: "new",
  notes: "",
  deal_value: "",
  next_action: "",
  next_action_at: "",
};

export default function PipelinePage() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([api.get("/pipeline/prospects"), api.get("/pipeline/summary")]);
      setProspects(a.data);
      setSummary(b.data);
    } catch {
      toast.error("Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(BLANK);
    setOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name || "",
      company: p.company || "",
      email: p.email || "",
      linkedin: p.linkedin || "",
      industry: p.industry || "",
      source: p.source || "manual",
      status: p.status || "new",
      notes: p.notes || "",
      deal_value: p.deal_value ?? "",
      next_action: p.next_action || "",
      next_action_at: p.next_action_at ? p.next_action_at.slice(0, 16) : "",
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      payload.deal_value = payload.deal_value === "" ? null : Number(payload.deal_value);
      payload.next_action_at = payload.next_action_at
        ? new Date(payload.next_action_at).toISOString()
        : null;
      if (!payload.email) payload.email = null;
      if (!payload.linkedin) payload.linkedin = null;
      if (editing) {
        await api.patch(`/pipeline/prospects/${editing.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post("/pipeline/prospects", payload);
        toast.success("Prospect added");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this prospect?")) return;
    try {
      await api.delete(`/pipeline/prospects/${id}`);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="space-y-6" data-testid="pipeline-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track prospects, deals, and progress toward $90K.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
          data-testid="pipeline-add-button"
        >
          <Plus className="h-4 w-4 mr-2" /> Add prospect
        </Button>
      </div>

      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard label="Closed revenue" value={`$${(summary.closed_revenue || 0).toLocaleString()}`} sub={`${summary.progress_pct}% of target`} />
          <SummaryCard label="Pipeline value" value={`$${(summary.pipeline_value || 0).toLocaleString()}`} sub={`${summary.total_prospects} prospects`} />
          <SummaryCard label="Won deals" value={summary.by_status?.won || 0} sub="all-time" />
          <SummaryCard label="Active deals" value={(summary.by_status?.qualified || 0) + (summary.by_status?.proposal || 0)} sub="qualified + proposal" />
        </div>
      )}

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Prospects ({prospects.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : prospects.length === 0 ? (
            <div className="p-10 text-center">
              <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No prospects yet. Add your first one to start tracking.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-normal">Name</th>
                    <th className="px-4 py-3 font-normal hidden md:table-cell">Company</th>
                    <th className="px-4 py-3 font-normal hidden lg:table-cell">Industry</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 font-normal text-right">Deal</th>
                    <th className="px-4 py-3 font-normal text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {prospects.map((p) => {
                    const statusMeta = STATUSES.find((s) => s.value === p.status) || STATUSES[0];
                    return (
                      <tr
                        key={p.id}
                        data-testid={`pipeline-row-${p.id}`}
                        className="border-b border-border last:border-b-0 hover:bg-secondary/40 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium">{p.name}</div>
                          {p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">{p.company || "—"}</td>
                        <td className="px-4 py-3 hidden lg:table-cell">{p.industry || "—"}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={statusMeta.color + " border-0 font-normal"}>
                            {statusMeta.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {p.deal_value ? `$${Number(p.deal_value).toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(p)}
                            aria-label="Edit"
                            data-testid={`pipeline-row-${p.id}-edit"`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(p.id)}
                            aria-label="Delete"
                            data-testid={`pipeline-row-${p.id}-delete"`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" data-testid="pipeline-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit prospect" : "Add prospect"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="pipeline-form-name"
              />
            </Field>
            <Field label="Company">
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} data-testid="pipeline-form-company" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email">
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" data-testid="pipeline-form-email" />
              </Field>
              <Field label="Industry">
                <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} data-testid="pipeline-form-industry" />
              </Field>
            </div>
            <Field label="LinkedIn URL">
              <Input value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} data-testid="pipeline-form-linkedin" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger data-testid="pipeline-form-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Source">
                <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} data-testid="pipeline-form-source" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Deal value (USD)">
                <Input value={form.deal_value} onChange={(e) => setForm({ ...form, deal_value: e.target.value })} type="number" data-testid="pipeline-form-deal-value" />
              </Field>
              <Field label="Next action at">
                <Input value={form.next_action_at} onChange={(e) => setForm({ ...form, next_action_at: e.target.value })} type="datetime-local" data-testid="pipeline-form-next-action-at" />
              </Field>
            </div>
            <Field label="Next action">
              <Input value={form.next_action} onChange={(e) => setForm({ ...form, next_action: e.target.value })} data-testid="pipeline-form-next-action" />
            </Field>
            <Field label="Notes">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="pipeline-form-notes" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name} className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white" data-testid="pipeline-form-save">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ label, value, sub }) {
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
        <div className="font-display text-2xl font-semibold mt-2 tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <Label className="text-sm">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
