/**
 * AbTestWizard — 5-step wizard to create + launch an A/B test.
 * Mounted at /admin/ab-tests/new.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Rocket,
  CheckCircle2,
} from "lucide-react";

const ELEMENT_DEFAULTS = {
  headline: "Custom web apps in 21 days",
  cta: "Book a Discovery Call",
  subheadline: "Trusted by gyms, clinics & SaaS founders",
  testimonial: "Bloom built our portal in 3 weeks.",
  form_copy: "Tell us about your project",
};

function StepHeader({ step, total, title, subtitle }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Step {step} of {total}</span>
        <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-[#1E3A8A] transition-all"
            style={{ width: `${(step / total) * 100}%` }}
          />
        </div>
      </div>
      <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-3">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

function Choice({ active, onClick, label, sub, testid }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`w-full text-left rounded-lg border-2 p-4 transition-all ${
        active
          ? "border-[#1E3A8A] bg-[#1E3A8A]/5"
          : "border-border hover:border-foreground/30 bg-background"
      }`}
    >
      <p className="font-medium text-sm">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </button>
  );
}

export default function AbTestWizard() {
  const api = useAdminApi();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [registry, setRegistry] = useState({ pages: [], element_types: [] });

  // Step 1 — page
  const [pageSlug, setPageSlug] = useState("");
  const [customSlug, setCustomSlug] = useState("");

  // Step 2 — element
  const [elementType, setElementType] = useState("");
  const [elementKey, setElementKey] = useState("");
  const [currentContent, setCurrentContent] = useState("");
  const [context, setContext] = useState("");

  // Step 3 — duration & split
  const [durationDays, setDurationDays] = useState(30);
  const [trafficSplit, setTrafficSplit] = useState("50/50"); // 50/50, 80/20, 70/30

  // Step 4 — AI variations
  const [generating, setGenerating] = useState(false);
  const [variations, setVariations] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);

  // Step 5 — review
  const [launching, setLaunching] = useState(false);
  const [testName, setTestName] = useState("");
  const [hypothesis, setHypothesis] = useState("");

  useEffect(() => {
    api.get("/admin/ab/v2/registry").then((r) => setRegistry(r.data)).catch(() => {});
  }, [api]);

  // Auto-suggest element_key when page+type change
  useEffect(() => {
    if (pageSlug && elementType) {
      const slugPart = (pageSlug || customSlug || "/")
        .replace(/^\//, "")
        .replace(/[^a-z0-9]+/gi, "_")
        .toLowerCase() || "home";
      setElementKey(`${slugPart}_${elementType}`);
      setCurrentContent(ELEMENT_DEFAULTS[elementType] || "");
      const pageName = registry.pages.find((p) => p.slug === pageSlug)?.name || "Custom Page";
      const elName = registry.element_types.find((e) => e.key === elementType)?.label || elementType;
      setTestName(`${pageName} — ${elName}`);
    }
  }, [pageSlug, customSlug, elementType, registry]);

  const finalSlug = pageSlug === "__custom__" ? customSlug : pageSlug;
  const canNext1 = !!finalSlug;
  const canNext2 = !!elementType && !!elementKey && !!currentContent;
  const canNext3 = durationDays >= 1;

  const onGenerate = async () => {
    setGenerating(true);
    try {
      const r = await api.post("/admin/ab/v2/generate", {
        page_slug: finalSlug,
        element_type: elementType,
        current_content: currentContent,
        context: context || undefined,
      });
      setVariations(r.data.variations || []);
      // Auto-select first variation
      if (r.data.variations?.[0]) {
        setSelectedKeys([r.data.variations[0].key]);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "AI generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const toggleSelect = (key) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const buildVariantsPayload = () => {
    // Variant 0 = control (current copy), then the selected AI variations
    const [splitA, splitB] = trafficSplit.split("/").map((s) => parseInt(s, 10));
    const selectedVariations = variations.filter((v) => selectedKeys.includes(v.key));
    const total = selectedVariations.length + 1; // +1 for control
    // Distribute weight: control gets splitA%, rest split splitB% evenly
    const controlWeight = splitA;
    const variantWeight = Math.floor(splitB / Math.max(1, selectedVariations.length));
    const variants = [
      {
        key: "control",
        label: "Control",
        content: currentContent,
        reasoning: "Current live copy.",
        weight: controlWeight,
      },
      ...selectedVariations.map((v, i) => ({
        key: v.key,
        label: v.label || `Variation ${String.fromCharCode(65 + i)}`,
        content: v.content,
        reasoning: v.reasoning,
        weight: variantWeight,
      })),
    ];
    return variants;
  };

  const onLaunch = async () => {
    if (selectedKeys.length === 0) {
      toast.error("Select at least one AI variation");
      return;
    }
    setLaunching(true);
    try {
      const variants = buildVariantsPayload();
      const r = await api.post("/admin/ab/v2", {
        name: testName,
        page_slug: finalSlug,
        element_type: elementType,
        element_key: elementKey,
        hypothesis: hypothesis || undefined,
        variants,
        duration_days: durationDays,
      });
      // Auto-launch
      await api.post(`/admin/ab/v2/${r.data.id}/launch`, {});
      toast.success("Test launched");
      nav(`/admin/ab-tests/${r.data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Launch failed");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto" data-testid="ab-wizard">
      <button
        onClick={() => nav("/admin/ab-tests")}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
        data-testid="ab-wizard-back"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to dashboard
      </button>

      {step === 1 && (
        <>
          <StepHeader step={1} total={5} title="Which page do you want to test?" />
          <Card className="border-border">
            <CardContent className="p-5 space-y-3">
              {registry.pages.map((p) => (
                <Choice
                  key={p.slug}
                  active={pageSlug === p.slug}
                  onClick={() => setPageSlug(p.slug)}
                  label={p.name}
                  sub={p.slug}
                  testid={`ab-page-${p.slug.replace(/[^a-z0-9]+/gi, "-")}`}
                />
              ))}
              <Choice
                active={pageSlug === "__custom__"}
                onClick={() => setPageSlug("__custom__")}
                label="Other / Custom URL"
                testid="ab-page-custom"
              />
              {pageSlug === "__custom__" && (
                <Input
                  placeholder="/your-custom-path"
                  value={customSlug}
                  onChange={(e) => setCustomSlug(e.target.value)}
                  data-testid="ab-custom-slug-input"
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {step === 2 && (
        <>
          <StepHeader step={2} total={5} title={`What to test on ${finalSlug}?`} subtitle="Pick one element type and confirm the current copy." />
          <Card className="border-border">
            <CardContent className="p-5 space-y-3">
              {registry.element_types.map((e) => (
                <Choice
                  key={e.key}
                  active={elementType === e.key}
                  onClick={() => setElementType(e.key)}
                  label={e.label}
                  testid={`ab-element-${e.key}`}
                />
              ))}
              {elementType && (
                <div className="space-y-3 pt-3 border-t border-border mt-3">
                  <div>
                    <Label>Element key (stable identifier on the page)</Label>
                    <Input
                      value={elementKey}
                      onChange={(e) => setElementKey(e.target.value)}
                      placeholder="homepage_hero_cta"
                      data-testid="ab-element-key-input"
                      className="mt-1.5 font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      The frontend &lt;AbSlot&gt; with this exact key will swap to the winning variation.
                    </p>
                  </div>
                  <div>
                    <Label>Current copy (control)</Label>
                    <Textarea
                      value={currentContent}
                      onChange={(e) => setCurrentContent(e.target.value)}
                      rows={2}
                      data-testid="ab-current-content"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Surrounding context <span className="text-muted-foreground">(optional)</span></Label>
                    <Textarea
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      rows={2}
                      placeholder="What surrounds this element? Who's the audience?"
                      data-testid="ab-context"
                      className="mt-1.5"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {step === 3 && (
        <>
          <StepHeader step={3} total={5} title="Duration & traffic split" />
          <Card className="border-border">
            <CardContent className="p-5 space-y-5">
              <div>
                <Label>How long?</Label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[15, 30, 60].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDurationDays(d)}
                      className={`rounded-lg border-2 py-3 text-sm font-medium transition-all ${
                        durationDays === d
                          ? "border-[#1E3A8A] bg-[#1E3A8A]/5 text-[#1E3A8A]"
                          : "border-border hover:border-foreground/30"
                      }`}
                      data-testid={`ab-duration-${d}`}
                    >
                      {d} days
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Label className="text-xs">Custom:</Label>
                  <Input
                    type="number"
                    min={1}
                    max={180}
                    value={durationDays}
                    onChange={(e) => setDurationDays(parseInt(e.target.value || "30", 10))}
                    className="w-24"
                    data-testid="ab-duration-custom"
                  />
                  <span className="text-xs text-muted-foreground">days</span>
                </div>
              </div>
              <div>
                <Label>Traffic split</Label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {["50/50", "70/30", "80/20"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setTrafficSplit(s)}
                      className={`rounded-lg border-2 py-3 text-sm font-medium transition-all ${
                        trafficSplit === s
                          ? "border-[#1E3A8A] bg-[#1E3A8A]/5 text-[#1E3A8A]"
                          : "border-border hover:border-foreground/30"
                      }`}
                      data-testid={`ab-split-${s.replace("/", "-")}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Control / Variation. 80/20 reduces risk on high-traffic pages.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {step === 4 && (
        <>
          <StepHeader
            step={4}
            total={5}
            title="AI-generated variations"
            subtitle="Claude Sonnet 4.5 will draft 5 variations targeting different motivations."
          />
          <Card className="border-border">
            <CardContent className="p-5">
              {variations.length === 0 ? (
                <div className="text-center py-8">
                  <Sparkles className="mx-auto h-10 w-10 text-[#1E3A8A]" />
                  <p className="mt-3 font-medium">Generate variations for &quot;{currentContent}&quot;</p>
                  <Button
                    onClick={onGenerate}
                    disabled={generating}
                    className="mt-4 bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                    data-testid="ab-generate-button"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate 5 variations
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Pick one or more to test against the control. ({selectedKeys.length} selected)
                  </p>
                  {variations.map((v, i) => {
                    const selected = selectedKeys.includes(v.key);
                    return (
                      <button
                        key={v.key}
                        onClick={() => toggleSelect(v.key)}
                        className={`w-full text-left rounded-lg border-2 p-4 transition-all ${
                          selected
                            ? "border-[#1E3A8A] bg-[#1E3A8A]/5"
                            : "border-border hover:border-foreground/30"
                        }`}
                        data-testid={`ab-variation-${i}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-[10px]">
                            {v.label || `Variation ${String.fromCharCode(65 + i)}`}
                          </Badge>
                          {v.motivation && (
                            <Badge className="bg-purple-100 text-purple-800 border-0 text-[10px] capitalize">
                              {v.motivation}
                            </Badge>
                          )}
                          {selected && <CheckCircle2 className="h-4 w-4 text-[#1E3A8A] ml-auto" />}
                        </div>
                        <p className="font-medium">{v.content}</p>
                        {v.reasoning && (
                          <p className="text-xs italic text-muted-foreground mt-2">{v.reasoning}</p>
                        )}
                      </button>
                    );
                  })}
                  <Button
                    variant="outline"
                    onClick={onGenerate}
                    disabled={generating}
                    className="w-full"
                    data-testid="ab-regenerate-button"
                  >
                    {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Regenerate
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {step === 5 && (
        <>
          <StepHeader step={5} total={5} title="Review & launch" />
          <Card className="border-border">
            <CardContent className="p-5 space-y-4">
              <div>
                <Label>Test name</Label>
                <Input
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  data-testid="ab-test-name"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Hypothesis <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea
                  value={hypothesis}
                  onChange={(e) => setHypothesis(e.target.value)}
                  rows={2}
                  placeholder="I think X will improve conversion by Y% because…"
                  data-testid="ab-hypothesis"
                  className="mt-1.5"
                />
              </div>
              <div className="rounded-lg border border-border bg-secondary/40 p-4 text-sm space-y-1">
                <p><span className="text-muted-foreground">Page:</span> {finalSlug}</p>
                <p><span className="text-muted-foreground">Element:</span> {elementType} (<code className="text-xs">{elementKey}</code>)</p>
                <p><span className="text-muted-foreground">Duration:</span> {durationDays} days</p>
                <p><span className="text-muted-foreground">Split:</span> {trafficSplit} (control / variation)</p>
                <p><span className="text-muted-foreground">Variants:</span> 1 control + {selectedKeys.length} variation(s)</p>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          data-testid="ab-wizard-prev"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        {step < 5 ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={
              (step === 1 && !canNext1) ||
              (step === 2 && !canNext2) ||
              (step === 3 && !canNext3) ||
              (step === 4 && selectedKeys.length === 0)
            }
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="ab-wizard-next"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={onLaunch}
            disabled={launching || selectedKeys.length === 0}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="ab-wizard-launch"
          >
            {launching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
            Launch test
          </Button>
        )}
      </div>
    </div>
  );
}
