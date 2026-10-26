import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/sections/Header";
import { Footer } from "@/components/sections/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight, Download, CornerDownRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import SeoHead from "@/components/SeoHead";
import { trackEvent } from "@/components/Analytics";

const PDF_URL = "/Bloom-DevLabs-Showcase-Book-2026-A4.pdf";

const INSIDE = [
  ["A quick gut-check.", "Five signs your business is running on memory and midnight DMs."],
  ["Agency vs Bloom, side by side.", "4–6 months and open-ended budgets, or 2–4 weeks at a fixed price."],
  ["What we build.", "Web and mobile apps, client portals, booking systems, dashboards and AI integrations."],
  ["Starting points for your industry.", "Gym management, coach portals and real estate leads, live today."],
  ["BloomConnect and BloomEngage.", "AI that replies, sells and books appointments in your chats and on LinkedIn, 24/7."],
  ["Real client builds.", "A booking system live in 14 days, a SaaS at $5K MRR, a membership platform in 2 days."],
  ["How we work and what it costs.", "Four steps, three fixed-price packages from $5,995."],
];

const SPREADS = [
  { src: "/showcase/page-04.jpg", alt: "Showcase book page: what we build", caption: "What we build" },
  { src: "/showcase/page-05.jpg", alt: "Showcase book page: industry solutions", caption: "Industry solutions" },
  { src: "/showcase/page-09.jpg", alt: "Showcase book page: selected client work", caption: "Selected work" },
  { src: "/showcase/page-10.jpg", alt: "Showcase book page: how we work and packages", caption: "Process and pricing" },
];

/** Rise-and-fade on first view. Content is plain if reduced motion is on. */
function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!el || reduce || !("IntersectionObserver" in window)) {
      setShown(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-[opacity,transform] duration-700 ease-out ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      } ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

function DownloadButton({ location, variant }) {
  return (
    <Button
      asChild
      size="lg"
      variant={variant}
      className="rounded-none h-12 px-6 text-base transition-transform active:scale-[0.98]"
      data-testid={`showcase-download-${location}`}
      onClick={() => trackEvent("showcase_download", { location })}
    >
      <a href={PDF_URL} download>
        <Download className="mr-2 h-4 w-4" /> Download the book
      </a>
    </Button>
  );
}

export default function ShowcasePage() {
  return (
    <main className="bg-background text-foreground" data-testid="showcase-page">
      <SeoHead
        title="Showcase Book 2026 — free PDF download"
        description="Download the Bloom Labs Showcase Book 2026: real client builds, our process and fixed-price packages for custom web apps and AI agents."
        keywords="showcase book, bloom labs portfolio, custom web app development, AI agents, automation"
        url="https://bybloomlabs.com/showcase"
        type="website"
        breadcrumbs={[
          { name: "Home", url: "https://bybloomlabs.com" },
          { name: "Showcase", url: "https://bybloomlabs.com/showcase" },
        ]}
      />
      <Header />

      {/* Hero: dark field, real cover */}
      <section className="bg-foreground text-background overflow-hidden">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 pt-14 sm:pt-20 pb-0 grid gap-10 lg:grid-cols-[1.45fr_1fr] lg:items-end">
          <div className="pb-14 sm:pb-24">
            <Reveal as="h1" className="font-display text-5xl sm:text-7xl lg:text-[4.5rem] xl:text-[5rem] font-semibold leading-[0.95] tracking-[-0.035em] max-w-[11ch] sm:max-w-none">
              Get more clients, but easier.
            </Reveal>
            <Reveal as="p" delay={80} className="mt-6 max-w-xl text-lg sm:text-xl text-background/85">
              The Bloom DevLabs Showcase Book 2026. Real builds, real prices and
              how we ship custom software in weeks. Free, no sign-up.
            </Reveal>
            <Reveal delay={160} className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              <DownloadButton location="hero" variant="secondary" />
              <span className="text-base text-background/80">12 pages · PDF · 2.4 MB</span>
            </Reveal>
          </div>

          <Reveal delay={120} className="relative flex justify-center lg:justify-end">
            <img
              src="/showcase/page-01.jpg"
              alt="Cover of the Bloom DevLabs Showcase Book 2026: getting you more clients, but easier."
              width="900"
              height="1273"
              className="w-[min(78vw,26rem)] lg:w-[26rem] h-auto -mb-px translate-y-0 rotate-[-2deg] origin-bottom"
            />
          </Reveal>
        </div>
      </section>

      {/* What's inside */}
      <section className="bg-[var(--warm-50)]">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 py-20 sm:py-32 grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
          <Reveal>
            <h2 className="font-display text-4xl sm:text-6xl font-semibold leading-[0.98] tracking-[-0.03em]">
              Here&apos;s what you&apos;ll find inside.
            </h2>
            <img
              src="/showcase/page-02.jpg"
              alt="Showcase book page: you didn't start a business to answer DMs at midnight."
              loading="lazy"
              width="900"
              height="1273"
              className="mt-10 w-full max-w-sm h-auto hidden lg:block"
            />
          </Reveal>
          <ul className="space-y-7 sm:space-y-9">
            {INSIDE.map(([title, body], i) => (
              <Reveal as="li" key={title} delay={i * 60} className="flex gap-4">
                <CornerDownRight className="mt-1.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-lg sm:text-xl leading-snug">
                  <strong className="font-semibold">{title}</strong> {body}
                </p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* The numbers: whole field of colour */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 py-20 sm:py-32">
          <Reveal as="h2" className="font-display text-4xl sm:text-6xl font-semibold leading-[0.98] tracking-[-0.03em] max-w-4xl">
            The agency way is slow. Ours isn&apos;t.
          </Reveal>
          <div className="mt-14 sm:mt-20 grid gap-12 sm:grid-cols-2 sm:gap-16">
            <Reveal delay={80}>
              <div className="font-display text-7xl sm:text-9xl font-semibold tracking-[-0.045em] leading-none opacity-70">
                4–6 mo
              </div>
              <p className="mt-4 text-lg sm:text-xl">
                A traditional agency: long discovery, slow handoffs, open-ended budgets, and you see it at the end.
              </p>
            </Reveal>
            <Reveal delay={160}>
              <div className="font-display text-7xl sm:text-9xl font-semibold tracking-[-0.045em] leading-none">
                2–4 wk
              </div>
              <p className="mt-4 text-lg sm:text-xl">
                Bloom DevLabs: senior engineers, about 40% lower cost, weekly demos and a fixed price agreed up front.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* A look inside */}
      <section className="bg-background">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 py-20 sm:py-32">
          <Reveal as="h2" className="font-display text-4xl sm:text-6xl font-semibold leading-[0.98] tracking-[-0.03em] max-w-3xl">
            Flip through a few pages.
          </Reveal>
          <div className="mt-12 sm:mt-16 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10 sm:gap-x-6">
            {SPREADS.map((s, i) => (
              <Reveal key={s.src} delay={i * 80} className={i % 2 ? "lg:mt-16" : ""}>
                <img src={s.src} alt={s.alt} loading="lazy" width="900" height="1273" className="w-full h-auto transition-transform duration-500 hover:-translate-y-1" />
                <p className="mt-3 text-base">{s.caption}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Close */}
      <section className="bg-foreground text-background">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 py-20 sm:py-32">
          <Reveal as="h2" className="font-display text-5xl sm:text-7xl lg:text-[5.5rem] font-semibold leading-[0.95] tracking-[-0.035em] max-w-5xl">
            Thought &ldquo;I need this&rdquo; at least once? Let&apos;s build yours.
          </Reveal>
          <Reveal delay={100} className="mt-10 flex flex-wrap items-center gap-4">
            <DownloadButton location="footer" variant="secondary" />
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-none h-12 px-6 text-base bg-transparent text-background border-background/60 hover:bg-background hover:text-foreground"
            >
              <a href={BRAND.tidycal} target="_blank" rel="noopener noreferrer">
                Book a 45-minute call <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </Reveal>
          <p className="mt-8 text-base text-background/80">
            Free app audit. Proposal within 24 hours. {BRAND.email}
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
