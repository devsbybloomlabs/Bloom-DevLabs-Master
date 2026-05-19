/**
 * AuditCta — drop-in CTA block linking to /get-audit with source attribution.
 *
 * Usage:
 *   <AuditCta source="below-who-we-serve" label="Not seeing your industry? Get my audit." />
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";

export default function AuditCta({
  source = "inline",
  label = "Get my New Workflow",
  sub = "See what custom app we'd build for you in 2 weeks",
  variant = "card", // "card" | "inline-text"
  testid,
}) {
  const href = `/get-audit?src=${encodeURIComponent(source)}`;

  if (variant === "inline-text") {
    return (
      <div className="text-center my-10" data-testid={testid || `audit-cta-${source}`}>
        <p className="text-sm sm:text-base text-foreground/80 mb-3">{sub}</p>
        <Link to={href}>
          <Button
            className="bg-amber-500 hover:bg-amber-600 text-white shadow-[0_8px_24px_-8px_rgba(245,158,11,0.5)] hover:shadow-[0_12px_28px_-8px_rgba(245,158,11,0.6)] transition-shadow"
            data-testid={`audit-cta-button-${source}`}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {label}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50/50 p-6 sm:p-8 my-10 text-center"
      data-testid={testid || `audit-cta-${source}`}
    >
      <p className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
        {label}
      </p>
      <p className="text-sm sm:text-base text-foreground/70 mt-2 max-w-xl mx-auto">{sub}</p>
      <Link to={href} className="inline-block mt-5">
        <Button
          className="bg-amber-500 hover:bg-amber-600 text-white h-11 px-6 text-base shadow-[0_8px_24px_-8px_rgba(245,158,11,0.5)] hover:shadow-[0_12px_28px_-8px_rgba(245,158,11,0.6)] transition-shadow"
          data-testid={`audit-cta-button-${source}`}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Get my New Workflow
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </Link>
      <p className="text-xs text-foreground/50 mt-3">Free · 24h turnaround · 3–5 custom-app recommendations</p>
    </div>
  );
}
