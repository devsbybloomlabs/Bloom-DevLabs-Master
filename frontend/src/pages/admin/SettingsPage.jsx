import { useEffect, useMemo, useState } from "react";
import { authClient, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import AgencyHandyWebhookPanel from "@/components/admin/AgencyHandyWebhookPanel";

export default function SettingsPage() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/settings");
      setData(r.data);
      setForm({
        openrouter_model: r.data.openrouter_model || "",
        linkedin_url: r.data.linkedin_url || "",
        revenue_target: r.data.revenue_target || 90000,
        daily_outreach_target: r.data.daily_outreach_target || 25,
        daily_calls_target: r.data.daily_calls_target || 3,
        daily_content_pieces: r.data.daily_content_pieces || 2,
        industry_targets_text: (r.data.industry_targets || []).join("\n"),
        content_preferences_text: (r.data.content_preferences || []).join(", "),
      });
    } catch { toast.error("Failed to load settings"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        openrouter_model: form.openrouter_model,
        linkedin_url: form.linkedin_url,
        revenue_target: Number(form.revenue_target) || 90000,
        daily_outreach_target: Number(form.daily_outreach_target) || 25,
        daily_calls_target: Number(form.daily_calls_target) || 3,
        daily_content_pieces: Number(form.daily_content_pieces) || 2,
        industry_targets: form.industry_targets_text.split(/\n+/).map((s) => s.trim()).filter(Boolean),
        content_preferences: form.content_preferences_text.split(/,\s*/).map((s) => s.trim()).filter(Boolean),
      };
      await api.patch("/settings", payload);
      toast.success("Settings updated");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI model, targets, and content preferences. (API keys are loaded from server env.)
        </p>
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4 flex items-start gap-3 text-sm">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium text-amber-900">Emailit domain verification</div>
            <p className="text-amber-800 mt-1">
              Testimonial request emails will return <code>422 "Domain not verified"</code> until you add SPF and DKIM DNS records for <b>bybloomlabs.com</b> in the
              <a href="https://emailit.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline ml-1">Emailit dashboard</a>. Once verified (one-time), emails send automatically.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base font-display">AI</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm">OpenRouter model</Label>
            <Input value={form.openrouter_model} onChange={(e) => setForm({ ...form, openrouter_model: e.target.value })} className="mt-1.5" data-testid="settings-model" />
            <p className="text-xs text-muted-foreground mt-1">
              Change with care. Default: <code>anthropic/claude-sonnet-4.5</code>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base font-display">Targets</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="text-sm">Revenue target ($)</Label>
            <Input type="number" value={form.revenue_target} onChange={(e) => setForm({ ...form, revenue_target: e.target.value })} className="mt-1.5" data-testid="settings-revenue-target" />
          </div>
          <div>
            <Label className="text-sm">Daily outreach target</Label>
            <Input type="number" value={form.daily_outreach_target} onChange={(e) => setForm({ ...form, daily_outreach_target: e.target.value })} className="mt-1.5" data-testid="settings-outreach-target" />
          </div>
          <div>
            <Label className="text-sm">Daily calls target</Label>
            <Input type="number" value={form.daily_calls_target} onChange={(e) => setForm({ ...form, daily_calls_target: e.target.value })} className="mt-1.5" data-testid="settings-calls-target" />
          </div>
          <div>
            <Label className="text-sm">Daily content pieces</Label>
            <Input type="number" value={form.daily_content_pieces} onChange={(e) => setForm({ ...form, daily_content_pieces: e.target.value })} className="mt-1.5" data-testid="settings-content-target" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base font-display">Niche &amp; content</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm">Industry targets (one per line)</Label>
            <textarea
              value={form.industry_targets_text}
              onChange={(e) => setForm({ ...form, industry_targets_text: e.target.value })}
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1.5"
              data-testid="settings-industry-targets"
            />
          </div>
          <div>
            <Label className="text-sm">Content preferences (comma-separated)</Label>
            <Input value={form.content_preferences_text} onChange={(e) => setForm({ ...form, content_preferences_text: e.target.value })} className="mt-1.5" data-testid="settings-content-prefs" />
          </div>
          <div>
            <Label className="text-sm">Public LinkedIn URL</Label>
            <Input value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} className="mt-1.5" data-testid="settings-linkedin" />
          </div>
        </CardContent>
        <div className="px-6 pb-6">
          <Button onClick={save} disabled={saving} className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white" data-testid="settings-save-button">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save settings
          </Button>
        </div>
      </Card>

      <AgencyHandyWebhookPanel />
    </div>
  );
}
