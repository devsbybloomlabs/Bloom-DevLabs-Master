import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Header } from "@/components/sections/Header";
import { Footer } from "@/components/sections/Footer";
import RelatedLinks from "@/components/RelatedLinks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, Inbox } from "lucide-react";
import { BRAND } from "@/lib/brand";
import SeoHead from "@/components/SeoHead";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PublicCaseStudies() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    axios
      .get(`${API}/public/case-studies`)
      .then((r) => setItems(r.data || []))
      .catch(() => setItems([]));
  }, []);

  return (
    <main className="bg-background text-foreground" data-testid="public-case-studies-page">
      <SeoHead
        title="Case Studies — real apps, real results"
        description="See how Bloom Labs ships enterprise-grade custom web apps in 2–4 weeks at ~40% lower cost. Real client wins, metrics, and quotes."
        keywords="case studies, custom web app development, AI-native agency, SaaS launch, bloom labs"
        url="https://bybloomlabs.com/case-studies"
        type="website"
        breadcrumbs={[
          { name: "Home", url: "https://bybloomlabs.com" },
          { name: "Case Studies", url: "https://bybloomlabs.com/case-studies" },
        ]}
      />
      <Header />
      <section className="bg-[var(--warm-50)] border-b border-border">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="max-w-3xl">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Case Studies
            </div>
            <h1 className="font-display mt-3 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight">
              Real systems. Real results.
            </h1>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl">
              How we&apos;ve helped founders ship enterprise-grade web apps in
              weeks, not quarters — at ~40% lower cost than traditional
              agencies.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {items === null && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        )}
        {items && items.length === 0 && (
          <div
            className="rounded-xl border border-dashed border-border bg-[var(--warm-50)] p-12 text-center"
            data-testid="public-case-studies-empty"
          >
            <div className="mx-auto h-12 w-12 rounded-full bg-white flex items-center justify-center mb-3 shadow-[var(--shadow-sm)]">
              <Inbox className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-display text-lg font-medium">More case studies coming soon</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;re packaging up the wins. Want yours to be next?
            </p>
            <Button
              asChild
              className="mt-5 bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
              data-testid="case-studies-empty-book-call"
            >
              <a href={BRAND.tidycal} target="_blank" rel="noopener noreferrer">
                Book a discovery call <ArrowRight className="h-4 w-4 ml-2" />
              </a>
            </Button>
          </div>
        )}
        {items && items.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="public-case-studies-grid">
            {items.map((cs) => (
              <article
                key={cs.id}
                className="group rounded-2xl border border-border bg-card overflow-hidden hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all"
                data-testid={`public-case-study-card-${cs.id}`}
              >
                {cs.featured_image ? (
                  <div className="aspect-[16/10] bg-secondary overflow-hidden">
                    <img
                      src={cs.featured_image}
                      alt={cs.client_name}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/10] bg-gradient-to-br from-[#1E3A8A]/10 to-[#3B82F6]/10 flex items-center justify-center">
                    <span className="font-display text-2xl text-[#1E3A8A]/40">
                      {cs.client_name?.charAt(0) || "B"}
                    </span>
                  </div>
                )}
                <div className="p-5 sm:p-6">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="border-[#3B82F6]/30 text-[#1E3A8A]">
                      {cs.industry}
                    </Badge>
                    <span className="text-muted-foreground">
                      {cs.timeline_days} days
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-lg font-semibold">
                    {cs.client_name}
                  </h3>
                  <p className="mt-1.5 text-sm text-muted-foreground line-clamp-3">
                    {cs.challenge}
                  </p>
                  {cs.metrics && cs.metrics.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {cs.metrics.slice(0, 3).map((m, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-foreground/80"
                        >
                          {m.label}: {m.after || m.before || "—"}
                        </span>
                      ))}
                    </div>
                  )}
                  {cs.quote && (
                    <blockquote className="mt-4 border-l-2 border-[#3B82F6] pl-3 text-sm italic text-muted-foreground">
                      &ldquo;{cs.quote.slice(0, 140)}{cs.quote.length > 140 ? "…" : ""}&rdquo;
                    </blockquote>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-14 text-center">
          <p className="text-sm text-muted-foreground">
            Want results like this?
          </p>
          <Button
            asChild
            className="mt-3 bg-amber-500 hover:bg-amber-600 text-white h-11 px-6 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.5)]"
            data-testid="public-case-studies-cta"
          >
            <Link to="/get-audit?src=case-studies-page">
              Get your audit <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Free · 24h turnaround · 3–5 personalised app recommendations.
          </p>
        </div>
      </section>

      <RelatedLinks />
      <Footer />
    </main>
  );
}
