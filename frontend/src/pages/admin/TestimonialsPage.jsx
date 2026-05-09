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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  Edit2,
  Mic,
  Loader2,
  Mail,
  Star,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

const BLANK = {
  client_name: "",
  client_email: "",
  company: "",
  project: "",
  written: "",
  video_url: "",
  rating: 5,
  permission_to_feature: false,
  status: "pending",
};

const STATUS_COLORS = {
  pending: "bg-secondary text-foreground",
  requested: "bg-blue-100 text-blue-900",
  received: "bg-emerald-100 text-emerald-900",
  featured: "bg-amber-100 text-amber-900",
};

export default function TestimonialsPage() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(null);
  const [featuring, setFeaturing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/testimonials");
      setItems(r.data);
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openCreate = () => { setEditing(null); setForm(BLANK); setOpen(true); };
  const openEdit = (it) => {
    setEditing(it);
    setForm({
      client_name: it.client_name || "",
      client_email: it.client_email || "",
      company: it.company || "",
      project: it.project || "",
      written: it.written || "",
      video_url: it.video_url || "",
      rating: it.rating || 5,
      permission_to_feature: it.permission_to_feature || false,
      status: it.status || "pending",
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      payload.rating = Number(payload.rating) || null;
      if (!payload.client_email) payload.client_email = null;
      if (editing) {
        await api.patch(`/testimonials/${editing.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post("/testimonials", payload);
        toast.success("Saved");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this testimonial?")) return;
    try {
      await api.delete(`/testimonials/${id}`);
      toast.success("Deleted");
      load();
    } catch { toast.error("Delete failed"); }
  };

  const featureNow = async (it) => {
    setFeaturing(it.id);
    try {
      await api.post(`/sync/testimonial/${it.id}/feature`, {}, { timeout: 120000 });
      toast.success("Featured + LinkedIn draft created");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    } finally {
      setFeaturing(null);
    }
  };

  const sendRequest = async (it) => {
    if (!it.client_email) {
      toast.error("Client email required to send request");
      return;
    }
    setSending(it.id);
    try {
      const r = await api.post("/testimonials/send-request", { testimonial_id: it.id });
      if (r.data.ok) {
        toast.success("Email sent via Emailit");
      } else {
        toast.warning(
          "Emailit not yet active",
          { description: r.data.hint || "Verify your sender domain in the Emailit dashboard." }
        );
      }
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Send failed");
    } finally { setSending(null); }
  };

  return (
    <div className="space-y-6" data-testid="testimonials-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Testimonials</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Collect, request, and feature client testimonials.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white" data-testid="testimonial-add-button">
          <Plus className="h-4 w-4 mr-2" /> Add testimonial
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <Card className="border-border">
          <CardContent className="p-10 text-center">
            <Mic className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No testimonials yet. Add a client at day 30 post-launch and trigger an email request.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((it) => (
            <Card key={it.id} className="border-border" data-testid={`testimonial-card-${it.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="font-display text-lg">{it.client_name}</CardTitle>
                    <div className="text-xs text-muted-foreground">{it.company || "—"} · {it.project || "—"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${STATUS_COLORS[it.status]} border-0`}>{it.status}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {it.written && (
                  <blockquote className="text-sm italic border-l-2 border-[#3B82F6] pl-3">
                    “{it.written}”
                  </blockquote>
                )}
                {it.video_url && (
                  <div className="text-xs">
                    🎥 <a href={it.video_url} className="text-[#1E3A8A] underline" target="_blank" rel="noopener noreferrer">Video testimonial</a>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {it.rating && (
                    <span className="flex items-center gap-0.5">
                      {Array.from({ length: it.rating }).map((_, i) => (
                        <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                      ))}
                    </span>
                  )}
                  {it.permission_to_feature && <Badge variant="outline" className="text-[10px] font-normal">Permission ✓</Badge>}
                  {it.featured && <Badge variant="outline" className="text-[10px] font-normal bg-amber-100">Featured</Badge>}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-border flex-wrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => sendRequest(it)}
                    disabled={sending === it.id}
                    data-testid={`testimonial-${it.id}-send-request`}
                  >
                    {sending === it.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
                    Send request
                  </Button>
                  {it.written && !it.featured && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => featureNow(it)}
                      disabled={featuring === it.id}
                      data-testid={`testimonial-${it.id}-feature`}
                    >
                      {featuring === it.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                      Feature + draft post
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => openEdit(it)} data-testid={`testimonial-${it.id}-edit`}>
                    <Edit2 className="h-4 w-4 mr-1" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(it.id)} data-testid={`testimonial-${it.id}-delete`}>
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="testimonial-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit testimonial" : "New testimonial"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Client name" required>
              <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} data-testid="testimonial-form-client" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email">
                <Input type="email" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} data-testid="testimonial-form-email" />
              </Field>
              <Field label="Company">
                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} data-testid="testimonial-form-company" />
              </Field>
            </div>
            <Field label="Project">
              <Input value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} data-testid="testimonial-form-project" />
            </Field>
            <Field label="Written testimonial">
              <Textarea rows={3} value={form.written} onChange={(e) => setForm({ ...form, written: e.target.value })} data-testid="testimonial-form-written" />
            </Field>
            <Field label="Video URL">
              <Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} data-testid="testimonial-form-video" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rating (1-5)">
                <Input type="number" min={1} max={5} value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} data-testid="testimonial-form-rating" />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" data-testid="testimonial-form-status">
                  <option value="pending">Pending</option>
                  <option value="requested">Requested</option>
                  <option value="received">Received</option>
                  <option value="featured">Featured</option>
                </select>
              </Field>
            </div>
            <div className="flex items-center justify-between border border-border rounded-lg px-3 py-2">
              <div>
                <div className="text-sm font-medium">Permission to feature</div>
                <div className="text-xs text-muted-foreground">Confirm written consent</div>
              </div>
              <Switch checked={form.permission_to_feature} onCheckedChange={(v) => setForm({ ...form, permission_to_feature: v })} data-testid="testimonial-form-permission" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.client_name} className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white" data-testid="testimonial-form-save">
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
