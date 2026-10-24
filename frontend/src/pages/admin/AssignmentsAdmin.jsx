/**
 * AssignmentsAdmin — who earns commission on which company, and on what terms.
 * Blank rate = person's default, then Bloom Connect (25%).
 */
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Link2, Plus } from "lucide-react";
import {
  RECURRING_LABELS,
  StatusBadge,
  errMsg,
  fmtDate,
  formatRate,
  useLookups,
} from "@/components/admin/commission/shared";

const DEFAULT = "default";
const EMPTY = {
  person_id: "", company_id: "", rate_type: "percent", rate_value: "",
  recurring_policy: DEFAULT, recurring_months: "", hold_days: "",
};

function AssignmentDialog({ open, onClose, onSaved, api, people, companies }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v) => (v === "" ? null : Number(v));

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/admin/commissions/assignments", {
        person_id: form.person_id,
        company_id: form.company_id,
        rate_type: form.rate_type,
        rate_value: num(form.rate_value),
        recurring_policy: form.recurring_policy === DEFAULT ? null : form.recurring_policy,
        recurring_months: num(form.recurring_months),
        hold_days: num(form.hold_days),
      });
      toast.success("Assignment created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errMsg(e, "Could not create assignment"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="assignment-dialog">
        <DialogHeader>
          <DialogTitle>New assignment</DialogTitle>
          <DialogDescription>
            Commission starts on invoices paid from now on. Leave rate blank to use the person's default or Bloom Connect.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Person</Label>
              <Select value={form.person_id} onValueChange={set("person_id")}>
                <SelectTrigger data-testid="assignment-person-select"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {people.filter((p) => p.status === "active").map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Company</Label>
              <Select value={form.company_id} onValueChange={set("company_id")}>
                <SelectTrigger data-testid="assignment-company-select"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Rate type</Label>
              <Select value={form.rate_type} onValueChange={set("rate_type")}>
                <SelectTrigger data-testid="assignment-ratetype-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percent of net cash</SelectItem>
                  <SelectItem value="flat">Flat per paid invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="a-rate">{form.rate_type === "flat" ? "Amount (USD)" : "Rate %"}</Label>
              <Input id="a-rate" type="number" min="0" step="0.5" value={form.rate_value}
                onChange={(e) => set("rate_value")(e.target.value)} placeholder="default"
                data-testid="assignment-rate-input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Recurring invoices</Label>
              <Select value={form.recurring_policy} onValueChange={set("recurring_policy")}>
                <SelectTrigger data-testid="assignment-recurring-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT}>Use global setting</SelectItem>
                  {Object.entries(RECURRING_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="a-months">Months (if first N)</Label>
              <Input id="a-months" type="number" min="1" value={form.recurring_months}
                onChange={(e) => set("recurring_months")(e.target.value)} placeholder="global" />
            </div>
          </div>
          <div>
            <Label htmlFor="a-hold">Hold days before payable</Label>
            <Input id="a-hold" type="number" min="0" value={form.hold_days}
              onChange={(e) => set("hold_days")(e.target.value)} placeholder="global" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.person_id || !form.company_id}
            data-testid="assignment-save-button">
            {saving ? "Saving…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AssignmentsAdmin() {
  const api = useAdminApi();
  const { people, companies } = useLookups(api);
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/commissions/assignments");
      setItems(data.items);
    } catch (e) {
      toast.error(errMsg(e, "Could not load assignments"));
      setItems([]);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (a) => {
    try {
      if (a.active) await api.delete(`/admin/commissions/assignments/${a.id}`);
      else await api.patch(`/admin/commissions/assignments/${a.id}`, { active: true });
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="space-y-5" data-testid="assignments-admin-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assignments</h1>
          <p className="text-sm text-muted-foreground">Who earns on which company, and the terms.</p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="add-assignment-button">
          <Plus className="h-4 w-4 mr-1.5" /> New assignment
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {items === null ? (
            <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground" data-testid="assignments-empty">
              <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No assignments yet. Add a person first, then link them to a company.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Recurring</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => (
                  <TableRow key={a.id} data-testid={`assignment-row-${a.id}`}>
                    <TableCell className="font-medium">{a.person_name}</TableCell>
                    <TableCell>{a.company_name}</TableCell>
                    <TableCell>{formatRate(a.effective_rate_type, a.effective_rate_value)}</TableCell>
                    <TableCell className="text-sm">
                      {a.recurring_policy
                        ? `${RECURRING_LABELS[a.recurring_policy]}${a.recurring_policy === "first_n_months" && a.recurring_months ? ` (${a.recurring_months})` : ""}`
                        : "Global"}
                    </TableCell>
                    <TableCell className="text-sm">{fmtDate(a.starts_at)}</TableCell>
                    <TableCell><StatusBadge status={a.active ? "active" : "inactive"} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => toggle(a)} data-testid={`toggle-assignment-${a.id}`}>
                        {a.active ? "End" : "Reactivate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AssignmentDialog open={open} onClose={() => setOpen(false)} onSaved={load} api={api}
        people={people} companies={companies} />
    </div>
  );
}
