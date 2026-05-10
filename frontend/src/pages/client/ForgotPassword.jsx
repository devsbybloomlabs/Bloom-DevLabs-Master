import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Send, ArrowLeft } from "lucide-react";
import { BRAND } from "@/lib/brand";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.title = "Forgot Password — Bloom Labs";
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API}/clients/forgot-password`, { email: email.trim() });
      setSent(true);
      toast.success("If that email exists, a reset link is on its way.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-[var(--warm-50)] px-4 py-12"
      data-testid="forgot-password-page"
    >
      <Link to="/" className="mb-8 inline-flex">
        <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-9" />
      </Link>
      <Card className="w-full max-w-md border-border shadow-[var(--shadow-md)]">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-2xl">Forgot your password?</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-3 text-sm text-green-800">
              Check your inbox — if an account exists, the reset link is on its way.
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" data-testid="forgot-password-form">
              <div>
                <Label htmlFor="email" className="text-sm">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  data-testid="forgot-password-email-input"
                  className="mt-1.5"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-11"
                disabled={loading}
                data-testid="forgot-password-submit-button"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send reset link
              </Button>
              <div className="pt-2 text-center">
                <Link to="/login" className="text-sm text-[#1E3A8A] hover:underline inline-flex items-center gap-1.5">
                  <ArrowLeft className="h-3 w-3" /> Back to sign in
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
