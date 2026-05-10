import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useClientAuth } from "@/lib/clientAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, UserPlus, ArrowLeft } from "lucide-react";
import { BRAND } from "@/lib/brand";

export default function ClientRegister() {
  const { register, token } = useClientAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", name: "", company: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Create Account — Bloom Labs";
    if (token) navigate("/portal", { replace: true });
  }, [token, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await register({
        email: form.email.trim(),
        name: form.name.trim(),
        company: form.company.trim() || undefined,
        password: form.password,
      });
      toast.success("Account created — welcome!");
      navigate("/portal", { replace: true });
    } catch (err) {
      const detail = err?.response?.data?.detail || "Registration failed";
      setError(typeof detail === "string" ? detail : "Please check the form");
      toast.error(typeof detail === "string" ? detail : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-[var(--warm-50)] px-4 py-12"
      data-testid="client-register-page"
    >
      <Link to="/" className="mb-8 inline-flex">
        <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-9" />
      </Link>
      <Card className="w-full max-w-md border-border shadow-[var(--shadow-md)]">
        <CardHeader className="pb-3">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Client Portal
          </div>
          <CardTitle className="font-display text-2xl mt-1">Create your account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Track your projects, view invoices, and manage subscriptions in one place.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" data-testid="client-register-form">
            <div>
              <Label htmlFor="name" className="text-sm">Full name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={set("name")}
                placeholder="Jane Doe"
                required
                data-testid="client-register-name-input"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="email" className="text-sm">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="you@company.com"
                autoComplete="email"
                required
                data-testid="client-register-email-input"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="company" className="text-sm">
                Company <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="company"
                value={form.company}
                onChange={set("company")}
                placeholder="Acme Inc."
                data-testid="client-register-company-input"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-sm">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={set("password")}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                minLength={8}
                data-testid="client-register-password-input"
                className="mt-1.5"
              />
            </div>
            {error && (
              <div
                className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg"
                data-testid="client-register-error"
              >
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-11"
              disabled={loading}
              data-testid="client-register-submit-button"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Create account
            </Button>
            <div className="pt-2 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                to="/login"
                className="text-[#1E3A8A] font-medium hover:underline"
                data-testid="client-go-login-link"
              >
                Sign in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
      <Link
        to="/"
        className="mt-6 text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
      >
        <ArrowLeft className="h-3 w-3" />
        back to bybloomlabs.com
      </Link>
    </div>
  );
}
