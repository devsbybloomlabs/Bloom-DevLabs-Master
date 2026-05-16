/**
 * ExitIntentModal — fires once per session when the cursor leaves the
 * viewport toward the top edge (classic exit-intent heuristic). One
 * Calendly CTA, dismissible. Disabled on touch devices (no mouse-out).
 */
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Calendar, X } from "lucide-react";
import { BRAND } from "@/lib/brand";

const STORAGE_KEY = "gym-exit-intent-shown";

export default function ExitIntentModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return;
    if (window.matchMedia("(hover: none)").matches) return; // touch devices

    let armed = false;
    // Arm after 6 seconds so it doesn't fire on accidental top-jump right
    // after page load.
    const armTimer = setTimeout(() => {
      armed = true;
    }, 6000);

    const onMouseOut = (e) => {
      if (!armed) return;
      // Trigger only when cursor exits the top of the viewport.
      if (e.clientY <= 0 && !e.relatedTarget) {
        setOpen(true);
        sessionStorage.setItem(STORAGE_KEY, "1");
        document.removeEventListener("mouseout", onMouseOut);
      }
    };
    document.addEventListener("mouseout", onMouseOut);
    return () => {
      clearTimeout(armTimer);
      document.removeEventListener("mouseout", onMouseOut);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-md p-0 overflow-hidden border-0"
        data-testid="gym-exit-intent-modal"
      >
        <div className="bg-gradient-to-br from-slate-950 via-blue-950 to-emerald-950 text-white p-7 md:p-9">
          <div className="inline-flex items-center gap-1.5 bg-orange-500/20 border border-orange-400/40 text-orange-300 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-4">
            Wait — one more thing
          </div>
          <DialogTitle className="text-2xl font-display font-bold leading-tight">
            Before you go — book a 20-minute strategy call.
          </DialogTitle>
          <DialogDescription className="text-slate-300 mt-3 leading-relaxed">
            No pressure, no pitch. We'll walk through your current member
            retention, find the biggest leak, and tell you (honestly) whether
            our system makes sense for your gym.
          </DialogDescription>
          <div className="mt-6 flex flex-col gap-2.5">
            <a
              href={BRAND.tidycal}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="gym-exit-intent-cta"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-3 rounded-md text-base shadow-lg shadow-orange-500/20 transition"
            >
              <Calendar className="h-4 w-4" />
              Grab a 20-minute slot
            </a>
            <button
              type="button"
              onClick={() => setOpen(false)}
              data-testid="gym-exit-intent-dismiss"
              className="text-slate-400 hover:text-white text-xs font-medium py-1"
            >
              No thanks, I'll think about it
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
