/**
 * AffiliateVerifyPage — handles the double-opt-in verification link
 * `/affiliate/verify?token=...`. Calls POST /api/affiliate/verify, then
 * redirects to the dashboard on success.
 */
import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { Header } from "@/components/sections/Header";
import { Footer } from "@/components/sections/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import SeoHead from "@/components/SeoHead";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AffiliateVerifyPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState({ status: "verifying", data: null, error: null });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", data: null, error: "Missing verification token" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.post(`${API}/affiliate/verify`, { token });
        if (!cancelled) {
          setState({ status: "success", data: r.data, error: null });
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            status: "error",
            data: null,
            error: e?.response?.data?.detail || "Verification failed",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="bg-background text-foreground" data-testid="affiliate-verify-page">
      <SeoHead
        title="Verify your Bloom affiliate account"
        description="Confirm your email to activate your Bloom Labs affiliate account and get your unique referral link."
        url="https://bybloomlabs.com/affiliate/verify"
      />
      <Header />
      <section className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        {state.status === "verifying" && (
          <Card className="border-slate-200" data-testid="affiliate-verify-loading">
            <CardContent className="p-10 text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-[#1E3A8A] mx-auto" />
              <h1 className="font-display text-2xl font-semibold">Verifying your account…</h1>
              <p className="text-sm text-slate-600">This takes a second.</p>
            </CardContent>
          </Card>
        )}
        {state.status === "success" && (
          <Card className="border-emerald-300 bg-emerald-50/30" data-testid="affiliate-verify-success">
            <CardContent className="p-10 text-center space-y-4">
              <CheckCircle2 className="h-14 w-14 text-emerald-700 mx-auto" />
              <h1 className="font-display text-3xl font-semibold">You're in!</h1>
              <p className="text-sm text-slate-700">
                Your referral link is ready. Share it anywhere and start tracking conversions in your dashboard.
              </p>
              <div className="bg-white border border-emerald-200 rounded-lg p-3 font-mono text-sm break-all text-slate-800" data-testid="affiliate-verify-url">
                {state.data?.referral_url}
              </div>
              <Link to="/affiliate/dashboard">
                <Button className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white" data-testid="affiliate-verify-go-dashboard">
                  Open my dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
        {state.status === "error" && (
          <Card className="border-rose-300 bg-rose-50/30" data-testid="affiliate-verify-error">
            <CardContent className="p-10 text-center space-y-4">
              <AlertCircle className="h-14 w-14 text-rose-700 mx-auto" />
              <h1 className="font-display text-2xl font-semibold">Verification failed</h1>
              <p className="text-sm text-slate-700">{state.error}</p>
              <Link to="/affiliate">
                <Button variant="outline" data-testid="affiliate-verify-retry">
                  Back to affiliate page
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </section>
      <Footer />
    </main>
  );
}
