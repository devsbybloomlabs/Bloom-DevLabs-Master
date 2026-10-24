/**
 * PeopleAdmin — everyone who can be paid commission (employees, contractors, partners).
 */
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Users } from "lucide-react";
import { StatusBadge, errMsg } from "@/components/admin/commission/shared";

const EMPTY = { name: "", email: "", type: "partner", default_rate_pct: "", start_date: "", payout_notes: "" };

function PersonDialog({ person, open, onClose, onSaved, api }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      person
        ? {
            name: person.name,
            email: person.email,
            type: person.type,
            default_rate_pct: person.default_rate_pct ?? "",
            start_date: person.start_date || "",
            payout_notes: person.payout_notes || "",
          }
        : EMPTY,
    );
  }, [open, person]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    const body = {
      ...form,
      default_rate_pct: form.default_rate_pct === "" ? null : Number(form.default_rate_pct),
      start_date: form.start_date || null,
      payout_notes: form.payout_notes || null,
    };
    try {
      if (person) await api.patch(`/admin/people/${person.id}`, body);
      else await api.post("/admin/people", body);
      toast.success(person ? "Person updated" : "Person added");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errMsg(e, "Could not save person"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="person-dialog">
        <DialogHeader>
          <DialogTitle>{person ? "Edit person" : "Add person"}</DialogTitle>
          <DialogDescription>Anyone here can be assigned to companies and earn commission.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" value={form.name} onChange={set("name")} data-testid="person-name-input" />
          </div>
          <div>
            <Label htmlFor="p-email">Email</Label>
            <Input id="p-email" type="email" value={form.email} onChange={set("email")} data-testid="person-email-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger data-testid="person-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="p-rate">Default rate % (blank = Bloom Connect)</Label>
              <Input id="p-rate" type="number" min="0" max="100" step="0.5" value={form.default_rate_pct}
                onChange={set("default_rate_pct")} data-testid="person-rate-input" />
            </div>
          </div>
          <div>
            <Label htmlFor="p-start">Start date</Label>
            <Input id="p-start" type="date" value={form.start_date} onChange={set("start_date")} />
          </div>
          <div>
            <Label htmlFor="p-payout">Payout notes</Label>
            <Textarea id="p-payout" rows={2} value={form.payout_notes} onChange={set("payout_notes")}
              placeholder="e.g. PayPal email, bank details location" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.name || !form.email} data-testid="person-save-button">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PeopleAdmin() {
  const api = useAdminApi();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/people");
      setItems(data.items);
    } catch (e) {
      toast.error(errMsg(e, "Could not load people"));
      setItems([]);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (p) => {
    try {
      if (p.status === "active") await api.delete(`/admin/people/${p.id}`);
      else await api.patch(`/admin/people/${p.id}`, { status: "active" });
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="space-y-5" data-testid="people-admin-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground">Employees, contractors and partners who earn commission.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} data-testid="add-person-button">
          <Plus className="h-4 w-4 mr-1.5" /> Add person
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {items === null ? (
            <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground" data-testid="people-empty">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No one yet. Add your first payee to start tracking commission.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Default rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id} data-testid={`person-row-${p.id}`}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.email}</div>
                    </TableCell>
                    <TableCell className="capitalize">{p.type}</TableCell>
                    <TableCell>{p.default_rate_pct != null ? `${p.default_rate_pct}%` : "Bloom Connect"}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditing(p); setOpen(true); }}
                        data-testid={`edit-person-${p.id}`}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleStatus(p)}
                        data-testid={`toggle-person-${p.id}`}>
                        {p.status === "active" ? "Deactivate" : "Reactivate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PersonDialog person={editing} open={open} onClose={() => setOpen(false)} onSaved={load} api={api} />
    </div>
  );
}
