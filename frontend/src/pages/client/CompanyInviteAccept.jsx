/**
 * /join/:token — Public landing page for company-invite acceptance.
 *
 * Flow:
 *   1. Hits GET /api/company-invites/:token → fetches invite metadata
 *      (email, company name, inviter, role).
 *   2. Shows "Join {Company} on Bloom DevLabs" branded landing with a
 *      "Set your password and join" form.
 *   3. POST /api/company-invites/:token/accept → creates client user +
 *      registers as a viewer-role member.
 *   4. Redirects to /login.
 */
import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PasswordInput from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Users, ShieldCheck, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { BRAND } from "@/lib/brand";

const API = process.env.REACT_APP_BACKEND_URL;

export default function CompanyInviteAccept() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    document.title = "Join your team on Bloom DevLabs";
    (async () => {
      try {
        const { data } = await axios.get(`${API}/api/company-invites/${token}`);
        setInvite(data);
      } catch (err) {
        setError(err?.response?.data?.detail || "This invite is invalid or expired.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || password.length < 8) {
      toast.error("Add your name and at least an 8-character password.");
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/company-invites/${token}/accept`, {
        name: name.trim(),
        password,
      });
      setAccepted(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't accept invite. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-amber-50/30 flex items-center justify-center px-4 py-12"
      data-testid="invite-accept-page"
    >
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 mb-8 justify-self-center">
          <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-8" />
        </Link>

        {loading && <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">Loading invite…</div>}

        {!loading && error && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center" data-testid="invite-error">
            <div className="mx-auto h-14 w-14 rounded-full bg-rose-100 grid place-items-center mb-4">
              <AlertCircle className="h-7 w-7 text-rose-600" />
            </div>
            <h1 className="font-display text-xl font-semibold text-slate-900">Invite unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
            <Link to="/" className="mt-6 inline-block text-sm text-indigo-700 hover:text-indigo-900 font-medium">← Back to bybloomlabs.com</Link>
          </div>
        )}

        {!loading && !error && accepted && (
          <div className="bg-white rounded-2xl border border-emerald-200 p-8 text-center" data-testid="invite-success">
            <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 grid place-items-center mb-4">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <h1 className="font-display text-xl font-semibold text-slate-900">You're in!</h1>
            <p className="mt-2 text-sm text-slate-600">Redirecting to sign in…</p>
          </div>
        )}

        {!loading && !error && !accepted && invite && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8" data-testid="invite-accept-card">
            <div className="flex items-center gap-2 text-xs text-indigo-700 uppercase tracking-wider font-bold mb-2">
              <Users className="h-3.5 w-3.5" />Team invitation
            </div>
            <h1 className="font-display text-2xl font-semibold text-slate-900 leading-tight">
              Join <span className="text-indigo-700">{invite.company_name}</span> on Bloom DevLabs
            </h1>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              <strong className="text-slate-900">{invite.invited_by || "Your teammate"}</strong> invited{" "}
              <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{invite.email}</span>{" "}
              to collaborate on their projects.
            </p>
            <div className="mt-4 rounded-lg bg-indigo-50 border border-indigo-100 p-3 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-700 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-indigo-900 leading-relaxed">
                You'll start with <strong>view-only access</strong> — same screens, same data,
                read-only. An admin can promote you anytime.
              </p>
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <Label>Your name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" data-testid="invite-name" className="mt-1.5" />
              </div>
              <div>
                <Label>Choose a password</Label>
                <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" data-testid="invite-password" className="mt-1.5" />
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-indigo-700 hover:bg-indigo-800 text-white h-11" data-testid="invite-submit">
                {submitting ? "Joining…" : <>Join {invite.company_name}<ArrowRight className="h-4 w-4 ml-1.5" /></>}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
