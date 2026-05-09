import { useMemo, useState } from "react";
import { authClient, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Clipboard, Save } from "lucide-react";
import { toast } from "sonner";

const CONTENT_TYPES = [
  { value: "linkedin_authority", label: "LinkedIn Authority Post" },
  { value: "problem_solution", label: "Problem → Solution" },
  { value: "case_study", label: "Case Study Highlight" },
  { value: "tip", label: "AI-Native Tip" },
  { value: "bts", label: "Behind-the-Scenes" },
];

const FORMATS = [
  { value: "single_post", label: "Single post + video" },
  { value: "carousel", label: "Carousel (5 slides)" },
  { value: "video_script", label: "Video script focus" },
];

export default function ContentPage() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [topic, setTopic] = useState("Why most agencies still take 6 months to ship a web app");
  const [type, setType] = useState("linkedin_authority");
  const [format_, setFormat] = useState("single_post");
  const [length, setLength] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [piecesLoading, setPiecesLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await api.post(
        "/ai/content",
        { topic, type, format: format_, length },
        { timeout: 120000 }
      );
      setData(r.data);
      toast.success("Content generated");
    } catch (e) {
      toast.error(e.response?.data?.detail || "AI generation failed");
    } finally {
      setLoading(false);
    }
  };

  const saveDraft = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const body = (data.body || "") + (data.cta ? "\n\n" + data.cta : "");
      await api.post("/content", {
        title: topic.slice(0, 100),
        type,
        body,
        video_script: data.video_script,
        visual_direction: data.visual_direction,
        cta: data.cta,
        status: "draft",
        tags: data.hashtags || [],
      });
      toast.success("Saved to drafts");
      loadPieces();
    } catch (e) {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const loadPieces = async () => {
    setPiecesLoading(true);
    try {
      const r = await api.get("/content?status=draft");
      setPieces(r.data);
    } catch {
      // ignore
    } finally {
      setPiecesLoading(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="content-page">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
          Content AI
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate post copy, video scripts, and visual direction in one pass.
        </p>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Configure</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label className="text-sm" htmlFor="topic">Topic / angle</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              data-testid="content-topic-input"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-sm" htmlFor="type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1.5" data-testid="content-type-select" id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm" htmlFor="format">Format</Label>
            <Select value={format_} onValueChange={setFormat}>
              <SelectTrigger className="mt-1.5" data-testid="content-format-select" id="format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm" htmlFor="length">Length</Label>
            <Select value={length} onValueChange={setLength}>
              <SelectTrigger className="mt-1.5" data-testid="content-length-select" id="length">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="long">Long</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              onClick={generate}
              disabled={loading}
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-11"
              data-testid="content-generate-button"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {data && (
        <Card className="border-border" data-testid="content-result">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-display">Generated content</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const txt = `${data.hook || ""}\n\n${data.body || ""}\n\n${data.cta || ""}\n\n${(data.hashtags || []).join(" ")}`;
                    navigator.clipboard.writeText(txt.trim());
                    toast.success("Post copied");
                  }}
                  data-testid="content-copy-post-button"
                >
                  <Clipboard className="h-4 w-4 mr-2" />
                  Copy post
                </Button>
                <Button
                  size="sm"
                  onClick={saveDraft}
                  disabled={saving}
                  className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                  data-testid="content-save-draft-button"
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save draft
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {data.hook && (
              <Section label="Hook" testid="content-hook">{data.hook}</Section>
            )}
            {data.body && (
              <Section label="Body" testid="content-body">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{data.body}</pre>
              </Section>
            )}
            {data.cta && (
              <Section label="CTA" testid="content-cta">{data.cta}</Section>
            )}
            {data.hashtags?.length > 0 && (
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Hashtags</Label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {data.hashtags.map((h) => (
                    <Badge key={h} variant="outline" className="font-normal">{h}</Badge>
                  ))}
                </div>
              </div>
            )}
            {data.video_script && (
              <Section label="60-sec video script" testid="content-video-script">
                <pre className="whitespace-pre-wrap font-sans text-sm">{data.video_script}</pre>
              </Section>
            )}
            {data.visual_direction && (
              <Section label="Visual direction" testid="content-visual-direction">
                <pre className="whitespace-pre-wrap font-sans text-sm">{data.visual_direction}</pre>
              </Section>
            )}
            {Array.isArray(data.carousel_slides) && data.carousel_slides.length > 0 && (
              <Section label="Carousel slides" testid="content-carousel">
                <ol className="space-y-2 list-decimal pl-5 text-sm">
                  {data.carousel_slides.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </Section>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-display">Drafts</CardTitle>
          <Button variant="outline" size="sm" onClick={loadPieces} data-testid="content-drafts-refresh">
            {piecesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          {pieces.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No drafts yet. Generate something above and click <b>Save draft</b>.
            </div>
          ) : (
            <ul className="space-y-2">
              {pieces.map((p) => (
                <li
                  key={p.id}
                  className="text-sm border border-border rounded-lg px-3 py-2 flex items-start justify-between gap-3"
                  data-testid={`content-draft-${p.id}`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.title}</div>
                    <div className="text-xs text-muted-foreground">{p.type}</div>
                  </div>
                  <Badge variant="outline" className="font-normal">draft</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ label, testid, children }) {
  return (
    <div data-testid={testid}>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div className="mt-1.5 rounded-lg bg-secondary/50 border border-border p-3 text-sm">
        {children}
      </div>
    </div>
  );
}
