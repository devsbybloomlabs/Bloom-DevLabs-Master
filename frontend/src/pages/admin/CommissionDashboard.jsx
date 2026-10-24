/**
 * CommissionDashboard — who is owed commission, from which clients, and how much.
 * Includes a what-if calculator and the global commission settings
 * (Bloom Connect default rate, hold window, recurring policy).
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Calculator, Coins, Percent, Wallet } from "lucide-react";
import { RECURRING_LABELS, errMsg, fmtMoney, useLookups } from "@/components/admin/commission/shared";

const ANY = "any";

function Kpi({ label, value, hint, icon: Icon, testid }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {label}
          <Icon className="h-4 w-4" />
        </div>
        <div className="mt-1 text-2xl font-semibold tracking-tight" data-testid={testid}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function CalculatorCard({ api, people, companies }) {
  const [amount, setAmount] = useState("1000");
  const [personId, setPersonId] = useState(ANY);
  const [companyId, setCompanyId] = useState(ANY);
  const [recurring, setRecurring] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const n = Number(amount);
    if (!n || n < 0) {
      setResult(null);
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const params = { amount: n, recurring };
        if (personId !== ANY) params.person_id = personId;
        if (companyId !== ANY) params.company_id = companyId;
        const { data } = await api.get("/admin/commissions/calculator", { params });
        setResult(data);
      } catch {
        setResult(null);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [api, amount, personId, companyId, recurring]);

  return (
    <Card data-testid="commission-calculator">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4" /> Calculator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="calc-amount" className="text-xs">Net cash collected (USD)</Label>
          <Input id="calc-amount" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
            data-testid="calculator-amount-input" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={personId} onValueChange={setPersonId}>
            <SelectTrigger data-testid="calculator-person-select"><SelectValue placeholder="Person" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Anyone (Bloom Connect)</SelectItem>
              {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger data-testid="calculator-company-select"><SelectValue placeholder="Company" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any company</SelectItem>
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={recurring} onCheckedChange={setRecurring} data-testid="calculator-recurring-switch" />
          Recurring invoice
        </label>
        {result && (
          <div className="rounded-lg bg-secondary/60 p-3 text-sm space-y-1" data-testid="calculator-result">
            <div className="flex justify-between"><span>Rate</span>
              <span>{result.rate_type === "flat" ? fmtMoney(result.rate_value) : `${result.rate_value}%`}</span></div>
            <div className="flex justify-between font-semibold"><span>Commission</span>
              <span data-testid="calculator-commission">{fmtMoney(result.commission)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Bloom keeps</span>
              <span>{fmtMoney(result.bloom_keeps)}</span></div>
            {recurring && result.recurring_policy === "one_time" && (
              <div className="text-xs text-amber-700">Recurring invoices don't earn commission under this policy.</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsCard({ api }) {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/admin/commissions/settings").then((r) => setS(r.data)).catch(() => {});
  }, [api]);

  if (!s) return <Skeleton className="h-64" />;
  const set = (k) => (v) => setS((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/admin/commissions/settings", {
        default_rate_pct: Number(s.default_rate_pct),
        hold_days: Number(s.hold_days),
        recurring_policy: s.recurring_policy,
        recurring_months: Number(s.recurring_months),
      });
      setS(data);
      toast.success("Settings saved");
    } catch (e) {
      toast.error(errMsg(e, "Could not save settings"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="commission-settings">
      <CardHeader className="pb-2"><CardTitle className="text-base">Defaults</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="set-rate" className="text-xs">Bloom Connect rate %</Label>
          <Input id="set-rate" type="number" min="0" max="100" step="0.5" value={s.default_rate_pct}
            onChange={(e) => set("default_rate_pct")(e.target.value)} data-testid="settings-rate-input" />
        </div>
        <div>
          <Label htmlFor="set-hold" className="text-xs">Hold days before payable</Label>
          <Input id="set-hold" type="number" min="0" value={s.hold_days}
            onChange={(e) => set("hold_days")(e.target.value)} data-testid="settings-hold-input" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Recurring invoices</Label>
            <Select value={s.recurring_policy} onValueChange={set("recurring_policy")}>
              <SelectTrigger data-testid="settings-recurring-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(RECURRING_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="set-months" className="text-xs">Months (first N)</Label>
            <Input id="set-months" type="number" min="1" value={s.recurring_months}
              onChange={(e) => set("recurring_months")(e.target.value)} />
          </div>
        </div>
        <Button className="w-full" onClick={save} disabled={saving} data-testid="settings-save-button">
          {saving ? "Saving…" : "Save defaults"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function CommissionDashboard() {
  const api = useAdminApi();
  const { people, companies } = useLookups(api);
  const [data, setData] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    try {
      const params = {};
      if (from) params.date_from = from;
      if (to) params.date_to = to;
      const r = await api.get("/admin/commissions/summary", { params });
      setData(r.data);
    } catch (e) {
      toast.error(errMsg(e, "Could not load commissions"));
    }
  }, [api, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const t = data?.totals;
  const owed = t ? t.pending + t.eligible + t.approved : 0;

  return (
    <div className="space-y-5" data-testid="commission-dashboard-page">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Commissions</h1>
          <p className="text-sm text-muted-foreground">
            Net cash collected from paid invoices, minus refunds. Bloom Connect pays {" "}
            <a href="#settings" className="underline-offset-2 hover:underline">a default rate to anyone</a>.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="commission-date-from" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="commission-date-to" />
          </div>
        </div>
      </div>

      {!data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Owed (unpaid)" value={fmtMoney(owed)} icon={Coins} testid="kpi-owed"
            hint={`${fmtMoney(t.eligible)} ready to approve`} />
          <Kpi label="Approved" value={fmtMoney(t.approved)} icon={Wallet} testid="kpi-approved" hint="Ready to pay out" />
          <Kpi label="Paid" value={fmtMoney(t.paid)} icon={Wallet} testid="kpi-paid" />
          <Kpi label="% of revenue" value={`${data.commission_pct_of_revenue}%`} icon={Percent} testid="kpi-pct"
            hint={`on ${fmtMoney(data.revenue_net_cash)} net cash`} />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">By person</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {!data ? <Skeleton className="m-4 h-24" /> : data.by_person.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground" data-testid="by-person-empty">
                  No commissions yet. <Link to="/admin/people" className="underline">Add a person</Link> and{" "}
                  <Link to="/admin/commission-assignments" className="underline">assign them to a company</Link>.
                </div>
              ) : (
                <>
                  <div className="h-56 px-2 pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.by_person}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="person_name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v) => fmtMoney(v)} />
                        <Legend />
                        <Bar dataKey="pending" stackId="a" fill="#94A3B8" name="Pending hold" />
                        <Bar dataKey="eligible" stackId="a" fill="#F59E0B" name="Ready" />
                        <Bar dataKey="approved" stackId="a" fill="#3B82F6" name="Approved" />
                        <Bar dataKey="paid" stackId="a" fill="#16A34A" name="Paid" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Person</TableHead>
                        <TableHead>Clients</TableHead>
                        <TableHead className="text-right">Owed</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.by_person.map((p) => (
                        <TableRow key={p.person_id} data-testid={`by-person-row-${p.person_id}`}>
                          <TableCell className="font-medium">
                            {p.person_name} <span className="text-xs text-muted-foreground capitalize">{p.person_type}</span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {p.companies.map((c) => `${c.company_name} (${fmtMoney(c.total)})`).join(", ")}
                          </TableCell>
                          <TableCell className="text-right">{fmtMoney(p.pending + p.eligible + p.approved)}</TableCell>
                          <TableCell className="text-right">{fmtMoney(p.paid)}</TableCell>
                          <TableCell className="text-right font-semibold">{fmtMoney(p.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>

          {data && data.by_company.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">By company</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead className="text-right">Owed</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.by_company.map((c) => (
                      <TableRow key={c.company_id} data-testid={`by-company-row-${c.company_id}`}>
                        <TableCell className="font-medium">{c.company_name}</TableCell>
                        <TableCell className="text-right">{fmtMoney(c.pending + c.eligible + c.approved)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(c.paid)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmtMoney(c.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-5" id="settings">
          <CalculatorCard api={api} people={people} companies={companies} />
          <SettingsCard api={api} />
        </div>
      </div>
    </div>
  );
}
