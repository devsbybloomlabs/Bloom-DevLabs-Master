/**
 * PayPalPlansPage — admin UI for creating recurring subscription plans
 * (Server Management, App Maintenance, Support Tiers).
 */
import { useState, useEffect, useCallback } from "react";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Loader2, Copy, AlertCircle } from "lucide-react";

export default function PayPalPlansPage() {
  const api = useAdminApi();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    interval_unit: "MONTH",
    interval_count: 1,
    plan_key: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, hRes] = await Promise.allSettled([
        api.get("/paypal/admin/plans"),
        api.get("/paypal/admin/health"),
      ]);
      setPlans(pRes.status === "fulfilled" ? pRes.value.data : []);
      setHealth(hRes.status === "fulfilled" ? hRes.value.data : null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onCreate = async () => {
    if (!form.name.trim() || !form.price.trim()) {
      toast.error("Name and price are required");
      return;
    }
    setSaving(true);
    try {
      const r = await api.post("/paypal/admin/plans", {
        ...form,
        plan_key: form.plan_key || form.name.toLowerCase().replace(/\s+/g, "_"),
      });
      toast.success(`Plan created: ${r.data.plan_id}`);
      setOpen(false);
      setForm({
        name: "",
        description: "",
        price: "",
        interval_unit: "MONTH",
        interval_count: 1,
        plan_key: "",
      });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Plan creation failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-paypal-plans-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            PayPal Plans
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recurring subscriptions for Server Management, App Maintenance,
            Support tiers, and more.
          </p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
          data-testid="paypal-plans-new-button"
        >
          <Plus className="h-4 w-4 mr-2" />
          New plan
        </Button>
      </div>

      {health && !health.ok && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3 text-sm">
            <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">PayPal auth failing</p>
              <p className="text-amber-800 mt-0.5">
                Configured: {String(health.configured)} · Env: {health.env} · OAuth ok:{" "}
                {String(health.ok)}. Double-check <code>PAYPAL_CLIENT_SECRET</code> in
                backend env.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="border-border"><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : plans.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-12 text-center" data-testid="paypal-plans-empty">
            <p className="font-display text-base font-medium">No subscription plans yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first recurring plan (e.g. Server Management — Tier 1).
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3" data-testid="paypal-plans-list">
          {plans.map((p) => (
            <Card key={p.plan_id} className="border-border" data-testid={`paypal-plan-row-${p.plan_id}`}>
              <CardContent className="p-4 sm:p-5 flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-green-100 text-green-800 border-0">{p.status}</Badge>
                    <Badge variant="outline" className="text-[11px]">
                      every {p.interval_count} {p.interval_unit.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-1.5 font-display text-base font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    key: <code>{p.plan_key}</code> · plan_id: <code>{p.plan_id}</code>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-semibold tabular-nums">
                    ${parseFloat(p.price).toLocaleString()}
                    <span className="text-xs font-normal text-muted-foreground ml-1">/{p.interval_unit.toLowerCase()}</span>
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 h-7 text-[11px]"
                    onClick={() => {
                      navigator.clipboard.writeText(p.plan_key);
                      toast.success("plan_key copied");
                    }}
                    data-testid={`paypal-plan-copy-key-${p.plan_id}`}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy plan_key
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="paypal-plans-new-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">New PayPal subscription plan</DialogTitle>
            <DialogDescription>
              Creates a Catalog Product + Billing Plan in PayPal. Use the
              returned <code>plan_key</code> to embed Smart Buttons that
              subscribe customers to this plan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Plan name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Server Management — Tier 2"
                data-testid="paypal-plan-name-input"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What's included…"
                rows={2}
                data-testid="paypal-plan-description-input"
                className="mt-1.5"
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label>Price (USD)</Label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="299.00"
                  data-testid="paypal-plan-price-input"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Interval</Label>
                <Select
                  value={form.interval_unit}
                  onValueChange={(v) => setForm({ ...form, interval_unit: v })}
                >
                  <SelectTrigger className="mt-1.5" data-testid="paypal-plan-interval-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTH">Month</SelectItem>
                    <SelectItem value="YEAR">Year</SelectItem>
                    <SelectItem value="WEEK">Week</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Every</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.interval_count}
                  onChange={(e) => setForm({ ...form, interval_count: parseInt(e.target.value || "1", 10) })}
                  data-testid="paypal-plan-interval-count-input"
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label>Plan key <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={form.plan_key}
                onChange={(e) => setForm({ ...form, plan_key: e.target.value })}
                placeholder="auto-derived from name"
                data-testid="paypal-plan-key-input"
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={onCreate}
              disabled={saving}
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
              data-testid="paypal-plan-create-submit"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
