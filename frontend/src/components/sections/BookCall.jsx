import { Calendar, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { BRAND } from "@/lib/brand";

const BULLETS = [
  {
    icon: Clock,
    text: "45 minutes — focused, no slide decks.",
  },
  {
    icon: ShieldCheck,
    text: "No hard sell. We tell you if we’re a fit (and if we’re not).",
  },
  {
    icon: Sparkles,
    text: "Walk away with a custom proposal within 24 hours.",
  },
];

export const BookCall = () => {
  return (
    <section
      id="book"
      data-testid="book-call-section"
      className="scroll-mt-24 bg-[var(--warm-50)] border-y border-border"
    >
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-12 items-start">
          <div className="lg:col-span-5">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Book a call
            </div>
            <h2 className="font-display mt-3 text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
              Let&rsquo;s map your workflow in 45 minutes.
            </h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Pick a time that works. We&rsquo;ll talk through your goals,
              show you similar builds, and tell you exactly what your
              project would cost and how long it would take.
            </p>

            <ul className="mt-7 space-y-4">
              {BULLETS.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 h-9 w-9 rounded-xl bg-[#1E3A8A] text-white flex items-center justify-center flex-shrink-0">
                    <b.icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm text-foreground/90 leading-relaxed pt-1.5">
                    {b.text}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-7 rounded-[var(--radius)] border border-border bg-card p-4 flex items-center gap-3">
              <Calendar className="h-5 w-5 text-[#3B82F6] flex-shrink-0" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                Availability: <span className="text-foreground font-medium">Mon–Fri</span>, 10am–1pm &amp; 2pm–4pm (your timezone). 45-minute slots.
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-[var(--radius)] border border-border bg-white p-2 sm:p-3 shadow-[var(--shadow-md)]">
              <iframe
                src={BRAND.tidycal}
                title="Book a Discovery Call with Bloom Labs"
                data-testid="tidycal-embed-iframe"
                className="w-full rounded-[10px] bg-white"
                style={{ minHeight: "720px", border: "0" }}
                loading="lazy"
                allow="payment"
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground text-center">
              Powered by TidyCal &middot; Your data is secure. We never share your info.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
