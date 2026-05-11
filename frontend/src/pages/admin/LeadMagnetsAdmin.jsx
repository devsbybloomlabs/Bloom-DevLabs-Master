/**
 * Admin Lead Magnets — wizard-style UI for marketers to create magnets +
 * drip email sequences without writing any code.
 *
 * Flow (3 steps):
 *   1. Magnet basics (title, description, slug, asset URL, CTA, placement)
 *   2. Drip email sequence (add/remove steps with day-offset + subject + body)
 *   3. Review + publish
 */
import { useState, useEffect, useCallback } from "react";
import { useAdminApi } from "@/lib/auth";
import LeadsTablePanel from "@/components/admin/LeadsTablePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Pencil,
  Copy,
  ArrowLeft,
  ArrowRight,
  Save,
  Mail,
  Sparkles,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
} from "lucide-react";

function emptyStep(day = 0) {
  return { day_offset: day, subject: "", body_markdown: "" };
}

function emptyMagnet() {
  return {
    slug: "",
    title: "",
    description: "",
    asset_url: "",
    cta_text: "Get the playbook",
    placement: "all",
    placement_target: "",
    active: true,
    sequence_steps: [
      {
        day_offset: 0,
        subject: "Here's your {magnet_title}",
        body_markdown:
          "Hey {name},\n\nThanks for grabbing this. Here's your download:\n\n{asset_url}\n\nGot questions? Just reply — I read every email.\n\n— Ryan\nBloom Labs",
      },
      {
        day_offset: 3,
        subject: "How's it going?",
        body_markdown:
          "Quick check-in.\n\nDid you find anything useful in the playbook?\n\nWe help founders ship enterprise-grade web apps in 2–4 weeks (vs. 3–6 months). If that sounds relevant, hit reply and we'll set up a 15-min call.\n\n— Ryan",
      },
    ],
  };
}

function slugify(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 120);
}

export default function LeadMagnetsAdmin() {
  const api = useAdminApi();
  const [items, setItems] = useState([]);
  const [leadsCount, setLeadsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [magnetsRes, leadsRes] = await Promise.allSettled([
        api.get("/admin/lead-magnets"),
        api.get("/admin/leads"),
      ]);
      setItems(magnetsRes.status === "fulfilled" ? magnetsRes.value.data : []);
      setLeadsCount(leadsRes.status === "fulfilled" ? leadsRes.value.data.length : 0);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onOpenNew = () => {
    setEditing(emptyMagnet());
    setWizardOpen(true);
  };

  const onEdit = (m) => {
    setEditing({ ...m });
    setWizardOpen(true);
  };

  const onToggleActive = async (m) => {
    try {
      await api.patch(`/admin/lead-magnets/${m.id}`, { active: !m.active });
      toast.success(!m.active ? "Activated" : "Deactivated");
      load();
    } catch {
      toast.error("Update failed");
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this lead magnet permanently?")) return;
    try {
      await api.delete(`/admin/lead-magnets/${id}`);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  const onCopyEmbed = (m) => {
    const snippet = `<LeadMagnetForm slug="${m.slug}" />`;
    navigator.clipboard.writeText(snippet);
    toast.success("Embed snippet copied");
  };

  return (
    <div className="space-y-6" data-testid="admin-lead-magnets-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Lead Magnets
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Capture visitor emails with downloadable assets + automated drip
            sequences. {items.length} magnets · {leadsCount} leads captured.
          </p>
        </div>
        <Button
          onClick={onOpenNew}
          className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
          data-testid="lead-magnets-new-button"
        >
          <Plus className="h-4 w-4 mr-2" />
          New magnet
        </Button>
      </div>

      {loading ? (
        <Card className="border-border"><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : items.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-12 text-center" data-testid="lead-magnets-empty">
            <Sparkles className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-display text-base font-medium">No lead magnets yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first opt-in offer — it appears on blog posts automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3" data-testid="lead-magnets-list">
          {items.map((m) => (
            <Card key={m.id} className="border-border" data-testid={`lead-magnet-row-${m.id}`}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {m.active ? (
                        <Badge className="bg-green-100 text-green-800 border-0">Active</Badge>
                      ) : (
                        <Badge variant="outline">Paused</Badge>
                      )}
                      <Badge variant="outline" className="text-[11px]">
                        {m.placement === "all" ? "All blog posts" : m.placement}
                      </Badge>
                      <Badge variant="outline" className="text-[11px]">
                        {(m.sequence_steps || []).length} emails
                      </Badge>
                    </div>
                    <p className="mt-1.5 font-display text-base font-medium truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      /{m.slug} · {m.leads_count || 0} leads captured
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onCopyEmbed(m)}
                      data-testid={`lead-magnet-copy-embed-${m.id}`}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Embed
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onToggleActive(m)}
                      data-testid={`lead-magnet-toggle-${m.id}`}
                    >
                      {m.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onEdit(m)}
                      data-testid={`lead-magnet-edit-${m.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(m.id)}
                      data-testid={`lead-magnet-delete-${m.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <WizardDialog
        open={wizardOpen}
        onOpenChange={(o) => {
          setWizardOpen(o);
          if (!o) setEditing(null);
        }}
        initial={editing}
        api={api}
        onSaved={() => {
          setWizardOpen(false);
          setEditing(null);
          load();
        }}
      />

      <LeadsTablePanel api={api} />
    </div>
  );
}

// ============================================================================
// 3-step Wizard Dialog
// ============================================================================
function WizardDialog({ open, onOpenChange, initial, api, onSaved }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initial || emptyMagnet());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setForm(initial);
      setStep(1);
    }
  }, [initial]);

  const isEditing = !!form.id;
  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setStepField = (idx, k, v) =>
    setForm((f) => {
      const arr = [...(f.sequence_steps || [])];
      arr[idx] = { ...arr[idx], [k]: v };
      return { ...f, sequence_steps: arr };
    });
  const addStep = () =>
    setForm((f) => ({
      ...f,
      sequence_steps: [
        ...(f.sequence_steps || []),
        emptyStep(((f.sequence_steps || []).slice(-1)[0]?.day_offset || 0) + 3),
      ],
    }));
  const removeStep = (idx) =>
    setForm((f) => ({
      ...f,
      sequence_steps: (f.sequence_steps || []).filter((_, i) => i !== idx),
    }));

  const onSave = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        slug: slugify(form.slug || form.title),
      };
      if (isEditing) {
        await api.patch(`/admin/lead-magnets/${form.id}`, payload);
        toast.success("Magnet updated");
      } else {
        await api.post("/admin/lead-magnets", payload);
        toast.success("Magnet published");
      }
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[92vh] overflow-y-auto"
        data-testid="lead-magnet-wizard"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {isEditing ? "Edit lead magnet" : "New lead magnet"}
          </DialogTitle>
          <DialogDescription>
            Step {step} of {totalSteps} — {step === 1 ? "Basics" : step === 2 ? "Drip emails" : "Review & publish"}
          </DialogDescription>
          <Progress value={progress} className="h-1.5 mt-2" />
        </DialogHeader>

        <div className="mt-2 space-y-5">
          {step === 1 && <Step1Basics form={form} set={set} />}
          {step === 2 && (
            <Step2Sequence
              steps={form.sequence_steps || []}
              setStepField={setStepField}
              addStep={addStep}
              removeStep={removeStep}
            />
          )}
          {step === 3 && <Step3Review form={form} />}
        </div>

        <DialogFooter className="flex sm:justify-between gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => (step === 1 ? onOpenChange(false) : setStep(step - 1))}
            data-testid="lead-magnet-wizard-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step < totalSteps ? (
            <Button
              onClick={() => {
                if (step === 1 && !form.title.trim()) {
                  toast.error("Title is required");
                  return;
                }
                setStep(step + 1);
              }}
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
              data-testid="lead-magnet-wizard-next"
            >
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={onSave}
              disabled={saving}
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
              data-testid="lead-magnet-wizard-save"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {isEditing ? "Save changes" : "Publish magnet"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Step1Basics({ form, set }) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Title</Label>
        <Input
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder='e.g. "The Founder AI-Native Build Playbook"'
          data-testid="lead-magnet-wizard-title"
          className="mt-1.5"
        />
      </div>
      <div>
        <Label>Description (1-2 sentences)</Label>
        <Textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          placeholder="What will they get? Be specific & enticing."
          data-testid="lead-magnet-wizard-description"
          className="mt-1.5"
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label>Slug</Label>
          <Input
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder="auto from title"
            data-testid="lead-magnet-wizard-slug"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label>CTA button text</Label>
          <Input
            value={form.cta_text || ""}
            onChange={(e) => set("cta_text", e.target.value)}
            placeholder="Get the playbook"
            data-testid="lead-magnet-wizard-cta"
            className="mt-1.5"
          />
        </div>
      </div>
      <div>
        <Label>Asset URL (PDF, Notion, Google Doc, etc.)</Label>
        <Input
          value={form.asset_url || ""}
          onChange={(e) => set("asset_url", e.target.value)}
          placeholder="https://…"
          data-testid="lead-magnet-wizard-asset-url"
          className="mt-1.5"
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Sent in the first email. Use a hosted file link (Notion, Drive, S3,
          Dropbox public share).
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label>Show on</Label>
          <Select value={form.placement} onValueChange={(v) => set("placement", v)}>
            <SelectTrigger className="mt-1.5" data-testid="lead-magnet-wizard-placement">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All blog posts</SelectItem>
              <SelectItem value="blog">Blog landing only</SelectItem>
              <SelectItem value="homepage">Homepage only</SelectItem>
              <SelectItem value="blog_slug">Specific blog post</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.placement === "blog_slug" && (
          <div>
            <Label>Blog post slug</Label>
            <Input
              value={form.placement_target || ""}
              onChange={(e) => set("placement_target", e.target.value)}
              placeholder="hello-world"
              data-testid="lead-magnet-wizard-placement-target"
              className="mt-1.5"
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={!!form.active}
          onCheckedChange={(v) => set("active", v)}
          data-testid="lead-magnet-wizard-active-switch"
        />
        <Label>Active (visible on the public site)</Label>
      </div>
    </div>
  );
}

function Step2Sequence({ steps, setStepField, addStep, removeStep }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm bg-secondary rounded-lg p-3">
        <Mail className="h-4 w-4 text-[#1E3A8A]" />
        <span className="text-muted-foreground">
          Use <code className="text-foreground">{"{name}"}</code>,{" "}
          <code className="text-foreground">{"{magnet_title}"}</code>, and{" "}
          <code className="text-foreground">{"{asset_url}"}</code> placeholders.
        </span>
      </div>
      {steps.map((step, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-border bg-background p-4 space-y-3"
          data-testid={`lead-magnet-wizard-step-${idx}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-[#1E3A8A] text-white border-0">Email {idx + 1}</Badge>
              {idx === 0 ? (
                <span className="text-xs text-muted-foreground">sent immediately</span>
              ) : (
                <span className="text-xs text-muted-foreground">sent +{step.day_offset} days</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {idx !== 0 && (
                <Input
                  type="number"
                  min={1}
                  value={step.day_offset}
                  onChange={(e) =>
                    setStepField(idx, "day_offset", parseInt(e.target.value || "1", 10))
                  }
                  className="w-20 h-8"
                  data-testid={`lead-magnet-wizard-step-${idx}-day`}
                />
              )}
              {steps.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeStep(idx)}
                  data-testid={`lead-magnet-wizard-step-${idx}-remove`}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs">Subject</Label>
            <Input
              value={step.subject || ""}
              onChange={(e) => setStepField(idx, "subject", e.target.value)}
              placeholder="Your subject line"
              data-testid={`lead-magnet-wizard-step-${idx}-subject`}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-xs">Body</Label>
            <Textarea
              value={step.body_markdown || ""}
              onChange={(e) => setStepField(idx, "body_markdown", e.target.value)}
              rows={5}
              placeholder="Hey {name}, …"
              data-testid={`lead-magnet-wizard-step-${idx}-body`}
              className="mt-1.5"
            />
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        onClick={addStep}
        className="w-full"
        data-testid="lead-magnet-wizard-add-step"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add email
      </Button>
    </div>
  );
}

function Step3Review({ form }) {
  return (
    <div className="space-y-4" data-testid="lead-magnet-wizard-review">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="font-display text-base font-medium">Ready to publish</span>
        </div>
        <dl className="text-sm space-y-1.5">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Title:</dt>
            <dd className="font-medium truncate ml-2">{form.title}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Slug:</dt>
            <dd className="font-mono text-xs">/{slugify(form.slug || form.title)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Placement:</dt>
            <dd>{form.placement === "blog_slug" ? `${form.placement_target}` : form.placement}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Emails in drip:</dt>
            <dd>{(form.sequence_steps || []).length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Status:</dt>
            <dd>{form.active ? "Active" : "Paused"}</dd>
          </div>
        </dl>
      </div>
      <p className="text-xs text-muted-foreground">
        Tip: copy the embed snippet from the magnet card to paste it into any
        custom page. By default it auto-appears on the placement you chose.
      </p>
    </div>
  );
}
