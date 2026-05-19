/**
 * AffiliatePage — public landing page at /affiliate.
 * Marketing + signup flow. Only existing Bloom clients (logged in via
 * /login) can enroll. Double opt-in: a verification email is sent.
 */
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { Header } from "@/components/sections/Header";
import { Footer } from "@/components/sections/Footer";
import RelatedLinks from "@/components/RelatedLinks";
import SeoHead from "@/components/SeoHead";
import { useClientAuth } from "@/lib/clientAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Share2,
  TrendingUp,
  Gift,
  CheckCircle2,
  Mail,
  ArrowRight,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RELATIONSHIPS = [
  "Current Bloom customer",
  "Former customer",
  "Business partner",
  "Industry peer",
];
const VOLUMES = [
  "Just exploring",
  "1-2 per year",
  "3-5 per year",
  "More than 5 per year",
];

function Feature({ icon: Icon, title, bullets }) {
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-6"
      data-testid={`affiliate-feature-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="h-10 w-10 rounded-lg bg-[#1E3A8A]/10 text-[#1E3A8A] flex items-center justify-center">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-display text-base md:text-lg font-semibold mt-4">{title}</h3>
      <ul className="mt-3 space-y-2">
        {bullets.map((b) => (
          <li key={b} className="text-sm text-slate-600 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignupCard() {
  const { client, token, loading: authLoading } = useClientAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    company_name: "",
    relationship: "",
    volume_expectation: "",
    agreed_to_terms: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  // Pre-fill name + company from client profile once after auth resolves.
  useEffect(() => {
    if (client && !form.full_name && client.name) {
      setForm((f) => ({
        ...f,
        full_name: client.name,
        company_name: client.company || f.company_name,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const isReady =
    form.full_name.trim() &&
    form.company_name.trim() &&
    form.relationship &&
    form.volume_expectation &&
    form.agreed_to_terms;

  const onSubmit = async () => {
    if (!isReady) {
      toast.error("Please complete all fields and agree to the terms");
      return;
    }
    setSubmitting(true);
    try {
      const r = await axios.post(
        `${API}/affiliate/enroll`,
        form,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(r.data);
      toast.success("Check your email to verify your account");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not enroll");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="text-center py-8" data-testid="affiliate-signup-loading">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
      </div>
    );
  }

  if (!token) {
    return (
      <Card className="border-slate-200" data-testid="affiliate-signup-need-login">
        <CardContent className="p-6 sm:p-8 text-center space-y-4">
          <ShieldCheck className="h-10 w-10 text-[#1E3A8A] mx-auto" />
          <h3 className="font-display text-xl font-semibold">Sign in to your Bloom account</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Our affiliate program is open to current and former Bloom clients. Sign in to your client portal to enrol.
          </p>
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <Button
              onClick={() => navigate("/login?next=/affiliate")}
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
              data-testid="affiliate-login-cta"
            >
              Sign in
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/register")}
              data-testid="affiliate-register-cta"
            >
              Create account
            </Button>
          </div>
          <p className="text-xs text-slate-500 italic pt-2">
            Don't have a Bloom account yet? You'll need one to receive your tiered discount on future add-ons.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (success) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/30" data-testid="affiliate-signup-success">
        <CardContent className="p-6 sm:p-8 text-center space-y-3">
          <Mail className="h-12 w-12 text-emerald-700 mx-auto" />
          <h3 className="font-display text-xl font-semibold text-slate-900">
            {success.status === "already_active" ? "You're already enrolled" : "Check your email"}
          </h3>
          {success.status === "already_active" ? (
            <>
              <p className="text-sm text-slate-700">
                Your referral link is ready to go.
              </p>
              <Button
                onClick={() => navigate("/affiliate/dashboard")}
                className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                data-testid="affiliate-go-dashboard"
              >
                Open my dashboard
              </Button>
            </>
          ) : (
            <p className="text-sm text-slate-700 max-w-md mx-auto">
              We sent a verification link to <strong>{client?.email}</strong>. Click it to activate your account and reveal your unique referral link.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200" data-testid="affiliate-signup-form">
      <CardContent className="p-6 sm:p-8 space-y-4">
        <div>
          <h3 className="font-display text-xl font-semibold">Create your affiliate account</h3>
          <p className="text-sm text-slate-600 mt-1">
            Signed in as <strong>{client?.email}</strong>
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-sm">Full name *</Label>
            <Input
              className="mt-1.5"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              data-testid="affiliate-form-name"
            />
          </div>
          <div>
            <Label className="text-sm">Company name *</Label>
            <Input
              className="mt-1.5"
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              data-testid="affiliate-form-company"
            />
          </div>
          <div>
            <Label className="text-sm">Relationship to Bloom *</Label>
            <Select
              value={form.relationship}
              onValueChange={(v) => setForm({ ...form, relationship: v })}
            >
              <SelectTrigger className="mt-1.5" data-testid="affiliate-form-relationship">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIPS.map((r) => (
                  <SelectItem key={r} value={r} data-testid={`affiliate-form-relationship-${r.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Expected volume / year *</Label>
            <Select
              value={form.volume_expectation}
              onValueChange={(v) => setForm({ ...form, volume_expectation: v })}
            >
              <SelectTrigger className="mt-1.5" data-testid="affiliate-form-volume">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {VOLUMES.map((v) => (
                  <SelectItem key={v} value={v} data-testid={`affiliate-form-volume-${v.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-start gap-2 pt-2">
          <Checkbox
            id="affiliate-terms"
            checked={form.agreed_to_terms}
            onCheckedChange={(v) => setForm({ ...form, agreed_to_terms: !!v })}
            data-testid="affiliate-form-terms"
          />
          <Label htmlFor="affiliate-terms" className="text-sm text-slate-700 leading-relaxed cursor-pointer">
            I agree to the Bloom Labs affiliate program terms — discounts apply only to future add-on purchases, and I won't earn tier credit for referring myself.
          </Label>
        </div>
        <Button
          onClick={onSubmit}
          disabled={!isReady || submitting}
          className="w-full bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
          data-testid="affiliate-form-submit"
        >
          {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Create my affiliate account
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AffiliatePage() {
  return (
    <main className="bg-background text-foreground" data-testid="affiliate-page">
      <SeoHead
        title="Bloom Labs Affiliate Program — Earn Tiered Discounts"
        description="Refer companies to Bloom Labs and earn 10%, 15%, and 20% stacking discounts on add-ons. Transparent click + conversion tracking. Only for current and former Bloom clients."
        keywords="affiliate program, referral rewards, custom web app development, software agency referrals"
        url="https://bybloomlabs.com/affiliate"
      />
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0F172A] via-[#1E3A8A] to-[#0F172A] text-white py-20 lg:py-28" data-testid="affiliate-hero">
        <div className="absolute inset-0 opacity-20 mix-blend-luminosity bg-cover bg-center"
             style={{ backgroundImage: "url('https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=1900&q=80')" }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-transparent to-transparent" />
        <div className="relative mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              Affiliate program · transparent rewards
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight">
              Earn discounts by referring Bloom.
            </h1>
            <p className="mt-6 text-lg text-slate-300 max-w-2xl leading-relaxed">
              Share your unique referral link, track every click in real time, and unlock <strong className="text-emerald-300">10% → 15% → 20%</strong> stacking discounts on every add-on and new feature you ever buy from us.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#enroll"
                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-6 py-3.5 rounded-md shadow-lg shadow-emerald-500/20 transition"
                data-testid="affiliate-hero-cta"
              >
                Join the program
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                to="/affiliate/dashboard"
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold px-6 py-3.5 rounded-md transition"
                data-testid="affiliate-hero-dashboard"
              >
                I'm already enrolled
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Three columns */}
      <section className="py-20 bg-white" data-testid="affiliate-features">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">How it works</p>
            <h2 className="font-display text-3xl md:text-4xl font-semibold mt-2">Built for transparent referrals</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <Feature
              icon={Share2}
              title="Easy referrals"
              bullets={["Get a unique referral link", "Share with anyone (clients, LinkedIn, email)", "Real-time click tracking"]}
            />
            <Feature
              icon={TrendingUp}
              title="Transparent rewards"
              bullets={["See every click as it happens", "Monitor each referral's stage live", "No black boxes, no surprises"]}
            />
            <Feature
              icon={Gift}
              title="Stacking discounts"
              bullets={["1st full build referral → 10% off", "2nd → upgrade to 15% off", "3rd → upgrade to 20% off · permanent"]}
            />
          </div>
        </div>
      </section>

      {/* Tier ladder */}
      <section className="py-20 bg-slate-50" data-testid="affiliate-tiers">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-center">The tier ladder</h2>
          <p className="text-center text-sm text-slate-600 mt-2 max-w-xl mx-auto">
            Each closed-won referral permanently upgrades your discount on future add-ons and new features.
          </p>
          <div className="mt-10 grid md:grid-cols-3 gap-4">
            {[
              { tier: 1, pct: 10, color: "from-blue-600 to-blue-700" },
              { tier: 2, pct: 15, color: "from-emerald-500 to-emerald-600", featured: true },
              { tier: 3, pct: 20, color: "from-amber-500 to-orange-600" },
            ].map((t) => (
              <div
                key={t.tier}
                className={`rounded-2xl bg-gradient-to-br ${t.color} text-white p-7 ${t.featured ? "scale-[1.02] shadow-xl" : ""}`}
                data-testid={`affiliate-tier-${t.pct}`}
              >
                <p className="text-xs uppercase tracking-wider opacity-80">Tier {t.tier}</p>
                <p className="text-5xl font-bold tabular-nums mt-2">{t.pct}%</p>
                <p className="mt-3 text-sm leading-relaxed opacity-95">
                  Unlocked after <strong>{t.tier}</strong> full-build referral{t.tier > 1 ? "s" : ""} close. Replaces lower tiers — discount applies to <em>your</em> future add-ons.
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Signup */}
      <section id="enroll" className="py-20 bg-white" data-testid="affiliate-enroll-section">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-center">Join the program</h2>
          <p className="text-center text-sm text-slate-600 mt-2">
            Only current and former Bloom clients can enrol. We send a verification email — click the link to activate.
          </p>
          <div className="mt-8">
            <SignupCard />
          </div>
        </div>
      </section>

      <RelatedLinks />
      <Footer />
    </main>
  );
}
