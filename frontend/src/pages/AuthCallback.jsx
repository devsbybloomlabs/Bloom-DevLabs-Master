/**
 * Generic OAuth callback handler.
 *
 * Looks at ?provider=... or ?state=... (state is "<provider>:<token>") to
 * decide which backend exchange endpoint to call. For Nifty we use POST
 * /api/admin/integrations/nifty/exchange.
 *
 * Requires admin auth — if no admin token, prompts to log in first.
 */
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth, authClient } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { BRAND } from "@/lib/brand";

export default function AuthCallback() {
  const [params] = useSearchParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const code = params.get("code");
  const state = params.get("state") || "";
  const error = params.get("error");
  const errorDescription = params.get("error_description");
  // Heuristic: only Nifty registered for now. Could expand via ?provider=.
  const provider = params.get("provider") || "nifty";

  const [status, setStatus] = useState("loading"); // loading | success | error | needs-login
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState(null);

  useEffect(() => {
    document.title = "Connecting integration… — Bloom Labs";

    if (error) {
      setStatus("error");
      setMessage(errorDescription || error);
      return;
    }
    if (!code) {
      setStatus("error");
      setMessage("Missing authorization code. Try connecting again from /admin/integrations.");
      return;
    }
    if (!token) {
      setStatus("needs-login");
      return;
    }

    const exchange = async () => {
      try {
        const api = authClient(token);
        if (provider === "nifty") {
          const r = await api.post("/admin/integrations/nifty/exchange", {
            code,
            state,
          });
          setDetails(r.data);
          setStatus("success");
          setMessage("Nifty PM is now connected.");
        } else {
          setStatus("error");
          setMessage(`Unknown provider: ${provider}`);
        }
      } catch (e) {
        setStatus("error");
        setMessage(e?.response?.data?.detail || e.message || "Exchange failed");
      }
    };
    exchange();
  }, [code, state, token, provider, error, errorDescription]);

  const goAdmin = () => navigate("/admin/integrations");

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-[var(--warm-50)] px-4 py-12"
      data-testid="auth-callback-page"
    >
      <Link to="/" className="mb-8 inline-flex">
        <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-9" />
      </Link>
      <Card className="w-full max-w-md border-border shadow-[var(--shadow-md)]">
        <CardHeader>
          <CardTitle className="font-display text-2xl flex items-center gap-2">
            {status === "loading" && <Loader2 className="h-5 w-5 animate-spin text-[#1E3A8A]" />}
            {status === "success" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
            {(status === "error" || status === "needs-login") && (
              <AlertCircle className="h-5 w-5 text-amber-600" />
            )}
            {status === "loading" && "Connecting…"}
            {status === "success" && "Connected ✓"}
            {status === "error" && "Connection failed"}
            {status === "needs-login" && "Admin login required"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && (
            <p className="text-sm text-muted-foreground">
              Exchanging authorization code with {provider}…
            </p>
          )}
          {status === "success" && (
            <>
              <p className="text-sm text-muted-foreground" data-testid="auth-callback-success">
                {message}
                {details?.projects_count != null && (
                  <> Found <strong>{details.projects_count}</strong> projects.</>
                )}
              </p>
              <Button
                onClick={goAdmin}
                className="w-full bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                data-testid="auth-callback-continue"
              >
                Continue to integrations
                <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}
          {status === "error" && (
            <>
              <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg" data-testid="auth-callback-error">
                {message}
              </p>
              <Button variant="outline" onClick={goAdmin} className="w-full">
                Back to integrations
              </Button>
            </>
          )}
          {status === "needs-login" && (
            <>
              <p className="text-sm text-muted-foreground">
                You need to be signed in as an admin to complete this. Sign in
                and then re-open this page (the URL has your authorization code).
              </p>
              <Button
                onClick={() => navigate("/admin/login")}
                className="w-full bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
              >
                Go to admin login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
