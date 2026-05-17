import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PasswordInput from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, KeyRound, CheckCircle2 } from "lucide-react";
import { BRAND } from "@/lib/brand";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SetPassword({ mode = "set" }) {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = mode === "reset" ? "Reset Password — Bloom Labs" : "Set Password — Bloom Labs";
  }, [mode]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await axios.post(`${API}/clients/reset-password`, { token, password });
      setDone(true);
      toast.success("Password set — you can sign in now.");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      const detail = err?.response?.data?.detail || "Could not set password";
      setError(detail);
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--warm-50)] px-4">
        <Card className="w-full max-w-md border-border">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Missing or invalid token. Please use the link from your email.
            </p>
            <Link to="/login" className="text-sm text-[#1E3A8A] hover:underline mt-4 inline-block">
              Go to login
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-[var(--warm-50)] px-4 py-12"
      data-testid="set-password-page"
    >
      <Link to="/" className="mb-8 inline-flex">
        <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-9" />
      </Link>
      <Card className="w-full max-w-md border-border shadow-[var(--shadow-md)]">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-2xl mt-1">
            {mode === "reset" ? "Reset your password" : "Set your password"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose a strong password (at least 8 characters).
          </p>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="flex items-center gap-3 rounded-lg border border-green-100 bg-green-50 px-3 py-3 text-sm text-green-800">
              <CheckCircle2 className="h-5 w-5" />
              Password set. Redirecting to login…
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" data-testid="set-password-form">
              <div>
                <Label htmlFor="password" className="text-sm">New password</Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  data-testid="set-password-input"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="confirm" className="text-sm">Confirm password</Label>
                <PasswordInput
                  id="confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  data-testid="set-password-confirm-input"
                  className="mt-1.5"
                />
              </div>
              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                className="w-full bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-11"
                disabled={loading}
                data-testid="set-password-submit-button"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4 mr-2" />
                )}
                {mode === "reset" ? "Reset password" : "Set password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
