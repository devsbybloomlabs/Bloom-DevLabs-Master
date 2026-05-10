import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, LogIn } from "lucide-react";
import { BRAND } from "@/lib/brand";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/admin/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // SEO: noindex admin login page
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow, noarchive, nosnippet";
    meta.setAttribute("data-admin-noindex", "true");
    document.head.appendChild(meta);
    const prevTitle = document.title;
    document.title = "Sign in — Bloom Labs Admin";
    return () => {
      document.head.removeChild(meta);
      document.title = prevTitle;
    };
  }, []);

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--warm-50)] px-4" data-testid="admin-login-page">
      <a href="/" className="mb-8 inline-flex" data-testid="login-home-link">
        <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-9" />
      </a>
      <Card className="w-full max-w-md border-border shadow-[var(--shadow-md)]">
        <CardHeader className="pb-3">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Admin
          </div>
          <CardTitle className="font-display text-2xl mt-1">
            Sign in to dashboard
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            For internal use only. Founder access required.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" data-testid="login-form">
            <div>
              <Label htmlFor="email" className="text-sm">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="founder@thesalvador.group"
                autoComplete="email"
                required
                data-testid="login-email-input"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-sm">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                data-testid="login-password-input"
                className="mt-1.5"
              />
            </div>
            {error && (
              <div
                className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg"
                data-testid="login-error"
              >
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-11"
              disabled={loading}
              data-testid="login-submit-button"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4 mr-2" />
              )}
              Sign in
            </Button>
            <p className="text-[11px] text-muted-foreground text-center pt-2">
              Use the seeded founder credentials provided to Ryan.
            </p>
          </form>
        </CardContent>
      </Card>
      <a
        href="/"
        className="mt-6 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        ← back to bybloomlabs.com
      </a>
    </div>
  );
}
