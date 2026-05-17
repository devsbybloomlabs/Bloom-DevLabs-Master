/**
 * BloomVsAgencies — explicit head-to-head comparison table.
 *
 * SEO note: positions Bloom Labs against the "traditional agency"
 * search-intent cluster ("custom software cheaper", "web development
 * timeline", "why web development takes 6 months"). Keyword-rich H2
 * + side-by-side dollar/timeline framing for skimmability.
 */
import { CheckCircle2, XCircle, Sparkles, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

const ROWS = [
  {
    metric: "Timeline",
    bloom: "2–4 weeks end-to-end",
    agency: "4–6 months (average)",
    bloomGood: true,
  },
  {
    metric: "Cost",
    bloom: "$5,995 – $14,995 fixed",
    agency: "$30,000+ before scope creep",
    bloomGood: true,
  },
  {
    metric: "Communication",
    bloom: "Direct Slack with the builders",
    agency: "Account-manager bottleneck",
    bloomGood: true,
  },
  {
    metric: "Process",
    bloom: "Weekly demos · transparent",
    agency: "Black-box delivery",
    bloomGood: true,
  },
  {
    metric: "Tech Stack",
    bloom: "AI-native scaffolding (60–80% faster)",
    agency: "Hand-rolled boilerplate",
    bloomGood: true,
  },
  {
    metric: "Scope Changes",
    bloom: "Locked in writing, no surprise fees",
    agency: "Change-order treadmill",
    bloomGood: true,
  },
  {
    metric: "Code Ownership",
    bloom: "100% yours · no lock-in",
    agency: "Often retained by agency",
    bloomGood: true,
  },
];

export function BloomVsAgencies() {
  return (
    <section
      id="bloom-vs-agencies"
      className="py-16 md:py-24 bg-gradient-to-b from-slate-50 via-white to-slate-50"
      data-testid="bloom-vs-agencies-section"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            Bloom Labs vs Traditional Agencies
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground leading-tight">
            Why Bloom Labs is 40% cheaper — and 6× faster.
          </h2>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            Side-by-side: how AI-native custom web app development at Bloom
            compares with the standard agency engagement model.
          </p>
        </div>

        {/* Desktop table */}
        <div
          className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm"
          data-testid="bloom-vs-agencies-table"
        >
          <div className="grid grid-cols-12 bg-slate-900 text-white text-xs uppercase tracking-wider font-semibold">
            <div className="col-span-4 py-4 px-6">Metric</div>
            <div className="col-span-4 py-4 px-6 bg-emerald-600">Bloom Labs</div>
            <div className="col-span-4 py-4 px-6">Traditional Agency</div>
          </div>
          {ROWS.map((r, i) => (
            <div
              key={r.metric}
              className={`grid grid-cols-12 text-sm border-t border-slate-200 ${
                i % 2 === 0 ? "bg-white" : "bg-slate-50/60"
              }`}
              data-testid={`bloom-vs-row-${r.metric.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="col-span-4 py-4 px-6 font-display font-semibold text-foreground">
                {r.metric}
              </div>
              <div className="col-span-4 py-4 px-6 flex items-start gap-2 text-emerald-900 font-medium">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 flex-shrink-0" />
                {r.bloom}
              </div>
              <div className="col-span-4 py-4 px-6 flex items-start gap-2 text-slate-600">
                <XCircle className="h-4 w-4 mt-0.5 text-rose-500 flex-shrink-0" />
                {r.agency}
              </div>
            </div>
          ))}
        </div>

        {/* Mobile stacked cards */}
        <div className="md:hidden space-y-3" data-testid="bloom-vs-agencies-mobile">
          {ROWS.map((r) => (
            <div
              key={r.metric}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2">
                {r.metric}
              </div>
              <div className="flex items-start gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 flex-shrink-0" />
                <div className="text-sm">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">
                    Bloom Labs
                  </div>
                  <div className="text-emerald-900 font-medium">{r.bloom}</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <XCircle className="h-4 w-4 mt-0.5 text-rose-500 flex-shrink-0" />
                <div className="text-sm">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                    Traditional Agency
                  </div>
                  <div className="text-slate-600">{r.agency}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center">
            <div className="font-display text-3xl font-bold text-emerald-900">
              ~40%
            </div>
            <div className="text-xs uppercase tracking-wider text-emerald-700 font-semibold mt-1">
              Lower cost
            </div>
            <p className="text-xs text-emerald-800/80 mt-2 leading-relaxed">
              No account managers, AI-native scaffolding, lean offshore team
            </p>
          </div>
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-5 text-center">
            <div className="font-display text-3xl font-bold text-blue-900">
              6×
            </div>
            <div className="text-xs uppercase tracking-wider text-blue-700 font-semibold mt-1">
              Faster delivery
            </div>
            <p className="text-xs text-blue-800/80 mt-2 leading-relaxed">
              Custom web app development in 2–4 weeks, not 4–6 months
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-5 text-center">
            <div className="font-display text-3xl font-bold text-amber-900">
              0
            </div>
            <div className="text-xs uppercase tracking-wider text-amber-700 font-semibold mt-1">
              Surprise fees
            </div>
            <p className="text-xs text-amber-800/80 mt-2 leading-relaxed">
              Fixed scope, fixed price, locked in writing
            </p>
          </div>
        </div>

        <div className="mt-10 text-center">
          <Button
            asChild
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-12 px-6"
            data-testid="bloom-vs-agencies-cta"
          >
            <a href="#book">
              <Calendar className="h-4 w-4 mr-2" />
              Book your discovery call
            </a>
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            Free · 30 minutes · we&apos;ll quote your project on the call
          </p>
        </div>
      </div>
    </section>
  );
}

export default BloomVsAgencies;
