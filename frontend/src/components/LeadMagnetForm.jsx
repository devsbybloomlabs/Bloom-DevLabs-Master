/**
 * LeadMagnetForm — embeddable opt-in card.
 *
 * Auto-fetches the named magnet via /api/leads/magnet/{slug}. If slug omitted,
 * fetches the first active magnet via /api/leads/active.
 *
 * On submit, calls POST /api/leads/subscribe and shows a success state with
 * the asset URL (if any).
 */
import { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Sparkles, CheckCircle2, ArrowRight, Loader2, ExternalLink } from "lucide-react";
import { trackEvent } from "@/components/Analytics";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function LeadMagnetForm({ slug, sourceUrl, className = "" }) {
  const [magnet, setMagnet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchMagnet = async () => {
      try {
        if (slug) {
          const r = await axios.get(`${API}/leads/magnet/${slug}`);
          if (!cancelled) setMagnet(r.data);
        } else {
          const r = await axios.get(`${API}/leads/active`);
          if (!cancelled) setMagnet((r.data || [])[0] || null);
        }
      } catch {
        if (!cancelled) setMagnet(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchMagnet();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className={`rounded-2xl border border-border bg-card p-6 ${className}`} data-testid="lead-magnet-loading">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      </div>
    );
  }
  if (!magnet) return null;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    setSubmitting(true);
    try {
      const r = await axios.post(`${API}/leads/subscribe`, {
        email: email.trim(),
        name: name.trim() || null,
        magnet_slug: magnet.slug,
        source_url: sourceUrl || (typeof window !== "undefined" ? window.location.href : null),
      });
      setDone({ asset_url: r.data.asset_url || magnet.asset_url });
      trackEvent("lead_subscribe", {
        magnet_slug: magnet.slug,
        magnet_title: magnet.title,
        source_url: sourceUrl,
      });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Subscription failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div
        className={`rounded-2xl border border-[#1E3A8A]/30 bg-gradient-to-br from-[#1E3A8A]/5 to-[#3B82F6]/5 p-6 sm:p-8 ${className}`}
        data-testid="lead-magnet-success"
      >
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold">
              You&apos;re on the list.
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your email for the playbook (and a short note from us).
            </p>
            {done.asset_url && (
              <Button
                asChild
                className="mt-4 bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                data-testid="lead-magnet-download-button"
              >
                <a href={done.asset_url} target="_blank" rel="noopener noreferrer">
                  Get instant access <ExternalLink className="h-4 w-4 ml-2" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className={`rounded-2xl border border-[#1E3A8A]/20 bg-gradient-to-br from-[#1E3A8A]/5 via-background to-[#3B82F6]/5 p-6 sm:p-8 ${className}`}
      data-testid="lead-magnet-form"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-[#1E3A8A] text-white flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-lg sm:text-xl font-semibold">
            {magnet.title}
          </h3>
          {magnet.description && (
            <p className="mt-1 text-sm text-muted-foreground">{magnet.description}</p>
          )}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="First name (optional)"
          data-testid="lead-magnet-name-input"
        />
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
          autoComplete="email"
          data-testid="lead-magnet-email-input"
        />
      </div>
      <Button
        type="submit"
        disabled={submitting}
        className="mt-3 w-full sm:w-auto bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-11 px-6"
        data-testid="lead-magnet-submit-button"
      >
        {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        {magnet.cta_text || "Get the playbook"}
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
      <p className="mt-3 text-[11px] text-muted-foreground">
        No spam, ever. Unsubscribe with one click.
      </p>
    </form>
  );
}
