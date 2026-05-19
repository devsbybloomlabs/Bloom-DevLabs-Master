import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, BadgeCheck, Timer, Lock, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { BRAND } from "@/lib/brand";
import AbSlot from "@/components/AbSlot";

export const Hero = () => {
  return (
    <section
      id="top"
      data-testid="hero-section"
      className="relative overflow-hidden scroll-mt-24"
    >
      <div className="hero-bloom" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 pt-14 sm:pt-20 lg:pt-24 pb-16 sm:pb-20 lg:pb-24">
        <div className="grid gap-10 lg:gap-16 lg:grid-cols-12 items-center">
          {/* Left copy */}
          <div className="lg:col-span-7 animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-foreground/80">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
              {BRAND.tagline}
            </div>
            <h1
              data-testid="hero-headline"
              className="font-display mt-5 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.04] text-foreground"
            >
              Enterprise Web Apps in{" "}
              <span className="text-[#1E3A8A] whitespace-nowrap">2&ndash;4 Weeks</span>
              <br className="hidden sm:block" /> (Not 6 Months)
            </h1>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
              Custom web systems that actually solve your business problems
              &mdash; built fast, transparently, and at ~40% lower cost than
              traditional agencies.
            </p>

            <p className="mt-3 text-sm text-muted-foreground max-w-xl">
              Now serving custom software for{" "}
              <a
                href="/solutions/gym-management-software"
                className="text-[#1E3A8A] font-semibold hover:underline"
                data-testid="hero-link-gym"
              >
                gym owners
              </a>
              ,{" "}
              <a
                href="/solutions/coach-funnel"
                className="text-[#1E3A8A] font-semibold hover:underline"
                data-testid="hero-link-coach"
              >
                coaches &amp; consultants
              </a>
              , and{" "}
              <a
                href="/solutions/real-estate-leads"
                className="text-[#1E3A8A] font-semibold hover:underline"
                data-testid="hero-link-re"
              >
                real estate brokers
              </a>
              .
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/get-audit?src=hero-primary" className="block">
                <Button
                  className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white h-12 px-6 text-base shadow-[0_10px_28px_-10px_rgba(245,158,11,0.65)] hover:shadow-[0_14px_36px_-10px_rgba(245,158,11,0.75)] transition-shadow"
                  data-testid="hero-audit-cta-button"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Get my New Workflow
                </Button>
              </Link>
              <AbSlot elementKey="homepage_hero_cta" fallback="Book a Discovery Call">
                {(content, trackClick) => (
                  <Button
                    asChild
                    variant="outline"
                    className="h-12 px-6 text-base border-border hover:bg-secondary"
                    data-testid="hero-primary-cta-button"
                  >
                    <a href="#book" onClick={trackClick}>
                      <Calendar className="h-4 w-4 mr-2" />
                      {content}
                    </a>
                  </Button>
                )}
              </AbSlot>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              See what custom app we&rsquo;d build for you in 2 weeks · free · 24h turnaround.
            </p>

            <div className="mt-8 flex flex-wrap gap-2 sm:gap-3">
              {[
                { label: "2–4 week delivery", icon: Timer },
                { label: "Fixed-scope packages", icon: BadgeCheck },
                { label: "Enterprise-ready", icon: Lock },
              ].map((c) => (
                <Badge
                  key={c.label}
                  variant="outline"
                  className="bg-white/70 backdrop-blur text-foreground border-border px-3 py-1.5 font-normal"
                >
                  <c.icon className="h-3.5 w-3.5 mr-1.5 text-[#3B82F6]" />
                  {c.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Right visual card */}
          <div className="lg:col-span-5 animate-fade-up" style={{ animationDelay: "120ms" }}>
            <div className="relative rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow-md)] overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-secondary/40">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                <span className="ml-3 text-xs text-muted-foreground tabular-nums">
                  bybloomlabs.com / dashboard
                </span>
              </div>
              <div className="p-5 sm:p-6 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Project status</div>
                    <div className="font-display text-xl font-semibold mt-1">
                      Customer Portal
                    </div>
                  </div>
                  <Badge className="bg-[#16A34A] text-white hover:bg-[#16A34A]">On track</Badge>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  {[
                    { label: "Delivery", value: "14–28d" },
                    { label: "Cost", value: "~40% ↓" },
                    { label: "Support", value: "30 days" },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="rounded-xl border border-border p-3"
                    >
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {m.label}
                      </div>
                      <div className="font-display text-base font-semibold mt-1 tabular-nums">
                        {m.value}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Build progress</span>
                    <span className="tabular-nums">68%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#1E3A8A]"
                      style={{ width: "68%" }}
                    />
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                  {[
                    "Auth + roles ✓",
                    "Stripe integration ✓",
                    "Admin dashboard",
                    "Email automation",
                  ].map((t) => (
                    <div
                      key={t}
                      className="px-3 py-2 rounded-lg border border-border bg-secondary/50"
                    >
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs text-muted-foreground text-center">
              Live preview &mdash; weekly demos with every project.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
