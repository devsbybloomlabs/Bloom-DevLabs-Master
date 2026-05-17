import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useClientAuth } from "@/lib/clientAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PasswordInput from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, LogIn, ArrowLeft } from "lucide-react";
import { BRAND } from "@/lib/brand";

export default function ClientLogin() {
  const { login, token } = useClientAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Preserve query params (?tab=invoices, etc.) when bouncing back after login —
  // emails deep-link straight into a specific portal tab. Also honor ?next= query.
  const searchParams = new URLSearchParams(location.search);
  const nextParam = searchParams.get("next");
  const fromLoc = location.state?.from;
  const from = nextParam
    ? nextParam
    : fromLoc
      ? `${fromLoc.pathname}${fromLoc.search || ""}${fromLoc.hash || ""}`
      : "/portal";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Client Login — Bloom Labs";
    if (token) navigate(from, { replace: true });
  }, [token, navigate, from]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email.trim(), password);
      toast.success("Welcome back");
      navigate(from, { replace: true });
    } catch (err) {
      const detail = err?.response?.data?.detail || "Login failed";
      setError(detail);
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-[var(--warm-50)] px-4 py-12"
      data-testid="client-login-page"
    >
      <Link to="/" className="mb-8 inline-flex" data-testid="client-login-home-link">
        <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-9" />
      </Link>
      <Card className="w-full max-w-md border-border shadow-[var(--shadow-md)]">
        <CardHeader className="pb-3">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Client Portal
          </div>
          <CardTitle className="font-display text-2xl mt-1">
            Welcome back
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sign in to view your projects, invoices, and subscriptions.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" data-testid="client-login-form">
            <div>
              <Label htmlFor="email" className="text-sm">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
                data-testid="client-login-email-input"
                className="mt-1.5"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-[#1E3A8A] hover:underline"
                  data-testid="client-forgot-password-link"
                >
                  Forgot?
                </Link>
              </div>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                data-testid="client-login-password-input"
                className="mt-1.5"
              />
            </div>
            {error && (
              <div
                className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg"
                data-testid="client-login-error"
              >
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-11"
              disabled={loading}
              data-testid="client-login-submit-button"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4 mr-2" />
              )}
              Sign in
            </Button>
            <div className="pt-2 text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link
                to="/register"
                className="text-[#1E3A8A] font-medium hover:underline"
                data-testid="client-go-register-link"
              >
                Create an account
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
      <Link
        to="/"
        className="mt-6 text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
        data-testid="client-login-back-link"
      >
        <ArrowLeft className="h-3 w-3" />
        back to bybloomlabs.com
      </Link>
    </div>
  );
}
