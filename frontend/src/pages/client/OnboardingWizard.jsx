/**
 * OnboardingWizard — 3-step form for client onboarding.
 *
 * Reads/writes via:
 *   - authenticated client routes (`/api/clients/me/onboarding`) when logged in
 *   - public token route (`/api/onboarding/by-token/{token}`) when ?token= present
 *
 * Auto-saves drafts on blur. Submit advances to next phase + triggers backend
 * automation (Nifty tasks, AH project, notifications).
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useClientAuth, clientApi } from "@/lib/clientAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Save,
  CheckCircle2,
  Loader2,
  Palette,
  Sparkles,
  Building2,
} from "lucide-react";
import { BRAND } from "@/lib/brand";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STEP_META = [
  {
    id: 1,
    name: "Design Language",
    icon: Palette,
    description: "Share 3 designs you love + why. We use this to lock in your visual direction.",
  },
  {
    id: 2,
    name: "Function Language",
    icon: Sparkles,
    description: "Reference 3 apps that work the way yours should — features, flows, interactions.",
  },
  {
    id: 3,
    name: "Company & Kickoff",
    icon: Building2,
    description: "The story, goals, and 1–3 things that mean this project was a success.",
  },
];

function emptyDesignLink() {
  return { url: "", why: "" };
}
function emptyFunctionLink() {
  return { url: "", why: "" };
}
function emptyScenario() {
  return { description: "", metric: "" };
}

export default function OnboardingWizard() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { token: clientToken, client } = useClientAuth();
  const navigate = useNavigate();

  // pick the right API binding
  const bindings = useMemo(() => {
    if (token) {
      return {
        fetch: () => axios.get(`${API}/onboarding/by-token/${token}`),
        save: (phase, payload) =>
          axios.post(`${API}/onboarding/by-token/${token}/save`, { phase, payload }),
        submit: (phase, payload) =>
          axios.post(`${API}/onboarding/by-token/${token}/submit`, { phase, payload }),
        kind: "token",
      };
    }
    if (clientToken) {
      const api = clientApi(clientToken);
      return {
        fetch: () => api.get("/clients/me/onboarding"),
        save: (phase, payload) => api.post("/clients/me/onboarding/save", { phase, payload }),
        submit: (phase, payload) =>
          api.post("/clients/me/onboarding/submit", { phase, payload }),
        kind: "client",
      };
    }
    return null;
  }, [token, clientToken]);

  const [doc, setDoc] = useState(null);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Onboarding — Bloom Labs";
    if (!bindings) {
      navigate("/login");
      return;
    }
    bindings
      .fetch()
      .then((r) => {
        setDoc(r.data);
        setStep(r.data.current_phase || 1);
      })
      .catch((e) => {
        const detail = e?.response?.data?.detail;
        toast.error(detail || "Could not load onboarding");
        if (!clientToken) navigate("/login");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, clientToken]);

  const phaseKey = `phase${step}`;
  const phaseData = doc?.[phaseKey] || {};

  // ---------- field updaters ----------
  const setPhaseField = useCallback((field, value) => {
    setDoc((prev) =>
      prev ? { ...prev, [phaseKey]: { ...prev[phaseKey], [field]: value } } : prev
    );
  }, [phaseKey]);

  const setArrayItem = useCallback((arrField, idx, key, value) => {
    setDoc((prev) => {
      if (!prev) return prev;
      const arr = [...(prev[phaseKey]?.[arrField] || [])];
      while (arr.length < 3) arr.push(arrField === "success_scenarios" ? emptyScenario() : emptyDesignLink());
      arr[idx] = { ...arr[idx], [key]: value };
      return { ...prev, [phaseKey]: { ...prev[phaseKey], [arrField]: arr } };
    });
  }, [phaseKey]);

  const doSave = useCallback(async () => {
    if (!doc || !bindings) return;
    setSaving(true);
    try {
      const r = await bindings.save(step, doc[phaseKey]);
      setDoc(r.data);
      toast.success("Draft saved", { duration: 1500 });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [doc, bindings, step, phaseKey]);

  const doSubmit = useCallback(async () => {
    if (!doc || !bindings) return;
    setSubmitting(true);
    try {
      const r = await bindings.submit(step, doc[phaseKey]);
      setDoc(r.data);
      if (r.data.completed) {
        toast.success("🎉 Onboarding complete!");
      } else {
        toast.success(`Step ${step} submitted — your team has been notified.`);
        setStep(Math.min(step + 1, 3));
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }, [doc, bindings, step, phaseKey]);

  if (!doc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--warm-50)]">
        <Skeleton className="h-40 w-96" />
      </div>
    );
  }

  const completed = doc.completed;
  const progressValue = ((step - 1) / 3) * 100 + (completed ? 100 : 0);

  return (
    <div className="min-h-screen bg-[var(--warm-50)]" data-testid="onboarding-page">
      <header className="border-b border-border bg-background">
        <div className="mx-auto max-w-[920px] px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2" data-testid="onboarding-logo-link">
            <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-7 sm:h-8" />
          </a>
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Onboarding
            </span>
            <span className="text-sm font-medium">{doc.client_name || doc.client_email}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[920px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12" data-testid="onboarding-main">
        {completed ? (
          <CompletionScreen doc={doc} navigate={navigate} />
        ) : (
          <>
            {/* Progress */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Step {step} of 3
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(progressValue)}%
                </span>
              </div>
              <Progress value={progressValue} className="h-2" />
              <div className="mt-4 flex flex-wrap gap-2">
                {STEP_META.map((s) => {
                  const submitted = !!doc[`phase${s.id}_submitted_at`];
                  const active = s.id === step;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStep(s.id)}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                        active
                          ? "border-[#1E3A8A] bg-[#1E3A8A] text-white"
                          : submitted
                          ? "border-green-500/40 bg-green-50 text-green-800"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid={`onboarding-step-tab-${s.id}`}
                    >
                      {submitted && <CheckCircle2 className="h-3 w-3" />}
                      <s.icon className="h-3 w-3" />
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <Card className="border-border shadow-[var(--shadow-md)]">
              <CardHeader>
                <CardTitle className="font-display text-xl flex items-center gap-2">
                  {STEP_META[step - 1].icon && (() => {
                    const Icon = STEP_META[step - 1].icon;
                    return <Icon className="h-5 w-5 text-[#1E3A8A]" />;
                  })()}
                  {STEP_META[step - 1].name}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {STEP_META[step - 1].description}
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {step === 1 && (
                  <Phase1Form data={phaseData} setArrayItem={setArrayItem} setField={setPhaseField} />
                )}
                {step === 2 && (
                  <Phase2Form data={phaseData} setArrayItem={setArrayItem} setField={setPhaseField} />
                )}
                {step === 3 && (
                  <Phase3Form data={phaseData} setArrayItem={setArrayItem} setField={setPhaseField} />
                )}

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(Math.max(step - 1, 1))}
                    disabled={step === 1}
                    data-testid="onboarding-prev-button"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={doSave}
                      disabled={saving}
                      data-testid="onboarding-save-button"
                    >
                      {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Save draft
                    </Button>
                    <Button
                      type="button"
                      onClick={doSubmit}
                      disabled={submitting}
                      className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                      data-testid="onboarding-submit-button"
                    >
                      {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      {step === 3 ? "Finish onboarding" : `Submit step ${step}`}
                      {step < 3 && <ArrowRight className="h-4 w-4 ml-2" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              You can save and come back anytime. Auto-saves are stored
              securely against your account.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function CompletionScreen({ doc, navigate }) {
  return (
    <div className="text-center py-8" data-testid="onboarding-complete">
      <div className="mx-auto h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-5">
        <CheckCircle2 className="h-9 w-9 text-green-600" />
      </div>
      <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
        Onboarding complete — you&apos;re in motion. 🚀
      </h1>
      <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
        Our team has been notified. You&apos;ll hear from your project manager
        within 1 business day with your kickoff brief and timeline.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Button
          onClick={() => navigate("/portal")}
          className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-11 px-6"
          data-testid="onboarding-complete-portal-button"
        >
          Go to portal <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Phase 1 — Design Language
// ============================================================================
function Phase1Form({ data, setArrayItem, setField }) {
  const links = data.design_links || [emptyDesignLink(), emptyDesignLink(), emptyDesignLink()];
  while (links.length < 3) links.push(emptyDesignLink());
  return (
    <div className="space-y-6">
      {links.slice(0, 3).map((link, idx) => (
        <div key={idx} className="rounded-lg border border-border bg-background p-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Design Reference {idx + 1}
          </p>
          <div>
            <Label className="text-sm">Link (Behance, Dribbble, website, etc.)</Label>
            <Input
              value={link.url || ""}
              onChange={(e) => setArrayItem("design_links", idx, "url", e.target.value)}
              placeholder="https://…"
              data-testid={`onboarding-design-link-${idx}-url`}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-sm">Why this design?</Label>
            <Textarea
              value={link.why || ""}
              onChange={(e) => setArrayItem("design_links", idx, "why", e.target.value)}
              placeholder="What specifically do you love about this? (colors, layout, vibe…)"
              data-testid={`onboarding-design-link-${idx}-why`}
              className="mt-1.5 min-h-[72px]"
            />
          </div>
        </div>
      ))}
      <div>
        <Label className="text-sm">Color preferences</Label>
        <Input
          value={data.color_preferences || ""}
          onChange={(e) => setField("color_preferences", e.target.value)}
          placeholder='e.g. "deep navy + warm cream + 1 accent"'
          data-testid="onboarding-color-preferences"
          className="mt-1.5"
        />
      </div>
      <div>
        <Label className="text-sm">Mood keywords</Label>
        <Input
          value={data.mood_keywords || ""}
          onChange={(e) => setField("mood_keywords", e.target.value)}
          placeholder='e.g. "trustworthy, premium, technical-but-warm"'
          data-testid="onboarding-mood-keywords"
          className="mt-1.5"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Phase 2 — Function Language
// ============================================================================
function Phase2Form({ data, setArrayItem, setField }) {
  const links = data.function_links || [emptyFunctionLink(), emptyFunctionLink(), emptyFunctionLink()];
  while (links.length < 3) links.push(emptyFunctionLink());
  return (
    <div className="space-y-6">
      {links.slice(0, 3).map((link, idx) => (
        <div key={idx} className="rounded-lg border border-border bg-background p-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Functional Reference {idx + 1}
          </p>
          <div>
            <Label className="text-sm">Link (existing app / tool)</Label>
            <Input
              value={link.url || ""}
              onChange={(e) => setArrayItem("function_links", idx, "url", e.target.value)}
              placeholder="https://…"
              data-testid={`onboarding-function-link-${idx}-url`}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-sm">What about it works the way you want?</Label>
            <Textarea
              value={link.why || ""}
              onChange={(e) => setArrayItem("function_links", idx, "why", e.target.value)}
              placeholder="Specific features, flows, interactions…"
              data-testid={`onboarding-function-link-${idx}-why`}
              className="mt-1.5 min-h-[72px]"
            />
          </div>
        </div>
      ))}
      <div>
        <Label className="text-sm">Additional spec / nice-to-haves</Label>
        <Textarea
          value={data.additional_specs || ""}
          onChange={(e) => setField("additional_specs", e.target.value)}
          placeholder="Anything not covered above? Custom integrations? Compliance needs?"
          data-testid="onboarding-additional-specs"
          className="mt-1.5 min-h-[100px]"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Phase 3 — Company & Kickoff
// ============================================================================
function Phase3Form({ data, setArrayItem, setField }) {
  const scenarios = data.success_scenarios || [emptyScenario(), emptyScenario(), emptyScenario()];
  while (scenarios.length < 3) scenarios.push(emptyScenario());
  return (
    <div className="space-y-6">
      <div>
        <Label className="text-sm">Project name</Label>
        <Input
          value={data.project_name || ""}
          onChange={(e) => setField("project_name", e.target.value)}
          placeholder="e.g. Hyperdrive CRM v2"
          data-testid="onboarding-project-name"
          className="mt-1.5"
        />
      </div>
      <div>
        <Label className="text-sm">Company story (2-3 sentences)</Label>
        <Textarea
          value={data.company_story || ""}
          onChange={(e) => setField("company_story", e.target.value)}
          placeholder="What does your company do? Who do you serve?"
          data-testid="onboarding-company-story"
          className="mt-1.5 min-h-[100px]"
        />
      </div>
      <div>
        <Label className="text-sm">Goals for this project</Label>
        <Textarea
          value={data.goals || ""}
          onChange={(e) => setField("goals", e.target.value)}
          placeholder="What does this system need to do for your business?"
          data-testid="onboarding-goals"
          className="mt-1.5 min-h-[100px]"
        />
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground mb-3">
          1-3 Success Scenarios
        </p>
        <div className="space-y-3">
          {scenarios.slice(0, 3).map((s, idx) => (
            <div key={idx} className="rounded-lg border border-border bg-background p-4 space-y-3">
              <div>
                <Label className="text-sm">Scenario {idx + 1} — what would make this a win?</Label>
                <Input
                  value={s.description || ""}
                  onChange={(e) =>
                    setArrayItem("success_scenarios", idx, "description", e.target.value)
                  }
                  placeholder='e.g. "Our team saves 5 hrs/week on quote prep"'
                  data-testid={`onboarding-success-scenario-${idx}-description`}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-sm">How will you measure it?</Label>
                <Input
                  value={s.metric || ""}
                  onChange={(e) =>
                    setArrayItem("success_scenarios", idx, "metric", e.target.value)
                  }
                  placeholder='e.g. "Time tracking before/after launch"'
                  data-testid={`onboarding-success-scenario-${idx}-metric`}
                  className="mt-1.5"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-sm">Timeline expectation</Label>
          <Input
            value={data.timeline_expectation || ""}
            onChange={(e) => setField("timeline_expectation", e.target.value)}
            placeholder='e.g. "2-4 weeks"'
            data-testid="onboarding-timeline-expectation"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label className="text-sm">Budget</Label>
          <Input
            value={data.budget || ""}
            onChange={(e) => setField("budget", e.target.value)}
            placeholder='e.g. "$8,995 (Custom Build)"'
            data-testid="onboarding-budget"
            className="mt-1.5"
          />
        </div>
      </div>
    </div>
  );
}
