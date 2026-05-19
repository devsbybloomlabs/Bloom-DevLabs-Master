import { useEffect, useMemo, useState } from "react";
import { authClient, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const FIELDS = [
  { key: "linkedin_followers", label: "LinkedIn followers", type: "number" },
  { key: "linkedin_engagement_rate", label: "LinkedIn engagement rate (decimal, e.g. 0.04)", type: "number", step: "0.001" },
  { key: "profile_views_weekly", label: "Profile views (weekly)", type: "number" },
  { key: "monthly_website_visitors", label: "Monthly website visitors", type: "number" },
  { key: "inbound_inquiry_rate", label: "Inbound inquiry rate (per 100 visitors)", type: "number", step: "0.1" },
  { key: "conversion_rate", label: "Conversion rate (calls→closes, %)", type: "number", step: "0.1" },
  { key: "average_project_value", label: "Average project value (USD)", type: "number" },
  { key: "client_retention_rate", label: "Client retention rate (%)", type: "number", step: "0.1" },
];

export default function AuthorityPage() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [data, setData] = useState(null);
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [a, s] = await Promise.all([api.get("/authority"), api.get("/authority/score")]);
      setData(a.data);
      setScore(s.data);
      const init = {};
      FIELDS.forEach((f) => { init[f.key] = a.data?.[f.key] ?? ""; });
      setForm(init);
    } catch { toast.error("Failed to load authority metrics"); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {};
      Object.entries(form).forEach(([k, v]) => {
        if (v === "" || v === null) return;
        payload[k] = Number(v);
      });
      await api.patch("/authority", payload);
      toast.success("Authority metrics updated");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-64" /></div>;
  }

  return (
    <div className="space-y-6" data-testid="authority-page">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Authority Score</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manually input your weekly LinkedIn / website / inbound stats and we'll calculate your authority.
        </p>
      </div>

      <Card className="border-[#3B82F6]/30 bg-[#3B82F6]/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#1E3A8A]" />
            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Authority score</span>
          </div>
          <div className="font-display text-5xl font-semibold tabular-nums mt-2 text-[#1E3A8A]">
            {score?.score || 0}<span className="text-2xl text-muted-foreground">/100</span>
          </div>
          <Progress value={score?.score || 0} className="h-3 mt-4" />
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Weekly metrics input</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label className="text-sm" htmlFor={f.key}>{f.label}</Label>
              <Input
                id={f.key}
                type={f.type}
                step={f.step}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="mt-1.5"
                data-testid={`authority-input-${f.key}`}
              />
            </div>
          ))}
        </CardContent>
        <div className="px-6 pb-6">
          <Button onClick={save} disabled={saving} className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white" data-testid="authority-save-button">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save weekly snapshot
          </Button>
        </div>
      </Card>

      {data?.history?.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">History (last {data.history.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {data.history.slice(-10).reverse().map((h, i) => (
                <li key={i} className="text-xs text-muted-foreground border-l-2 border-border pl-3 py-1">
                  {new Date(h.at).toLocaleString()} — {Object.keys(h.data).filter((k) => k !== "updated_at").length} fields updated
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
