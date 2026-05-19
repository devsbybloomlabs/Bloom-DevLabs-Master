/**
 * GetAuditPage — multi-step audit submission form mounted at /get-audit.
 * Funnels homepage visitors into a qualified-lead pipeline with AI-powered
 * workflow analysis triggered server-side after submit.
 */
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Header } from "@/components/sections/Header";
import { Footer } from "@/components/sections/Footer";
import RelatedLinks from "@/components/RelatedLinks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import SeoHead from "@/components/SeoHead";
import { fireGlobalConversion } from "@/lib/abVariant";
import { getAffiliateRef } from "@/lib/affiliate";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Sparkles,
  Phone,
  Mail,
  ArrowRight,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function ProgressBar({ step, total }) {
  return (
    <div className="space-y-2" data-testid="audit-progress">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Step {step} of {total}</span>
        <span>{Math.round((step / total) * 100)}% complete</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-[#1E3A8A] transition-all duration-300"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function GetAuditPage() {
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [options, setOptions] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // server response on success

  const [form, setForm] = useState({
    company_name: "",
    customer_name: "",
    customer_title: "",
    customer_email: "",
    customer_phone: "",
    industry: "",
    company_size: "",
    pain_point: "",
    budget_range: "",
    workflow_description: "",
    bottleneck_description: "",
    timeline: "",
    source_cta: searchParams.get("src") || "direct",
    source_url: typeof window !== "undefined" ? window.location.href : null,
  });

  useEffect(() => {
    axios.get(`${API}/audits/options`).then((r) => setOptions(r.data)).catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const canNext1 =
    form.company_name &&
    form.customer_name &&
    form.customer_title &&
    /\S+@\S+\.\S+/.test(form.customer_email) &&
    form.customer_phone.length >= 4 &&
    form.industry &&
    form.company_size &&
    form.pain_point &&
    form.budget_range;

  const canSubmit =
    form.workflow_description.trim().length >= 80 &&
    form.bottleneck_description.trim().length >= 20 &&
    form.timeline;

  const onSubmit = async () => {
    if (!canSubmit) {
      toast.error("Please fill out workflow + bottleneck + timeline");
      return;
    }
    setSubmitting(true);
    try {
      const payload = { ...form, affiliate_ref: getAffiliateRef() };
      const r = await axios.post(`${API}/audits`, payload);
      setSubmitted(r.data);
      setStep(3);
      // Fire conversion for any active A/B test this visitor was bucketed into
      try {
        fireGlobalConversion();
      } catch {
        // noop
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Submission failed — please retry");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="bg-background text-foreground" data-testid="get-audit-page">
      <SeoHead
        title="Get Your Free Custom App Audit · Bloom Labs"
        description="Tell us about your workflow. Within 24 business hours we'll call with 3-5 specific custom-app recommendations + fixed pricing tailored to your business."
        url="https://bybloomlabs.com/get-audit"
      />
      <Header />
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20">
        <div className="text-center mb-8">
          <Badge className="bg-amber-100 text-amber-900 border-0 mb-3">
            <Sparkles className="h-3 w-3 mr-1" />
            Free · 24h Turnaround
          </Badge>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight">
            Get your custom app audit
          </h1>
          <p className="mt-3 text-base text-muted-foreground max-w-xl mx-auto">
            Two short steps. Our AI analyses your workflow and our audit team calls
            within 24 business hours with 3–5 specific app recommendations + fixed pricing.
          </p>
        </div>

        {step <= 2 && <ProgressBar step={step} total={2} />}

        {step === 1 && (
          <Card className="border-border mt-6" data-testid="audit-step-1">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-display text-xl font-semibold">Tell us about you & your business</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Company name" required>
                  <Input
                    value={form.company_name}
                    onChange={(e) => set("company_name", e.target.value)}
                    data-testid="audit-company-name"
                  />
                </Field>
                <Field label="Your name" required>
                  <Input
                    value={form.customer_name}
                    onChange={(e) => set("customer_name", e.target.value)}
                    data-testid="audit-customer-name"
                  />
                </Field>
                <Field label="Your role" required>
                  <DropdownChoice
                    value={form.customer_title}
                    onChange={(v) => set("customer_title", v)}
                    options={options.roles || []}
                    placeholder="Select your role"
                    testid="audit-customer-title"
                  />
                </Field>
                <Field label="Work email" required>
                  <Input
                    type="email"
                    value={form.customer_email}
                    onChange={(e) => set("customer_email", e.target.value)}
                    data-testid="audit-customer-email"
                  />
                </Field>
                <Field label="Phone (we'll call within 24h)" required>
                  <Input
                    type="tel"
                    value={form.customer_phone}
                    onChange={(e) => set("customer_phone", e.target.value)}
                    placeholder="+1 555 123 4567"
                    data-testid="audit-customer-phone"
                  />
                </Field>
                <Field label="Industry" required>
                  <DropdownChoice
                    value={form.industry}
                    onChange={(v) => set("industry", v)}
                    options={options.industries || []}
                    placeholder="Select industry"
                    testid="audit-industry"
                  />
                </Field>
                <Field label="Company size" required>
                  <DropdownChoice
                    value={form.company_size}
                    onChange={(v) => set("company_size", v)}
                    options={options.company_sizes || []}
                    placeholder="Headcount"
                    testid="audit-company-size"
                  />
                </Field>
                <Field label="Biggest pain point" required>
                  <DropdownChoice
                    value={form.pain_point}
                    onChange={(v) => set("pain_point", v)}
                    options={options.pain_points || []}
                    placeholder="What's broken?"
                    testid="audit-pain-point"
                  />
                </Field>
              </div>
              <Field label="Budget range" required>
                <DropdownChoice
                  value={form.budget_range}
                  onChange={(v) => set("budget_range", v)}
                  options={options.budgets || []}
                  placeholder="Investment range"
                  testid="audit-budget"
                />
              </Field>
              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!canNext1}
                  className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                  data-testid="audit-step1-next"
                >
                  Next: Workflow details
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card className="border-border mt-6" data-testid="audit-step-2">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-display text-xl font-semibold">Walk us through your workflow</h2>
              <Field label="Describe your current workflow" required hint={`${form.workflow_description.length}/2000 (min 80)`}>
                <Textarea
                  rows={6}
                  value={form.workflow_description}
                  onChange={(e) => set("workflow_description", e.target.value)}
                  placeholder={`Tell us how you currently manage ${form.pain_point || "this"}. What tools do you use? What's broken? What takes too much time?`}
                  data-testid="audit-workflow"
                  maxLength={2000}
                />
              </Field>
              <Field label="What's your #1 bottleneck?" required hint={`${form.bottleneck_description.length}/1000 (min 20)`}>
                <Textarea
                  rows={3}
                  value={form.bottleneck_description}
                  onChange={(e) => set("bottleneck_description", e.target.value)}
                  placeholder="What's the single biggest thing slowing your team down?"
                  data-testid="audit-bottleneck"
                  maxLength={1000}
                />
              </Field>
              <Field label="When do you need this solved?" required>
                <div className="grid sm:grid-cols-2 gap-2">
                  {(options.timelines || []).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set("timeline", t)}
                      className={`rounded-lg border-2 p-3 text-sm text-left transition-all ${
                        form.timeline === t
                          ? "border-[#1E3A8A] bg-[#1E3A8A]/5 text-[#1E3A8A] font-medium"
                          : "border-border hover:border-foreground/30"
                      }`}
                      data-testid={`audit-timeline-${t.replace(/[^a-z0-9]+/gi, "-")}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)} data-testid="audit-step2-back">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <Button
                  onClick={onSubmit}
                  disabled={!canSubmit || submitting}
                  className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                  data-testid="audit-submit"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      Get my audit
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && submitted && (
          <Card className="border-2 border-green-300 bg-green-50/40 mt-6" data-testid="audit-success">
            <CardContent className="p-8 text-center space-y-4">
              <div className="mx-auto h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-9 w-9 text-green-700" />
              </div>
              <h2 className="font-display text-3xl font-semibold tracking-tight">
                Thanks, {form.customer_name.split(" ")[0]}! Your audit is in queue.
              </h2>
              <p className="text-base text-muted-foreground max-w-lg mx-auto">
                Our AI is analysing your workflow right now. Our audit team will call you
                with personalised recommendations and pricing by{" "}
                <strong>{submitted.expected_call_window}</strong>.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 max-w-md mx-auto pt-2 text-left text-sm">
                <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-[#1E3A8A]" />
                  <span>{submitted.customer_phone}</span>
                </div>
                <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[#1E3A8A]" />
                  <span className="truncate">{submitted.customer_email}</span>
                </div>
              </div>
              <div className="pt-4 border-t border-green-200 mt-4 text-sm space-y-2">
                <p className="font-medium">What happens next</p>
                <ol className="list-decimal list-inside text-muted-foreground space-y-1 max-w-md mx-auto text-left">
                  <li>BloomAI analyses your workflow (~5 min)</li>
                  <li>Audit team reviews your context</li>
                  <li>You receive a call by {submitted.expected_call_window} with a 3–5 app recommendation plan</li>
                </ol>
              </div>
              <p className="text-xs text-muted-foreground italic pt-2">
                Recent clients reviewed their audits in <strong>4.2 minutes on average.</strong>
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
                <Link to="/case-studies">
                  <Button variant="outline" data-testid="audit-success-cases">
                    Browse case studies
                  </Button>
                </Link>
                <Link to="/">
                  <Button variant="ghost" data-testid="audit-success-home">Back to home</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {step <= 2 && (
          <p className="text-center text-xs text-muted-foreground mt-6">
            We&rsquo;ll never share your details. By submitting you agree to receive an audit
            call from the Bloom Labs team.
          </p>
        )}
      </section>
      <RelatedLinks />
      <Footer />
    </main>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function DropdownChoice({ value, onChange, options, placeholder, testid }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testid}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt} data-testid={`${testid}-option-${opt.replace(/[^a-z0-9]+/gi, "-")}`}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
