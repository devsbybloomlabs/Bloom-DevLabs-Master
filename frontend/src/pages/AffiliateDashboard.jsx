/**
 * AffiliateDashboard — logged-in client (with active affiliate row)
 * sees their stats, referral link, share buttons, and referral pipeline.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { useClientAuth } from "@/lib/clientAuth";
import { Header } from "@/components/sections/Header";
import { Footer } from "@/components/sections/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import SeoHead from "@/components/SeoHead";
import {
  Copy,
  Linkedin,
  Mail,
  Sparkles,
  MousePointerClick,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  AlertCircle,
  Loader2,
  Trophy,
  Clock,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STAGE_META = {
  clicked: { label: "Clicked", color: "bg-slate-200 text-slate-800" },
  contacted: { label: "Contacted", color: "bg-blue-100 text-blue-800" },
  evaluating: { label: "Evaluating", color: "bg-amber-100 text-amber-800" },
  proposed: { label: "Proposed", color: "bg-violet-100 text-violet-800" },
  closed_won: { label: "Closed Won ✓", color: "bg-emerald-100 text-emerald-800" },
  closed_lost: { label: "Closed Lost", color: "bg-rose-100 text-rose-800" },
};

function StatCard({ label, value, sub, icon: Icon, tone = "default", testid }) {
  const tones = {
    default: "bg-white border-slate-200",
    success: "bg-emerald-50 border-emerald-200",
    primary: "bg-[#1E3A8A]/5 border-[#1E3A8A]/20",
  };
  return (
    <Card className={`border ${tones[tone] || tones.default}`} data-testid={testid}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500 font-medium">{label}</p>
            <p className="font-display text-3xl font-semibold tabular-nums mt-1">{value}</p>
            {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
          </div>
          {Icon && <Icon className="h-5 w-5 text-slate-400" />}
        </div>
      </CardContent>
    </Card>
  );
}

function ReferralRow({ referral }) {
  const meta = STAGE_META[referral.stage] || STAGE_META.clicked;
  const closedWon = referral.stage === "closed_won";
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50" data-testid={`affiliate-referral-row-${referral.id}`}>
      <td className="px-3 py-3 text-sm font-medium">{referral.referred_company_name || "—"}</td>
      <td className="px-3 py-3 text-sm text-slate-700">{referral.referred_contact_name || "—"}</td>
      <td className="px-3 py-3 text-xs text-slate-500 tabular-nums">
        {referral.created_at ? new Date(referral.created_at).toLocaleDateString() : "—"}
      </td>
      <td className="px-3 py-3">
        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${meta.color}`} data-testid={`affiliate-stage-${referral.stage}-${referral.id}`}>
          {meta.label}
        </span>
      </td>
      <td className="px-3 py-3 text-sm text-right tabular-nums text-slate-700">
        {closedWon && referral.deal_value_usd ? `$${Number(referral.deal_value_usd).toLocaleString()}` : "—"}
      </td>
    </tr>
  );
}

export default function AffiliateDashboard() {
  const { client, token, loading: authLoading } = useClientAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const status = await axios.get(`${API}/affiliate/me/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!status.data?.enrolled) {
        setError("not_enrolled");
        setLoading(false);
        return;
      }
      if (status.data?.status !== "active") {
        setError("pending_verification");
        setLoading(false);
        return;
      }
      const [dash, refs] = await Promise.all([
        axios.get(`${API}/affiliate/me/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API}/affiliate/me/referrals`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setData(dash.data);
      setReferrals(refs.data || []);
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!authLoading && !token) {
      navigate("/login?next=/affiliate/dashboard");
      return;
    }
    load();
  }, [authLoading, token, navigate, load]);

  const copyLink = () => {
    if (!data?.referral_url) return;
    navigator.clipboard.writeText(data.referral_url).then(
      () => toast.success("Referral link copied!"),
      () => toast.error("Couldn't copy — please copy manually")
    );
  };

  const shareLinkedIn = () => {
    if (!data?.referral_url) return;
    const text = encodeURIComponent(
      "I've been using @BloomLabs to build custom apps in 2-4 weeks. Highly recommend if you need fast, affordable custom software."
    );
    const url = encodeURIComponent(data.referral_url);
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${url}&summary=${text}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const shareEmail = () => {
    if (!data?.referral_url) return;
    const subject = encodeURIComponent("This might solve your custom software headaches");
    const body = encodeURIComponent(
      `Hi,\n\nI recently worked with Bloom Labs to build a custom app — delivered in 2-4 weeks at a fraction of agency pricing. If you're dealing with a workflow that needs custom software, check them out:\n\n${data.referral_url}\n\nHappy to talk about my experience.`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  if (authLoading || (loading && !error)) {
    return (
      <main className="bg-background min-h-screen" data-testid="affiliate-dashboard-loading">
        <Header />
        <div className="max-w-[1120px] mx-auto p-8">
          <Skeleton className="h-32 w-full mb-4" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Footer />
      </main>
    );
  }

  if (error === "not_enrolled") {
    return (
      <main className="bg-background min-h-screen" data-testid="affiliate-dashboard-not-enrolled">
        <Header />
        <section className="max-w-xl mx-auto px-4 py-20 text-center">
          <AlertCircle className="h-12 w-12 text-amber-600 mx-auto mb-3" />
          <h1 className="font-display text-2xl font-semibold">You're not enrolled yet</h1>
          <p className="text-sm text-slate-600 mt-2">Sign up for the affiliate program to access your dashboard.</p>
          <Link to="/affiliate" className="inline-block mt-6">
            <Button className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white" data-testid="affiliate-enroll-cta">
              Join the program
            </Button>
          </Link>
        </section>
        <Footer />
      </main>
    );
  }

  if (error === "pending_verification") {
    return (
      <main className="bg-background min-h-screen" data-testid="affiliate-dashboard-pending">
        <Header />
        <section className="max-w-xl mx-auto px-4 py-20 text-center">
          <Mail className="h-12 w-12 text-[#1E3A8A] mx-auto mb-3" />
          <h1 className="font-display text-2xl font-semibold">Check your email</h1>
          <p className="text-sm text-slate-600 mt-2">
            We sent a verification link to <strong>{client?.email}</strong>. Click it to activate your account.
          </p>
        </section>
        <Footer />
      </main>
    );
  }

  if (error) {
    return (
      <main className="bg-background min-h-screen">
        <Header />
        <div className="max-w-xl mx-auto p-8 text-center">
          <p className="text-sm text-rose-700">{error}</p>
          <Button onClick={load} variant="outline" className="mt-4" data-testid="affiliate-dashboard-retry">
            Retry
          </Button>
        </div>
        <Footer />
      </main>
    );
  }

  const stats = data?.stats || {};
  const aff = data?.affiliate || {};
  const tierPct = stats.tier_pct || 0;
  const nextAt = stats.next_tier_at;

  return (
    <main className="bg-background min-h-screen" data-testid="affiliate-dashboard">
      <SeoHead
        title="Affiliate Dashboard · Bloom Labs"
        description="Track your referrals, monitor conversions, and unlock tiered discounts."
        url="https://bybloomlabs.com/affiliate/dashboard"
      />
      <Header />
      <section className="max-w-[1120px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Affiliate Dashboard</p>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-1">
              Welcome, {aff.full_name?.split(" ")[0] || "there"}!
            </h1>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge className="bg-emerald-100 text-emerald-800 border-0" data-testid="affiliate-status-badge">
                Active
              </Badge>
              <Badge className="bg-[#1E3A8A]/10 text-[#1E3A8A] border-0" data-testid="affiliate-tier-badge">
                <Trophy className="h-3 w-3 mr-1" />
                {tierPct > 0 ? `${tierPct}% discount tier` : "No tier yet"}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Member since {aff.created_at ? new Date(aff.created_at).toLocaleDateString() : "—"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Total clicks"
            value={stats.total_clicks ?? 0}
            sub="People who clicked your link"
            icon={MousePointerClick}
            testid="affiliate-stat-clicks"
          />
          <StatCard
            label="Pending"
            value={stats.pending_referrals ?? 0}
            sub="Evaluating or in progress"
            icon={Clock}
            testid="affiliate-stat-pending"
          />
          <StatCard
            label="Closed won"
            value={stats.closed_won_count ?? 0}
            sub={nextAt ? `${nextAt - (stats.closed_won_count ?? 0)} more for next tier` : "Top tier unlocked!"}
            icon={CheckCircle2}
            tone="success"
            testid="affiliate-stat-closed"
          />
          <StatCard
            label="Your discount"
            value={`${tierPct}%`}
            sub="Applied to future add-ons"
            icon={Sparkles}
            tone="primary"
            testid="affiliate-stat-tier"
          />
        </div>

        {/* Referral link */}
        <Card className="border-[#1E3A8A]/30 bg-gradient-to-br from-[#1E3A8A]/5 to-[#3B82F6]/5 mb-6" data-testid="affiliate-link-card">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-[#1E3A8A] font-semibold">Your unique referral link</p>
                <p className="text-sm text-slate-600 mt-0.5">Share this link anywhere — every click is tracked.</p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-2 mb-3">
              <code className="flex-1 text-sm text-slate-800 break-all" data-testid="affiliate-referral-url">
                {data?.referral_url}
              </code>
              <Button
                onClick={copyLink}
                size="sm"
                className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white shrink-0"
                data-testid="affiliate-copy-link"
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={shareLinkedIn} data-testid="affiliate-share-linkedin">
                <Linkedin className="h-3.5 w-3.5 mr-1.5" />
                Share on LinkedIn
              </Button>
              <Button variant="outline" size="sm" onClick={shareEmail} data-testid="affiliate-share-email">
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                Share by email
              </Button>
              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(data?.referral_url || "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
                data-testid="affiliate-qr-link"
              >
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  QR code
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Referrals table */}
        <Card className="border-slate-200" data-testid="affiliate-referrals-card">
          <CardContent className="p-0">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-semibold">Referral activity</h2>
              <p className="text-xs text-slate-500 mt-0.5">All referrals attributed to your link in the last 90 days.</p>
            </div>
            {referrals.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500" data-testid="affiliate-referrals-empty">
                No referrals yet — share your link to start tracking.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm" data-testid="affiliate-referrals-table">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2.5">Company</th>
                      <th className="px-3 py-2.5">Contact</th>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Stage</th>
                      <th className="px-3 py-2.5 text-right">Deal value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((r) => <ReferralRow key={r.id} referral={r} />)}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resource center */}
        <Card className="border-slate-200 mt-6" data-testid="affiliate-resources">
          <CardContent className="p-5 sm:p-6 space-y-3">
            <h2 className="font-display text-lg font-semibold">Share templates</h2>
            <p className="text-xs text-slate-500">Copy-paste ready scripts.</p>
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="affiliate-template-email">
              <summary className="cursor-pointer text-sm font-medium">Email intro template</summary>
              <pre className="mt-3 text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{`Subject: This might solve your custom software headaches

Hi [Recipient],

I recently worked with Bloom Labs to build a custom app — delivered in 2-4 weeks at a fraction of what traditional agencies charge.

If you're tired of waiting months for custom software, check them out:
${data?.referral_url || "[your referral link]"}

Happy to answer questions about our experience.

[Your name]`}</pre>
            </details>
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="affiliate-template-linkedin">
              <summary className="cursor-pointer text-sm font-medium">LinkedIn post template</summary>
              <pre className="mt-3 text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{`Just used Bloom Labs to build a custom app for our team. Shipped in 2-4 weeks at fixed pricing. Highly recommend if you need fast, affordable custom software for your business.

${data?.referral_url || "[your referral link]"}`}</pre>
            </details>
          </CardContent>
        </Card>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <Link to="/portal" className="hover:text-[#1E3A8A] inline-flex items-center gap-1" data-testid="affiliate-back-portal">
            <ChevronRight className="h-3 w-3 rotate-180" />
            Back to client portal
          </Link>
        </div>
      </section>
      <Footer />
    </main>
  );
}
