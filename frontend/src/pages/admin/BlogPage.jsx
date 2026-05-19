/**
 * BlogPage — admin CRUD for blog posts with AI-assisted drafting (OpenRouter).
 * Lives at /admin/blog.
 */
import { useState, useEffect, useCallback } from "react";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  Loader2,
  ExternalLink,
  Save,
  Wand2,
  Check,
} from "lucide-react";

function emptyDraft() {
  return {
    title: "",
    slug: "",
    excerpt: "",
    body: "",
    featured_image: "",
    tags: [],
    author_name: "Bloom Labs",
    seo_title: "",
    seo_description: "",
    published: false,
  };
}

function slugify(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 200);
}

export default function BlogPage() {
  const api = useAdminApi();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null); // post being edited or "new"
  const [aiOpen, setAiOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/blog");
      setPosts(r.data);
    } catch (e) {
      toast.error("Failed to load posts");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onCreate = () => setEditor(emptyDraft());
  const onEdit = (p) => setEditor({ ...p });
  const onDelete = async (id) => {
    if (!window.confirm("Delete this post permanently?")) return;
    try {
      await api.delete(`/admin/blog/${id}`);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };
  const togglePublish = async (p) => {
    try {
      await api.patch(`/admin/blog/${p.id}`, { published: !p.published });
      toast.success(!p.published ? "Published" : "Unpublished");
      load();
    } catch {
      toast.error("Update failed");
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-blog-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Blog</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Author, AI-draft, and publish posts. {posts.length} total.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setAiOpen(true)}
            data-testid="blog-ai-draft-button"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            AI draft
          </Button>
          <Button
            onClick={onCreate}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="blog-new-post-button"
          >
            <Plus className="h-4 w-4 mr-2" />
            New post
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="border-border"><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : posts.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-12 text-center" data-testid="blog-empty">
            <p className="font-display text-base font-medium">No posts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Click "AI draft" to generate your first post from a topic.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {posts.map((p) => (
            <Card key={p.id} className="border-border" data-testid={`blog-row-${p.id}`}>
              <CardContent className="p-4 sm:p-5 flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {p.published ? (
                      <Badge className="bg-green-100 text-green-800 border-0">Published</Badge>
                    ) : (
                      <Badge variant="outline">Draft</Badge>
                    )}
                    {p.tags?.slice(0, 2).map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                  <p className="mt-1.5 font-display text-base font-medium truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    /{p.slug} · {p.views} views ·{" "}
                    {p.updated_at && new Date(p.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => togglePublish(p)}
                    data-testid={`blog-toggle-publish-${p.id}`}
                  >
                    {p.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  {p.published && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`/blog/${p.slug}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onEdit(p)}
                    data-testid={`blog-edit-${p.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(p.id)}
                    data-testid={`blog-delete-${p.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PostEditor
        post={editor}
        onClose={() => setEditor(null)}
        onSaved={() => {
          setEditor(null);
          load();
        }}
        api={api}
      />
      <AiDraftDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        onApply={(draft) => {
          setAiOpen(false);
          setEditor({ ...emptyDraft(), ...draft });
        }}
        api={api}
      />
    </div>
  );
}

function PostEditor({ post, onClose, onSaved, api }) {
  const isOpen = !!post;
  const isNew = post && !post.id;
  const [form, setForm] = useState(post || emptyDraft());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(post || emptyDraft());
  }, [post]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onSave = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const slug = slugify(form.slug || form.title);
      const payload = {
        ...form,
        slug,
        tags: Array.isArray(form.tags)
          ? form.tags
          : String(form.tags || "")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
      };
      if (isNew) {
        await api.post("/admin/blog", payload);
        toast.success("Post created");
      } else {
        await api.patch(`/admin/blog/${post.id}`, payload);
        toast.success("Post updated");
      }
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="blog-editor-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {isNew ? "New post" : "Edit post"}
          </DialogTitle>
          <DialogDescription>
            Markdown body — supports headings, lists, blockquotes, code, links.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                data-testid="blog-editor-title"
                className="mt-1.5"
                placeholder="The post title"
              />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                value={form.slug}
                onChange={(e) => set("slug", e.target.value)}
                placeholder="auto from title"
                data-testid="blog-editor-slug"
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <Label>Excerpt (1-2 sentences)</Label>
            <Textarea
              value={form.excerpt || ""}
              onChange={(e) => set("excerpt", e.target.value)}
              rows={2}
              data-testid="blog-editor-excerpt"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Featured image URL</Label>
            <Input
              value={form.featured_image || ""}
              onChange={(e) => set("featured_image", e.target.value)}
              placeholder="https://…"
              data-testid="blog-editor-featured-image"
              className="mt-1.5"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Body (WYSIWYG · Markdown)</Label>
              <AiSeoSuggestButton
                form={form}
                onApply={(patch) => setForm((f) => ({ ...f, ...patch }))}
                api={api}
              />
            </div>
            <div data-color-mode="light" data-testid="blog-editor-body-wrapper">
              <MDEditor
                value={form.body || ""}
                onChange={(val) => set("body", val || "")}
                height={420}
                preview="live"
                textareaProps={{
                  "data-testid": "blog-editor-body",
                  placeholder: "# Heading\n\nYour content…",
                }}
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Tags (comma-separated)</Label>
              <Input
                value={Array.isArray(form.tags) ? form.tags.join(", ") : form.tags || ""}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="ai, agency, dev"
                data-testid="blog-editor-tags"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Author</Label>
              <Input
                value={form.author_name || "Bloom Labs"}
                onChange={(e) => set("author_name", e.target.value)}
                data-testid="blog-editor-author"
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>SEO title</Label>
              <Input
                value={form.seo_title || ""}
                onChange={(e) => set("seo_title", e.target.value)}
                placeholder="(defaults to title)"
                data-testid="blog-editor-seo-title"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>SEO description</Label>
              <Input
                value={form.seo_description || ""}
                onChange={(e) => set("seo_description", e.target.value)}
                placeholder="(defaults to excerpt)"
                data-testid="blog-editor-seo-description"
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={!!form.published}
              onCheckedChange={(v) => set("published", v)}
              data-testid="blog-editor-published-switch"
            />
            <Label>Published</Label>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={onSave}
            disabled={saving}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="blog-editor-save"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {isNew ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AiDraftDialog({ open, onOpenChange, onApply, api }) {
  const [topic, setTopic] = useState("");
  const [angle, setAngle] = useState("");
  const [length, setLength] = useState("medium");
  const [loading, setLoading] = useState(false);

  const go = async () => {
    if (!topic.trim()) {
      toast.error("Topic is required");
      return;
    }
    setLoading(true);
    try {
      const r = await api.post("/admin/blog/ai/draft", {
        topic: topic.trim(),
        angle: angle.trim() || undefined,
        target_length: length,
      });
      onApply(r.data);
      toast.success("AI draft generated — review and refine");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "AI failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="blog-ai-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">AI draft a new post</DialogTitle>
          <DialogDescription>
            Powered by OpenRouter. You&apos;ll be able to edit before publishing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label>Topic</Label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder='e.g. "Shipping production-grade SaaS in 21 days"'
              data-testid="blog-ai-topic"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Angle / sub-tags <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder='e.g. "tooling, AI-native, agency"'
              data-testid="blog-ai-angle"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Target length</Label>
            <div className="mt-1.5 flex gap-2">
              {["short", "medium", "long"].map((opt) => (
                <button
                  type="button"
                  key={opt}
                  onClick={() => setLength(opt)}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-sm capitalize transition-colors ${
                    length === opt
                      ? "border-[#1E3A8A] bg-[#1E3A8A] text-white"
                      : "border-border bg-background hover:border-foreground/30"
                  }`}
                  data-testid={`blog-ai-length-${opt}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={go}
            disabled={loading}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="blog-ai-generate"
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function AiSeoSuggestButton({ form, onApply, api }) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [suggestion, setSuggestion] = useState(null);

  const run = async () => {
    if (!form.title?.trim() || !form.body?.trim() || form.body.length < 30) {
      toast.error("Add a title and at least a paragraph of body first");
      return;
    }
    setLoading(true);
    try {
      const r = await api.post("/admin/blog/ai/seo-suggest", {
        title: form.title,
        body: form.body,
        current_slug: form.slug || undefined,
        current_tags: Array.isArray(form.tags)
          ? form.tags
          : (form.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
      });
      setSuggestion(r.data);
      setOpen(true);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "SEO suggestion failed");
    } finally {
      setLoading(false);
    }
  };

  const applyAll = () => {
    if (!suggestion) return;
    onApply({
      slug: suggestion.slug,
      seo_title: suggestion.seo_title,
      seo_description: suggestion.seo_description,
      tags: suggestion.tags,
    });
    toast.success("Applied SEO suggestions");
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={run}
        disabled={loading}
        data-testid="blog-ai-seo-suggest-button"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
        AI SEO suggest
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="blog-ai-seo-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-[#1E3A8A]" />
              AI SEO suggestions
            </DialogTitle>
            <DialogDescription>
              Generated by Claude Sonnet 4.5 based on your draft. Review then apply.
            </DialogDescription>
          </DialogHeader>
          {suggestion && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg border border-border p-3 bg-secondary/30">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">SEO Title</p>
                <p className="text-sm mt-1">{suggestion.seo_title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{suggestion.seo_title?.length || 0} chars</p>
              </div>
              <div className="rounded-lg border border-border p-3 bg-secondary/30">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Meta Description</p>
                <p className="text-sm mt-1">{suggestion.seo_description}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{suggestion.seo_description?.length || 0} chars</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Slug</p>
                  <p className="text-sm font-mono mt-1">/{suggestion.slug}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Primary Keyword</p>
                  <p className="text-sm mt-1">{suggestion.primary_keyword}</p>
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {(suggestion.tags || []).map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </div>
              {(suggestion.secondary_keywords || []).length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">Secondary Keywords</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestion.secondary_keywords.map((k) => (
                      <Badge key={k} className="bg-blue-50 text-blue-800 border-0 text-[10px]">{k}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {(suggestion.internal_link_suggestions || []).length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">Internal Link Suggestions</p>
                  <ul className="text-xs space-y-1.5">
                    {suggestion.internal_link_suggestions.map((l, i) => (
                      <li key={i}>
                        <code className="text-[#1E3A8A]">{l.target}</code> — &quot;{l.anchor}&quot;
                        {l.reason && <span className="text-muted-foreground"> · {l.reason}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(suggestion.faq_schema || []).length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">FAQ Schema Suggestions</p>
                  <ul className="text-xs space-y-2.5">
                    {suggestion.faq_schema.map((f, i) => (
                      <li key={i}>
                        <p className="font-medium">{f.q}</p>
                        <p className="text-muted-foreground mt-0.5">{f.a}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {suggestion.og_image_prompt && (
                <div className="rounded-lg border border-dashed border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">OG Image Prompt</p>
                  <p className="text-xs italic mt-1">{suggestion.og_image_prompt}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button
              onClick={applyAll}
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
              data-testid="blog-ai-seo-apply"
            >
              <Check className="h-4 w-4 mr-2" />
              Apply title, description, slug & tags
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
