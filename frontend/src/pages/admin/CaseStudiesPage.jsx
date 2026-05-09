import { useEffect, useMemo, useState } from "react";
import { authClient, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  Edit2,
  Award,
  Loader2,
  CheckCircle2,
  Circle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

const CHECKLIST_LABELS = {
  before_after_screenshots: "Before/after screenshots",
  client_quote: "Client quote captured",
  video_walkthrough: "2-min project walkthrough recorded",
  written_writeup: "500-word case study written",
  public_permission: "Public-feature permission obtained",
  on_website: "Added to website case studies section",
  linkedin_post: "LinkedIn announcement post",
};

const BLANK = {
  client_name: "",
  industry: "",
  challenge: "",
  solution: "",
  timeline_days: 14,
  investment: "",
  quote: "",
  quote_author: "",
  video_link: "",
  featured_image: "",
  public: false,
  tags: [],
};

export default function CaseStudiesPage() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/case-studies");
      setItems(r.data);
    } catch {
      toast.error("Failed to load case studies");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const generateLinkedInDraft = async (cs) => {
    setDrafting(cs.id);
    try {
      await api.post(`/sync/case-study/${cs.id}/to-content`, {}, { timeout: 120000 });
      toast.success("LinkedIn draft created — check Content AI > Drafts");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Draft generation failed");
    } finally {
      setDrafting(null);
    }
  };

  const openCreate = () => { setEditing(null); setForm(BLANK); setOpen(true); };
  const openEdit = (it) => {
    setEditing(it);
    setForm({
      client_name: it.client_name || "",
      industry: it.industry || "",
      challenge: it.challenge || "",
      solution: it.solution || "",
      timeline_days: it.timeline_days || 14,
      investment: it.investment ?? "",
      quote: it.quote || "",
      quote_author: it.quote_author || "",
      video_link: it.video_link || "",
      featured_image: it.featured_image || "",
      public: it.public || false,
      tags: it.tags || [],
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      payload.timeline_days = Number(payload.timeline_days) || 0;
      payload.investment = payload.investment === "" ? null : Number(payload.investment);
      if (editing) {
        await api.patch(`/case-studies/${editing.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post("/case-studies", payload);
        toast.success("Case study added");
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
    if (!window.confirm("Delete this case study?")) return;
    try {
      await api.delete(`/case-studies/${id}`);
      toast.success("Deleted");
      load();
    } catch { toast.error("Delete failed"); }
  };

  const toggleChecklist = async (cs, key) => {
    const newChecklist = { ...(cs.checklist || {}), [key]: !cs.checklist?.[key] };
    try {
      await api.patch(`/case-studies/${cs.id}`, { checklist: newChecklist });
      setItems((prev) => prev.map((x) => x.id === cs.id ? { ...x, checklist: newChecklist } : x));
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6" data-testid="case-studies-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Case Studies</h1>
          <p className="text-sm text-muted-foreground mt-1">Turn every project into a public proof point.</p>
        </div>
        <Button onClick={openCreate} className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white" data-testid="casestudy-add-button">
          <Plus className="h-4 w-4 mr-2" /> Add case study
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <Card className="border-border">
          <CardContent className="p-10 text-center">
            <Award className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No case studies yet. Add one for every project to build authority.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {items.map((cs) => (
            <Card key={cs.id} className="border-border" data-testid={`casestudy-card-${cs.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="font-display text-lg">{cs.client_name}</CardTitle>
                    <div className="text-xs text-muted-foreground">{cs.industry}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {cs.public && <Badge className="bg-emerald-100 text-emerald-900 border-0">Public</Badge>}
                    <Badge variant="outline">{cs.timeline_days}d</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Challenge</Label>
                  <p>{cs.challenge}</p>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Solution</Label>
                  <p>{cs.solution}</p>
                </div>
                {cs.quote && (
                  <blockquote className="text-sm italic border-l-2 border-[#3B82F6] pl-3">
                    “{cs.quote}” {cs.quote_author && <span className="not-italic text-muted-foreground text-xs">— {cs.quote_author}</span>}
                  </blockquote>
                )}
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Checklist</Label>
                  <ul className="mt-2 space-y-1.5">
                    {Object.entries(CHECKLIST_LABELS).map(([k, label]) => (
                      <li key={k} className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => toggleChecklist(cs, k)}
                          aria-label={label}
                          data-testid={`casestudy-${cs.id}-check-${k}`}
                          className="flex-shrink-0 mt-0.5"
                        >
                          {cs.checklist?.[k] ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-muted-foreground/60" />}
                        </button>
                        <span className={cs.checklist?.[k] ? "line-through opacity-60" : ""}>{label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => generateLinkedInDraft(cs)}
                    disabled={drafting === cs.id}
                    data-testid={`casestudy-${cs.id}-draft-post`}
                  >
                    {drafting === cs.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-1" />
                    )}
                    AI draft post
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(cs)} data-testid={`casestudy-${cs.id}-edit`}>
                    <Edit2 className="h-4 w-4 mr-1" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(cs.id)} data-testid={`casestudy-${cs.id}-delete`}>
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="casestudy-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit case study" : "New case study"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Client name" required>
              <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} data-testid="casestudy-form-client" />
            </Field>
            <Field label="Industry" required>
              <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} data-testid="casestudy-form-industry" />
            </Field>
            <Field label="Challenge" required>
              <Textarea rows={2} value={form.challenge} onChange={(e) => setForm({ ...form, challenge: e.target.value })} data-testid="casestudy-form-challenge" />
            </Field>
            <Field label="Solution" required>
              <Textarea rows={2} value={form.solution} onChange={(e) => setForm({ ...form, solution: e.target.value })} data-testid="casestudy-form-solution" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Timeline (days)">
                <Input type="number" value={form.timeline_days} onChange={(e) => setForm({ ...form, timeline_days: e.target.value })} data-testid="casestudy-form-timeline" />
              </Field>
              <Field label="Investment (USD)">
                <Input type="number" value={form.investment} onChange={(e) => setForm({ ...form, investment: e.target.value })} data-testid="casestudy-form-investment" />
              </Field>
            </div>
            <Field label="Quote">
              <Textarea rows={2} value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} data-testid="casestudy-form-quote" />
            </Field>
            <Field label="Quote author">
              <Input value={form.quote_author} onChange={(e) => setForm({ ...form, quote_author: e.target.value })} data-testid="casestudy-form-quote-author" />
            </Field>
            <Field label="Video walkthrough URL">
              <Input value={form.video_link} onChange={(e) => setForm({ ...form, video_link: e.target.value })} data-testid="casestudy-form-video" />
            </Field>
            <Field label="Featured image URL">
              <Input value={form.featured_image} onChange={(e) => setForm({ ...form, featured_image: e.target.value })} data-testid="casestudy-form-image" />
            </Field>
            <div className="flex items-center justify-between border border-border rounded-lg px-3 py-2">
              <div>
                <div className="text-sm font-medium">Public on website</div>
                <div className="text-xs text-muted-foreground">Show on bybloomlabs.com</div>
              </div>
              <Switch checked={form.public} onCheckedChange={(v) => setForm({ ...form, public: v })} data-testid="casestudy-form-public" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.client_name || !form.industry || !form.challenge || !form.solution} className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white" data-testid="casestudy-form-save">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <Label className="text-sm">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
