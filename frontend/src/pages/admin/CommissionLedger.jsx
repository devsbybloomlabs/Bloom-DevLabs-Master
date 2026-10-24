/**
 * CommissionLedger — every commission entry. Approve eligible entries, then
 * mark an approved batch as paid with a payout reference.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { CheckCircle2, Receipt, Wallet } from "lucide-react";
import { StatusBadge, errMsg, fmtDate, fmtMoney, useLookups } from "@/components/admin/commission/shared";

const ALL = "all";

function entryBadge(e) {
  if (e.status === "accrued") return e.eligible ? "eligible" : "pending";
  return e.status;
}

export default function CommissionLedger() {
  const api = useAdminApi();
  const { people } = useLookups(api);
  const [items, setItems] = useState(null);
  const [personId, setPersonId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [selected, setSelected] = useState(new Set());
  const [payOpen, setPayOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (personId !== ALL) params.person_id = personId;
      if (status !== ALL) params.status = status;
      const { data } = await api.get("/admin/commissions/ledger", { params });
      setItems(data.items);
      setSelected(new Set());
    } catch (e) {
      toast.error(errMsg(e, "Could not load ledger"));
      setItems([]);
    }
  }, [api, personId, status]);

  useEffect(() => {
    load();
  }, [load]);

  const chosen = useMemo(() => (items || []).filter((e) => selected.has(e.id)), [items, selected]);
  const chosenTotal = chosen.reduce((s, e) => s + e.amount, 0);
  const approvable = chosen.filter((e) => e.eligible).map((e) => e.id);
  const payable = chosen.length > 0 && chosen.every((e) => e.status === "approved");

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const approve = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/commissions/ledger/approve", { entry_ids: approvable });
      toast.success(`${data.approved} entries approved`);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/commissions/ledger/mark-paid", {
        entry_ids: chosen.map((e) => e.id),
        reference,
      });
      toast.success(`Marked ${data.paid} entries paid (${fmtMoney(data.total)})`);
      setPayOpen(false);
      setReference("");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="commission-ledger-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Commission ledger</h1>
        <p className="text-sm text-muted-foreground">
          Entries appear when a client invoice is paid. They become approvable after the hold window.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Label className="text-xs">Person</Label>
          <Select value={personId} onValueChange={setPersonId}>
            <SelectTrigger data-testid="ledger-person-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone</SelectItem>
              {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid="ledger-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              <SelectItem value="accrued">Accrued</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {chosen.length > 0 && (
            <span className="text-sm text-muted-foreground" data-testid="ledger-selection-total">
              {chosen.length} selected · {fmtMoney(chosenTotal)}
            </span>
          )}
          <Button variant="outline" disabled={busy || approvable.length === 0} onClick={approve}
            data-testid="ledger-approve-button">
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve
          </Button>
          <Button disabled={busy || !payable} onClick={() => setPayOpen(true)} data-testid="ledger-markpaid-button">
            <Wallet className="h-4 w-4 mr-1.5" /> Mark paid
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {items === null ? (
            <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground" data-testid="ledger-empty">
              <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Nothing yet. Entries show up when an assigned company's invoice is paid.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Person</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead className="text-right">Net cash</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => (
                  <TableRow key={e.id} data-testid={`ledger-row-${e.id}`}>
                    <TableCell>
                      {(e.status === "accrued" || e.status === "approved") && (
                        <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)}
                          data-testid={`ledger-select-${e.id}`} />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{e.person_name}</TableCell>
                    <TableCell>{e.company_name}</TableCell>
                    <TableCell className="text-sm">
                      {e.invoice_number}
                      {e.kind === "adjustment" && <span className="ml-1 text-xs text-muted-foreground">(refund adj.)</span>}
                    </TableCell>
                    <TableCell className="text-sm">{fmtDate(e.invoice_paid_at)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(e.net_cash, e.currency)}</TableCell>
                    <TableCell className={`text-right font-medium ${e.amount < 0 ? "text-rose-600" : ""}`}>
                      {fmtMoney(e.amount, e.currency)}
                    </TableCell>
                    <TableCell><StatusBadge status={entryBadge(e)} /></TableCell>
                    <TableCell className="text-sm">
                      {e.status === "paid" ? `Paid ${fmtDate(e.paid_at)}${e.payout_ref ? ` · ${e.payout_ref}` : ""}` : fmtDate(e.eligible_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent data-testid="markpaid-dialog">
          <DialogHeader>
            <DialogTitle>Mark {chosen.length} entries paid</DialogTitle>
            <DialogDescription>
              Total {fmtMoney(chosenTotal)}. Record how you paid so the statement has a trail.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="pay-ref">Payout reference</Label>
            <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. PayPal txn ID or bank transfer ref" data-testid="markpaid-reference-input" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={markPaid} disabled={busy || !reference.trim()} data-testid="markpaid-confirm-button">
              Confirm payout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
