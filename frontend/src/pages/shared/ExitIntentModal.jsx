/**
 * ExitIntentModal — niche-aware. Pass `variant` to render the right copy
 * (gym / coach / realestate). Fires once per session when cursor leaves
 * viewport top, after a 6s arm timer. Disabled on touch devices.
 */
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Calendar } from "lucide-react";
import { BRAND } from "@/lib/brand";

const VARIANTS = {
  gym: {
    storageKey: "exit-intent-gym",
    bg: "from-slate-950 via-blue-950 to-emerald-950",
    eyebrow: "Wait — one more thing",
    title: "Before you go — book a 20-minute strategy call.",
    description:
      "No pressure, no pitch. We'll walk through your current member retention, find the biggest leak, and tell you (honestly) whether our system makes sense for your gym.",
    cta: "Grab a 20-minute slot",
  },
  coach: {
    storageKey: "exit-intent-coach",
    bg: "from-slate-950 via-teal-950 to-amber-900/60",
    eyebrow: "Wait — one more thing",
    title: "Before you go — book a 20-minute discovery call.",
    description:
      "No pressure, no pitch. We'll talk through your current booking flow, find the spots where leads are slipping through, and tell you honestly whether a 24-hour build makes sense for your coaching practice.",
    cta: "Grab a 20-minute slot",
  },
  realestate: {
    storageKey: "exit-intent-realestate",
    bg: "from-slate-950 via-indigo-950 to-amber-900/60",
    eyebrow: "Wait — one more thing",
    title: "Before you go — see your MLS-integrated site in action.",
    description:
      "Quick 20-minute walkthrough. We'll show you how your listings auto-sync, where leads get captured, and exactly what your site looks like 24 hours from now. Plus your ROI math, dialed in for your market.",
    cta: "Book my walkthrough",
  },
};

export default function ExitIntentModal({ variant = "gym" }) {
  const v = VARIANTS[variant] || VARIANTS.gym;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(v.storageKey) === "1") return;
    if (window.matchMedia("(hover: none)").matches) return;

    let armed = false;
    const armTimer = setTimeout(() => {
      armed = true;
    }, 6000);

    const onMouseOut = (e) => {
      if (!armed) return;
      if (e.clientY <= 0 && !e.relatedTarget) {
        setOpen(true);
        sessionStorage.setItem(v.storageKey, "1");
        document.removeEventListener("mouseout", onMouseOut);
      }
    };
    document.addEventListener("mouseout", onMouseOut);
    return () => {
      clearTimeout(armTimer);
      document.removeEventListener("mouseout", onMouseOut);
    };
  }, [v.storageKey]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-md p-0 overflow-hidden border-0"
        data-testid={`exit-intent-modal-${variant}`}
      >
        <div className={`bg-gradient-to-br ${v.bg} text-white p-7 md:p-9`}>
          <div className="inline-flex items-center gap-1.5 bg-orange-500/20 border border-orange-400/40 text-orange-300 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-4">
            {v.eyebrow}
          </div>
          <DialogTitle className="text-2xl font-display font-bold leading-tight">
            {v.title}
          </DialogTitle>
          <DialogDescription className="text-slate-300 mt-3 leading-relaxed">
            {v.description}
          </DialogDescription>
          <div className="mt-6 flex flex-col gap-2.5">
            <a
              href={BRAND.tidycal}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`exit-intent-cta-${variant}`}
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-3 rounded-md text-base shadow-lg shadow-orange-500/20 transition"
            >
              <Calendar className="h-4 w-4" />
              {v.cta}
            </a>
            <button
              type="button"
              onClick={() => setOpen(false)}
              data-testid={`exit-intent-dismiss-${variant}`}
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
