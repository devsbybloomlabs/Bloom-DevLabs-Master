/**
 * /portal/welcome — Post-purchase company setup wizard.
 * 3 steps:
 *   1. Company profile (name, phone, address)
 *   2. Team invites (email list)
 *   3. Done
 */
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { useClientAuth, clientApi } from "@/lib/clientAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  ArrowRight, ArrowLeft, Building2, Users, CheckCircle2, Trash2, Plus, Sparkles, Shield,
} from "lucide-react";
import { BRAND } from "@/lib/brand";

export default function CompanyWelcomeWizard() {
  const navigate = useNavigate();
  const { client, token, loading } = useClientAuth();
  const api = token ? clientApi(token) : null;
  const [step, setStep] = useState(1);
  const [initializing, setInitializing] = useState(true);
  const [company, setCompany] = useState(null);
  // Step 1 form
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  // Step 2 form
  const [emails, setEmails] = useState([""]);
  const [savingInvites, setSavingInvites] = useState(false);
  // Step 3 result
  const [inviteResult, setInviteResult] = useState({ sent: [], skipped: [] });

  useEffect(() => {
    document.title = "Welcome — Bloom Labs";
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!client) { navigate("/login?next=/portal/welcome"); return; }
    (async () => {
      try {
        const { data } = await api.post("/company-setup/init");
        setCompany(data.company);
        setCompanyName(data.company?.name || client.name || "");
        setPhone(data.company?.phone || "");
        setAddress(data.company?.address || "");
        if (data.company?.setup_status === "complete") {
          navigate("/portal");
          return;
        }
      } catch (err) {
        toast.error("Couldn't load company info — please try again.");
      } finally {
        setInitializing(false);
      }
    })();
  }, [loading, client, navigate, api]);

  const saveProfile = async () => {
    if (!companyName.trim()) {
      toast.error("Company name is required");
      return;
    }
    setSavingProfile(true);
    try {
      const { data } = await api.post("/company-setup/profile", {
        company_name: companyName.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      });
      setCompany(data.company);
      setStep(2);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const sendInvites = async () => {
    const cleaned = emails.map((e) => e.trim()).filter((e) => /.+@.+\..+/.test(e));
    if (!cleaned.length) {
      // Skip → just mark complete and go to portal
      await api.post("/company-setup/complete");
      navigate("/portal?welcome=1");
      return;
    }
    setSavingInvites(true);
    try {
      const { data } = await api.post("/company-setup/invites", { emails: cleaned });
      setInviteResult(data);
      await api.post("/company-setup/complete");
      setStep(3);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to send invites");
    } finally {
      setSavingInvites(false);
    }
  };

  if (loading || initializing) {
    return <div className="min-h-screen grid place-items-center text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/30 to-indigo-50/30" data-testid="welcome-wizard">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Brand */}
        <Link to="/" className="inline-flex items-center gap-2 mb-8">
          <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-8" />
        </Link>

        {/* Stepper */}
        <div className="flex items-center gap-3 mb-10" data-testid="welcome-stepper">
          {[
            { n: 1, label: "Company", icon: Building2 },
            { n: 2, label: "Team", icon: Users },
            { n: 3, label: "Done", icon: CheckCircle2 },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-3 flex-1">
              <div className={`h-9 w-9 rounded-full grid place-items-center flex-shrink-0 ${
                step > s.n ? "bg-emerald-500 text-white" : step === s.n ? "bg-indigo-700 text-white" : "bg-slate-200 text-slate-500"
              }`}>
                {step > s.n ? <CheckCircle2 className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
              </div>
              <span className={`text-sm font-medium ${step === s.n ? "text-slate-900" : "text-slate-500"}`}>{s.label}</span>
              {i < 2 && <div className={`h-px flex-1 ${step > s.n ? "bg-emerald-500" : "bg-slate-200"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1 — Company profile */}
        {step === 1 && (
          <Card className="border-slate-200" data-testid="welcome-step-1">
            <CardContent className="p-7 sm:p-9">
              <div className="flex items-center gap-1.5 mb-3 text-xs text-indigo-700 font-semibold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" />Step 1 of 3
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold text-slate-900">Tell us about your company.</h1>
              <p className="mt-2 text-sm text-slate-600">
                This shows up on invoices, contracts, and the team invite emails your
                teammates will receive.
              </p>
              <div className="mt-6 space-y-4">
                <div>
                  <Label>Company name <span className="text-rose-500">*</span></Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Coaching LLC" data-testid="welcome-company-name" className="mt-1.5" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="555-123-4567" data-testid="welcome-company-phone" className="mt-1.5" />
                </div>
                <div>
                  <Label>Address (optional)</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Denver, CO 80202" data-testid="welcome-company-address" className="mt-1.5" />
                </div>
              </div>
              <div className="mt-8 flex items-center justify-between">
                <button onClick={() => navigate("/portal")} className="text-sm text-slate-500 hover:text-slate-700" data-testid="welcome-skip-link">Skip for now</button>
                <Button onClick={saveProfile} disabled={savingProfile} className="bg-indigo-700 hover:bg-indigo-800 text-white h-11 px-6" data-testid="welcome-step-1-next">
                  {savingProfile ? "Saving…" : "Continue"}<ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2 — Team invites */}
        {step === 2 && (
          <Card className="border-slate-200" data-testid="welcome-step-2">
            <CardContent className="p-7 sm:p-9">
              <div className="flex items-center gap-1.5 mb-3 text-xs text-indigo-700 font-semibold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" />Step 2 of 3
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold text-slate-900">Invite your team.</h1>
              <p className="mt-2 text-sm text-slate-600">
                Teammates get <strong className="text-slate-900">view-only access</strong> to your portal — same screens, same data, but read-only. You can promote them to admin later from your portal settings.
              </p>
              <div className="mt-6 space-y-2.5">
                {emails.map((em, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={em}
                      onChange={(e) => { const next = [...emails]; next[i] = e.target.value; setEmails(next); }}
                      placeholder={`teammate${i + 1}@yourcompany.com`}
                      data-testid={`welcome-invite-email-${i}`}
                      className="h-10"
                    />
                    {emails.length > 1 && (
                      <button type="button" onClick={() => setEmails(emails.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500 p-2" data-testid={`welcome-invite-remove-${i}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setEmails([...emails, ""])} className="text-xs font-medium text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1" data-testid="welcome-invite-add-row">
                  <Plus className="h-3.5 w-3.5" />Add another teammate
                </button>
              </div>
              <div className="mt-6 rounded-lg bg-indigo-50 border border-indigo-100 p-4 flex items-start gap-2">
                <Shield className="h-4 w-4 text-indigo-700 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-900 leading-relaxed">
                  Each invite expires in 14 days. You'll be the company admin — any
                  admin can promote teammates to admin later. The original purchaser
                  cannot be demoted.
                </p>
              </div>
              <div className="mt-8 flex items-center justify-between">
                <Button variant="outline" onClick={() => setStep(1)} data-testid="welcome-step-2-back">
                  <ArrowLeft className="h-4 w-4 mr-1.5" />Back
                </Button>
                <Button onClick={sendInvites} disabled={savingInvites} className="bg-indigo-700 hover:bg-indigo-800 text-white h-11 px-6" data-testid="welcome-step-2-send">
                  {savingInvites ? "Sending…" : emails.some(e => e.trim()) ? "Send invites & finish" : "Skip & finish"}
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3 — Done */}
        {step === 3 && (
          <Card className="border-emerald-200 bg-gradient-to-br from-white to-emerald-50/30" data-testid="welcome-step-3">
            <CardContent className="p-7 sm:p-9 text-center">
              <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 grid place-items-center mb-4">
                <CheckCircle2 className="h-9 w-9 text-emerald-600" />
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold text-slate-900">You're all set.</h1>
              <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
                {inviteResult.sent.length > 0
                  ? <>We sent <strong>{inviteResult.sent.length}</strong> invite email{inviteResult.sent.length === 1 ? "" : "s"}. Teammates will land in view-only mode once they accept.</>
                  : <>You can invite teammates anytime from your portal settings.</>}
              </p>
              {inviteResult.sent.length > 0 && (
                <ul className="mt-5 inline-block text-left text-sm space-y-1 text-slate-700">
                  {inviteResult.sent.map((s) => (
                    <li key={s.email} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                      <span className="font-mono text-xs">{s.email}</span>
                      {s.email_failed && <span className="text-[10px] text-amber-600">(email queue retrying)</span>}
                    </li>
                  ))}
                </ul>
              )}
              {inviteResult.skipped.length > 0 && (
                <p className="mt-4 text-xs text-amber-700">
                  Skipped {inviteResult.skipped.length}: {inviteResult.skipped.map((s) => `${s.email} (${s.reason})`).join(", ")}
                </p>
              )}
              <div className="mt-8">
                <Button onClick={() => navigate("/portal")} className="bg-indigo-700 hover:bg-indigo-800 text-white h-11 px-7" data-testid="welcome-step-3-portal">
                  Go to portal<ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
