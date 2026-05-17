import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { BRAND } from "@/lib/brand";

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const type = params.get("type") || "order";

  useEffect(() => {
    document.title = "Payment Successful — Bloom Labs";
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-[var(--warm-50)] px-4 py-12"
      data-testid="checkout-success-page"
    >
      <Link to="/" className="mb-8 inline-flex">
        <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-9" />
      </Link>
      <div className="max-w-lg w-full text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-6">
          <CheckCircle2 className="h-9 w-9 text-green-600" />
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
          You&apos;re in. 🚀
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {type === "subscription"
            ? "Your subscription is active. Check your email for setup instructions and a link to access the client portal."
            : "Payment received. Check your email for the link to set your password — then we'll walk you through a quick 2-minute setup so you can invite your team."}
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            asChild
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-11 px-6"
            data-testid="checkout-success-portal-button"
          >
            <Link to="/login?next=/portal/welcome">
              Sign in &amp; set up team
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-11 px-6"
            data-testid="checkout-success-home-button"
          >
            <Link to="/">Back to home</Link>
          </Button>
        </div>
        <p className="mt-10 text-xs text-muted-foreground">
          Need help? Email <a className="underline" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
        </p>
      </div>
    </div>
  );
}
