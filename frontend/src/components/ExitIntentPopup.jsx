/**
 * ExitIntentPopup — dismissible modal that fires once per session when the
 * user moves the cursor toward the top edge of the viewport (signaling intent
 * to close the tab or switch context).
 *
 * Disabled on:
 *   • Mobile / touch (no reliable mouseleave signal)
 *   • /admin/* routes (admin doesn't need the funnel popup)
 *   • /get-audit (they're already in the funnel)
 *   • Visitors who already dismissed it this session
 */
import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { X, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "bloom_exit_intent_dismissed";

export default function ExitIntentPopup() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Skip on excluded routes
    if (
      location.pathname.startsWith("/admin") ||
      location.pathname.startsWith("/portal") ||
      location.pathname.startsWith("/login") ||
      location.pathname === "/get-audit" ||
      location.pathname === "/win"
    ) {
      return;
    }
    // Skip if already dismissed this session
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return;
    // Skip on touch devices (no mouseleave)
    if ("ontouchstart" in window) return;

    let triggered = false;
    const onMouseLeave = (e) => {
      if (triggered) return;
      if (e.clientY <= 5) {
        triggered = true;
        setOpen(true);
      }
    };
    // Arm after 8s so we don't pop in the user's face on landing
    const armId = setTimeout(() => {
      document.documentElement.addEventListener("mouseleave", onMouseLeave);
    }, 8000);
    return () => {
      clearTimeout(armId);
      document.documentElement.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [location.pathname]);

  const dismiss = () => {
    setOpen(false);
    sessionStorage.setItem(STORAGE_KEY, "1");
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      data-testid="exit-intent-popup"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative bg-card rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
          data-testid="exit-intent-dismiss"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-amber-100 flex items-center justify-center mb-4">
            <Sparkles className="h-7 w-7 text-amber-600" />
          </div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Before you leave…</p>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-2">
            Free 15-minute audit
          </h2>
          <p className="text-sm text-muted-foreground mt-3 max-w-sm mx-auto">
            See exactly what custom app we&rsquo;d build for your business — with timeline
            and pricing — in less than 5 minutes of your time.
          </p>
          <Link to="/get-audit?src=exit-intent-popup" onClick={dismiss} className="block mt-5">
            <Button
              className="w-full bg-amber-500 hover:bg-amber-600 text-white h-11 text-base shadow-[0_8px_24px_-8px_rgba(245,158,11,0.5)]"
              data-testid="exit-intent-cta-button"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Get Started — Free
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
          <button
            onClick={dismiss}
            className="text-xs text-muted-foreground hover:text-foreground mt-3 underline underline-offset-4"
            data-testid="exit-intent-no-thanks"
          >
            No thanks, I&rsquo;ll keep browsing
          </button>
        </div>
      </div>
    </div>
  );
}
