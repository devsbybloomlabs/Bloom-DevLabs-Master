import { useEffect, useMemo, useState } from "react";
import { authClient, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Edit2, BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TYPES = [
  { value: "blog", label: "Blog post" },
  { value: "linkedin_article", label: "LinkedIn article" },
  { value: "guest_post", label: "Guest post" },
  { value: "speaking", label: "Speaking engagement" },
  { value: "podcast", label: "Podcast appearance" },
  { value: "media_mention", label: "Media mention" },
];

const BLANK = { title: "", type: "linkedin_article", url: "", platform: "", published_at: "", notes: "" };

export default function ThoughtLeadershipPage() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/thought-leadership");
      setItems(r.data);
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(BLANK); setOpen(true); };
  const openEdit = (it) => {
    setEditing(it);
    setForm({
      title: it.title || "",
      type: it.type || "linkedin_article",
      url: it.url || "",
      platform: it.platform || "",
      published_at: it.published_at ? it.published_at.slice(0, 10) : "",
      notes: it.notes || "",
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      payload.published_at = payload.published_at ? new Date(payload.published_at).toISOString() : null;
      if (editing) {
        await api.patch(`/thought-leadership/${editing.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post("/thought-leadership", payload);
        toast.success("Added");
      }
      setOpen(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete?")) return;
    try { await api.delete(`/thought-leadership/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Failed"); }
  };

  const grouped = items.reduce((acc, x) => {
    (acc[x.type] = acc[x.type] || []).push(x);
    return acc;
  }, {});

  return (
    <div className="space-y-6" data-testid="thought-leadership-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Thought Leadership</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track every published piece, speaking engagement, and media mention.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white" data-testid="tl-add-button">
          <Plus className="h-4 w-4 mr-2" /> Add piece
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <Card className="border-border">
          <CardContent className="p-10 text-center">
            <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No content tracked yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {TYPES.map((t) => {
            const list = grouped[t.value] || [];
            if (list.length === 0) return null;
            return (
              <Card key={t.value} className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-display flex items-center gap-2">
                    {t.label} <Badge variant="outline" className="font-normal">{list.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {list.map((it) => (
                    <div
                      key={it.id}
                      data-testid={`tl-row-${it.id}`}
                      className="flex items-center justify-between gap-3 text-sm border border-border rounded-lg px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{it.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {it.platform || "—"} {it.published_at && `· ${new Date(it.published_at).toLocaleDateString()}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {it.url && (
                          <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1E3A8A] underline mr-2">
                            link
                          </a>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(it)} aria-label="Edit">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(it.id)} aria-label="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="tl-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit piece" : "Add piece"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Title" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="tl-form-title" /></Field>
            <Field label="Type" required>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" data-testid="tl-form-type">
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="URL"><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} data-testid="tl-form-url" /></Field>
            <Field label="Platform"><Input value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} data-testid="tl-form-platform" /></Field>
            <Field label="Published"><Input type="date" value={form.published_at} onChange={(e) => setForm({ ...form, published_at: e.target.value })} data-testid="tl-form-published" /></Field>
            <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="tl-form-notes" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.title} className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white" data-testid="tl-form-save">
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
