import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Mail, Phone, Sparkles } from "lucide-react";
import { BRAND } from "@/lib/brand";
import SeoHead from "@/components/SeoHead";
import { trackEvent } from "@/components/Analytics";
import { PayPalCheckoutButton } from "@/components/payment/PayPalCheckoutButton";

const PRICE = "200.00";
const DESCRIPTION = "Starter one-pager: website design & development";
const NAVY = "var(--navy-950)";

const INCLUDED = [
  ["One page, designed from scratch.", "Hero, up to five sections and a contact block, laid out for your business, not a template swap.", "/showcase/page-02.jpg"],
  ["Built in code and live on the web.", "Fast, mobile-first and SEO-ready, with your copy and your images.", "/showcase/page-04.jpg"],
  ["Two rounds of changes.", "You see a working preview, we adjust it twice, then it ships.", "/showcase/page-05.jpg"],
  ["A contact form that reaches you.", "Messages land in your inbox. Your phone number and socials are one tap away.", "/showcase/page-09.jpg"],
  ["Delivered in 7 days.", "From the day you send us your details to a live link.", "/showcase/page-10.jpg"],
];

const NOT_INCLUDED =
  "Domain and hosting fees are paid to the provider, and extra pages, logins, bookings or payments are quoted separately. Want more later? Your one-pager is the first page of a bigger build.";

const SECTIONS = [
  { id: "about", label: "About you", height: "h-12" },
  { id: "services", label: "What you offer", height: "h-16" },
  { id: "work", label: "Your work", height: "h-20" },
  { id: "proof", label: "Reviews", height: "h-12" },
  { id: "faq", label: "Questions", height: "h-14" },
  { id: "contact", label: "Contact form", height: "h-14" },
];

const STEPS = [
  ["Pay $200 below.", "PayPal checkout takes a minute. You get an email straight away."],
  ["Send your details.", "Your business name, a few lines about it, and any logo or photos. Nothing polished needed."],
  ["See a working preview.", "Day 4, a real link you can open on your phone. Ask for up to two rounds of changes."],
  ["Go live.", "We publish it and hand over everything. It's yours."],
];

const WORK = [
  { src: "/showcase/page-04.jpg", alt: "Bloom Labs showcase page: what we build", caption: "What we build", tilt: "-rotate-3" },
  { src: "/showcase/page-05.jpg", alt: "Bloom Labs showcase page: industry solutions", caption: "Industry starting points", tilt: "rotate-2 lg:mt-10" },
  { src: "/showcase/page-09.jpg", alt: "Bloom Labs showcase page: selected client work", caption: "Selected client work", tilt: "-rotate-2" },
  { src: "/showcase/page-10.jpg", alt: "Bloom Labs showcase page: how we work and packages", caption: "How we work", tilt: "rotate-3 lg:mt-10" },
];

const FAQ = [
  ["Is it really $200?", "Yes. One flat payment for one designed and built page. No monthly retainer and no surprise invoice."],
  ["What if I need more than one page?", "Start with the one-pager. When you're ready for more pages, a booking system or an app, our fixed-price builds start from $5,995. No pressure, and no obligation."],
  ["Do I need to have a logo or copy ready?", "No. Send what you have. If you have only a business name and a few lines, we'll shape the rest and you approve it in the preview."],
  ["Who owns the page?", "You do. We hand over the files and the live site when it's done."],
  ["What if I don't like it?", "That's what the two rounds of changes are for. If we can't get it right, email us and we'll sort it out."],
];

const RIBBON = ["One page", "Live in 7 days", "$200 flat", "Two rounds of changes", "Yours to keep", "Designed and built"];

const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Rise-and-fade on first view. Content is plain if reduced motion is on. */
function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !("IntersectionObserver" in window)) {
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

/** Scroll-linked drift: moves the element a little against the scroll. Put rotation on a child. */
function Parallax({ factor = 0.08, className = "", children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const mid = r.top + r.height / 2 - window.innerHeight / 2;
      el.style.transform = `translate3d(0, ${(-mid * factor).toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [factor]);

  return (
    <div ref={ref} className={`will-change-transform ${className}`}>
      {children}
    </div>
  );
}

function scrollToPay(location) {
  trackEvent("start_cta_click", { location });
  document.getElementById("pay")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function PayButton({ location }) {
  return (
    <Button
      size="lg"
      onClick={() => scrollToPay(location)}
      className="h-12 px-6 text-base bg-amber-500 hover:bg-amber-600 text-white shadow-[0_10px_28px_-10px_rgba(245,158,11,0.65)] hover:shadow-[0_14px_36px_-10px_rgba(245,158,11,0.75)] transition-[box-shadow,transform] active:scale-[0.98]"
      data-testid={`start-cta-${location}`}
    >
      <Sparkles className="mr-2 h-4 w-4" /> Get my one-pager for $200
    </Button>
  );
}

/** Circular text stamp, slowly turning. */
function Stamp({ className = "" }) {
  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <svg viewBox="0 0 120 120" className="start-spin h-full w-full">
        <defs>
          <path id="start-stamp-path" d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0" />
        </defs>
        <circle cx="60" cy="60" r="60" fill="#F59E0B" />
        <text fontSize="11" fontWeight="700" fill="#0B1220">
          <textPath href="#start-stamp-path" textLength="286" lengthAdjust="spacing">
            LIVE IN 7 DAYS • FLAT $200 •{" "}
          </textPath>
        </text>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-2xl font-extrabold text-[#0B1220]">
        $200
      </span>
    </div>
  );
}

/** What $200 gets you: big rows, the active one opens and swaps the tilted page beside it. */
function IncludedList() {
  const [active, setActive] = useState(0);

  return (
    <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:items-center">
      <div className="relative mx-auto w-[min(70vw,19rem)] aspect-[900/1273] -rotate-3" aria-hidden="true">
        <div className="absolute inset-0 translate-x-4 translate-y-4 rotate-6 rounded-lg bg-amber-500" />
        {INCLUDED.map(([title, , src], i) => (
          <img
            key={title}
            src={src}
            alt=""
            loading="lazy"
            width="900"
            height="1273"
            className={`absolute inset-0 h-full w-full rounded-lg bg-white object-cover shadow-[var(--shadow-lg)] transition-opacity duration-500 ${
              i === active ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
      </div>

      <ul className="space-y-2">
        {INCLUDED.map(([title, body], i) => {
          const on = i === active;
          return (
            <li key={title}>
              <button
                type="button"
                aria-expanded={on}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className="group block w-full text-left py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                data-testid={`start-included-${i}`}
              >
                <span
                  className={`block font-display text-2xl sm:text-4xl font-semibold leading-tight tracking-[-0.025em] transition-[transform,opacity] duration-300 ${
                    on ? "translate-x-3 opacity-100" : "opacity-55 group-hover:opacity-80"
                  }`}
                >
                  {title}
                </span>
                <span
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ${
                    on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <span className="overflow-hidden">
                    <span className="mt-2 block max-w-lg pl-3 text-base sm:text-lg text-primary-foreground/90">{body}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        <li className="pt-4">
          <p className="max-w-xl text-sm sm:text-base text-primary-foreground/80">{NOT_INCLUDED}</p>
        </li>
      </ul>
    </div>
  );
}

/** The live thing: pick the sections of your page and watch it stack up in a browser window. */
function PageBuilder() {
  const [picked, setPicked] = useState(["about", "services", "contact"]);
  const MAX = 5;

  const toggle = (id) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= MAX) return prev;
      return [...prev, id];
    });
  };

  const ordered = SECTIONS.filter((s) => picked.includes(s.id));

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:items-center">
      <div>
        <fieldset>
          <legend className="sr-only">Choose up to five sections for your page</legend>
          <div className="flex flex-wrap gap-3">
            {SECTIONS.map((s) => {
              const on = picked.includes(s.id);
              const full = !on && picked.length >= MAX;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  disabled={full}
                  onClick={() => toggle(s.id)}
                  data-testid={`builder-toggle-${s.id}`}
                  className={`h-11 rounded-lg border px-4 text-base font-medium transition-[transform,background-color,color,border-color] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A8A] disabled:opacity-40 ${
                    on
                      ? "border-[#1E3A8A] bg-[#1E3A8A] text-white"
                      : "border-border bg-card text-foreground hover:border-[#3B82F6] hover:text-[#1E3A8A]"
                  }`}
                >
                  {on && <Check className="mr-2 inline h-4 w-4" aria-hidden="true" />}
                  {s.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <p className="mt-6 text-base sm:text-lg" aria-live="polite">
          {picked.length} of {MAX} sections picked. Hero and footer are always included.
        </p>
      </div>

      <Parallax factor={0.05}>
        <div
          className="mx-auto w-full max-w-md rotate-[1.5deg] overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow-md)] transition-transform duration-500 hover:rotate-0"
          role="img"
          aria-label={`Preview of a one-page website with ${picked.length} sections`}
        >
          <div className="flex items-center gap-2 border-b bg-secondary/40 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
            <span className="ml-3 text-xs text-muted-foreground">yourbusiness.com</span>
          </div>
          <div className="bg-[#1E3A8A] px-5 py-8 text-white">
            <div className="font-display text-2xl font-semibold tracking-[-0.02em]">Your business</div>
            <div className="mt-2 text-base opacity-85">Your hero line goes here.</div>
            <div className="mt-4 inline-block rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold">Call to action</div>
          </div>
          <div className="space-y-2 bg-secondary/40 p-3">
            {ordered.map((s) => (
              <div
                key={s.id}
                className={`flex items-center rounded-lg bg-card px-4 text-base font-medium shadow-[var(--shadow-sm)] animate-fade-up ${s.height}`}
              >
                {s.label}
              </div>
            ))}
          </div>
          <div className="bg-[var(--navy-950)] px-5 py-3 text-sm text-white/80">Footer, socials and contact details</div>
        </div>
      </Parallax>
    </div>
  );
}

function PaySection() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const ready = name.trim().length > 1 && emailOk;

  return (
    <section id="pay" className="scroll-mt-4 bg-[var(--navy-900)] text-white">
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 pt-10 pb-16 sm:pb-20 lg:pb-24 grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:items-center">
        <div>
          <Reveal
            as="h2"
            className="font-display text-4xl sm:text-6xl lg:text-7xl font-extrabold leading-[0.98] tracking-[-0.03em]"
          >
            One page. <span className="text-amber-400">Live in a week.</span>
          </Reveal>
          <Reveal as="p" delay={80} className="mt-6 max-w-xl text-lg sm:text-xl text-white/85">
            Pay once with PayPal, send us your details, and you have a working link in your hands within 7 days.
          </Reveal>
        </div>

        <Reveal
          delay={120}
          className="rounded-[var(--radius)] bg-background p-6 sm:p-8 text-foreground shadow-[var(--shadow-lg)]"
        >
          {done ? (
            <div data-testid="start-success" aria-live="polite">
              <h3 className="font-display text-3xl font-semibold tracking-[-0.02em]">You&apos;re in.</h3>
              <p className="mt-3 text-lg">
                Payment received. A receipt from PayPal is on its way to {done.payerEmail || email}. Reply to it, or email us
                at <a className="underline" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>, with your business name, a few lines
                about it and any logo or photos.
              </p>
              <Button
                asChild
                size="lg"
                className="mt-6 h-11 px-5 bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                onClick={() => trackEvent("start_book_call")}
              >
                <a href={BRAND.tidycal} target="_blank" rel="noopener noreferrer">
                  Or book a 15-minute kickoff <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          ) : (
            <form onSubmit={(e) => e.preventDefault()} noValidate data-testid="start-pay-form">
              <h3 className="font-display text-2xl font-semibold tracking-[-0.02em]">Starter one-pager</h3>
              <p className="mt-1 font-display text-6xl font-extrabold tracking-[-0.04em] text-[#1E3A8A]">$200</p>
              <label className="mt-6 block text-base font-medium" htmlFor="start-name">
                Your name
              </label>
              <input
                id="start-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 h-12 w-full rounded-lg border border-border bg-background px-4 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3B82F6]"
                data-testid="start-name"
              />
              <label className="mt-4 block text-base font-medium" htmlFor="start-email">
                Email for your receipt
              </label>
              <input
                id="start-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 h-12 w-full rounded-lg border border-border bg-background px-4 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3B82F6]"
                data-testid="start-email"
              />
              <div className="mt-6">
                {ready ? (
                  <PayPalCheckoutButton
                    mode="order"
                    amount={PRICE}
                    description={DESCRIPTION}
                    customerName={name.trim()}
                    customerEmail={email.trim()}
                    onSuccess={(res) => {
                      trackEvent("start_purchase", { value: 200, currency: "USD" });
                      setDone(res);
                    }}
                  />
                ) : (
                  <p className="text-base text-muted-foreground" data-testid="start-pay-hint">
                    Add your name and email to unlock PayPal checkout.
                  </p>
                )}
              </div>
            </form>
          )}
        </Reveal>
      </div>
    </section>
  );
}

function Ribbon() {
  const items = [...RIBBON, ...RIBBON];
  return (
    <div className="relative z-10 -my-4 overflow-hidden py-10" aria-hidden="true">
      <div className="start-marquee -rotate-2 scale-x-110 bg-[var(--navy-950)] py-4 text-white">
        <div className="start-marquee-track flex w-max items-center">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center">
              {items.map((t, i) => (
                <span key={`${copy}-${i}`} className="flex items-center whitespace-nowrap font-display text-xl sm:text-3xl font-bold tracking-[-0.02em]">
                  <span className="px-6 sm:px-10">{t}</span>
                  <Sparkles className={`h-6 w-6 ${i % 2 ? "text-[#3B82F6]" : "text-amber-400"}`} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function StartPage() {
  return (
    <main className="overflow-x-clip bg-background text-foreground" data-testid="start-page">
      <SeoHead
        title="A designed, built website for $200"
        description="Get a custom one-page website, designed and built by Bloom Labs, live in 7 days. One flat $200, paid with PayPal."
        keywords="$200 website, one page website, affordable website design, small business website"
        url="https://bybloomlabs.com/start"
        type="website"
        breadcrumbs={[
          { name: "Home", url: "https://bybloomlabs.com" },
          { name: "Start", url: "https://bybloomlabs.com/start" },
        ]}
      />

      {/* Bar: wordmark and one action, as on the homepage */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="/" aria-label={`${BRAND.name} home`}>
            <img src={BRAND.logos.fullDark} alt={BRAND.name} className="h-7 sm:h-8 w-auto select-none" width="140" height="32" />
          </a>
          <Button
            onClick={() => scrollToPay("nav")}
            className="h-10 px-5 bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="start-cta-nav"
          >
            Get started
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="hero-bloom" />
        <div className="relative mx-auto grid max-w-[1120px] gap-12 px-4 pt-12 pb-20 sm:px-6 sm:pt-16 sm:pb-24 lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-8 lg:pt-20 lg:pb-28">
          <div className="lg:col-span-7">
            <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-foreground/80">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
              Starter one-pager, live in 7 days
            </div>
            <p
              aria-hidden="true"
              className="animate-fade-up mt-4 font-display text-[7.5rem] sm:text-[12rem] lg:text-[13.5rem] font-extrabold leading-[0.8] tracking-[-0.06em] text-[#1E3A8A]"
              style={{ animationDelay: "60ms" }}
            >
              $200
            </p>
            <h1
              className="animate-fade-up mt-6 max-w-[18ch] font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.02] tracking-[-0.03em]"
              style={{ animationDelay: "120ms" }}
            >
              <span className="sr-only">$200: </span>A real website, <span className="text-[#1E3A8A]">designed and built.</span>
            </h1>
            <p className="animate-fade-up mt-5 max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed" style={{ animationDelay: "180ms" }}>
              One custom page for your business, live in 7 days. Flat price, two rounds of changes, and it&apos;s yours.
            </p>
            <div className="animate-fade-up mt-8 flex flex-wrap items-center gap-x-6 gap-y-3" style={{ animationDelay: "240ms" }}>
              <PayButton location="hero" />
              <span className="text-base text-muted-foreground">Pay securely with PayPal</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm lg:col-span-5 lg:max-w-none">
            <Parallax factor={0.1}>
              <div className="relative mx-auto w-[min(72vw,20rem)] lg:w-[21rem]">
                <div className="absolute inset-0 translate-x-5 translate-y-5 -rotate-6 rounded-lg bg-amber-500" />
                <div className="relative rotate-3 rounded-lg bg-white p-2 shadow-[var(--shadow-lg)]">
                  <img
                    src="/showcase/page-09.jpg"
                    alt="A page from the Bloom Labs showcase book: selected client work."
                    width="900"
                    height="1273"
                    className="h-auto w-full rounded"
                  />
                </div>
                <div className="absolute -left-6 -bottom-8 w-32 -rotate-6 rounded-lg bg-[#1E3A8A] p-1.5 shadow-[var(--shadow-md)] sm:-left-12 sm:w-36">
                  <img
                    src="/showcase/page-04.jpg"
                    alt="A page from the Bloom Labs showcase book: what we build."
                    width="900"
                    height="1273"
                    loading="lazy"
                    className="h-auto w-full rounded-sm"
                  />
                </div>
                <Stamp className="absolute -right-5 -top-8 h-24 w-24 sm:-right-10 sm:h-28 sm:w-28" />
              </div>
            </Parallax>
            <div className="start-float absolute -bottom-2 right-0 hidden items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-md)] sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1E3A8A] text-white">
                <Check className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium">Live link in 7 days</span>
            </div>
          </div>
        </div>
      </section>

      <Ribbon />

      {/* What you get */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
          <Reveal
            as="h2"
            className="mb-12 max-w-2xl font-display text-3xl sm:text-5xl font-extrabold leading-[1.02] tracking-[-0.03em] sm:mb-16"
          >
            Here&apos;s what $200 gets you.
          </Reveal>
          <Reveal delay={80}>
            <IncludedList />
          </Reveal>
        </div>
      </section>
      <div className="start-zig-down text-primary" aria-hidden="true" />

      {/* The live thing */}
      <section className="bg-background">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
          <Reveal
            as="h2"
            className="max-w-2xl font-display text-3xl sm:text-5xl font-extrabold leading-[1.02] tracking-[-0.03em]"
          >
            Pick what goes on your page.
          </Reveal>
          <Reveal as="p" delay={80} className="mt-4 max-w-xl text-base sm:text-lg text-muted-foreground">
            Choose up to five sections. You can change your mind in the preview, too.
          </Reveal>
          <Reveal delay={140} className="mt-12 sm:mt-16">
            <PageBuilder />
          </Reveal>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-[var(--warm-50)]">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
          <Reveal
            as="h2"
            className="max-w-2xl font-display text-3xl sm:text-5xl font-extrabold leading-[1.02] tracking-[-0.03em]"
          >
            From payment to live in a week.
          </Reveal>
          <ol className="relative mt-12 grid list-none gap-10 p-0 sm:mt-16 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            <span className="absolute left-[6%] right-[6%] top-5 hidden h-px bg-border lg:block" aria-hidden="true" />
            {STEPS.map(([title, body], i) => (
              <Reveal as="li" key={title} delay={i * 80} className="relative">
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#1E3A8A] font-display text-base font-semibold text-white" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="mt-5 font-display text-xl sm:text-2xl font-semibold leading-tight tracking-[-0.02em]">{title}</h3>
                <p className="mt-2 text-base text-muted-foreground">{body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Real Bloom work */}
      <section className="bg-background">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
          <Reveal
            as="h2"
            className="max-w-2xl font-display text-3xl sm:text-5xl font-extrabold leading-[1.02] tracking-[-0.03em]"
          >
            Real builds, by the same team.
          </Reveal>
          <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 sm:mt-16 lg:flex lg:justify-center lg:gap-0 lg:-space-x-6">
            {WORK.map((s, i) => (
              <Reveal key={s.src} delay={i * 80} className="lg:w-1/4">
                <figure
                  className={`${s.tilt} rounded-lg bg-white p-2 shadow-[var(--shadow-md)] transition-[transform,box-shadow] duration-500 hover:z-10 hover:rotate-0 hover:-translate-y-2 hover:shadow-[var(--shadow-lg)]`}
                >
                  <img src={s.src} alt={s.alt} loading="lazy" width="900" height="1273" className="h-auto w-full rounded-sm" />
                  <figcaption className="mt-2 px-1 pb-1 text-sm">{s.caption}</figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[var(--warm-50)]">
        <div className="mx-auto grid max-w-[1120px] gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-8 lg:py-24">
          <Reveal
            as="h2"
            className="font-display text-3xl sm:text-5xl font-extrabold leading-[1.02] tracking-[-0.03em]"
          >
            Questions, answered.
          </Reveal>
          <div className="space-y-3">
            {FAQ.map(([q, a], i) => (
              <Reveal key={q} delay={i * 60}>
                <details
                  className="group rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow-sm)] transition-shadow open:shadow-[var(--shadow-md)] sm:p-6"
                  data-testid={`start-faq-${i}`}
                >
                  <summary className="cursor-pointer list-none text-lg font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3B82F6] sm:text-xl">
                    {q}
                  </summary>
                  <p className="mt-3 text-base text-muted-foreground sm:text-lg">{a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <div className="bg-[var(--navy-900)]">
        <div className="start-zig-down text-[var(--warm-50)]" aria-hidden="true" />
      </div>

      <PaySection />

      {/* Footer, as on the homepage */}
      <footer className="text-white" style={{ background: NAVY }}>
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <img src={BRAND.logos.fullLight} alt={BRAND.name} className="h-9 w-auto" width="150" height="36" />
              <p className="mt-4 max-w-sm text-sm text-white/70">{BRAND.tagline}</p>
            </div>
            <nav className="lg:col-span-3" aria-label="Explore">
              <p className="text-xs uppercase tracking-[0.18em] text-white/50">Explore</p>
              <ul className="mt-4 space-y-2 text-sm">
                <li><a className="text-white/80 hover:text-white" href="/">Home</a></li>
                <li><a className="text-white/80 hover:text-white" href="/case-studies">Case studies</a></li>
                <li><a className="text-white/80 hover:text-white" href="/showcase">Showcase book</a></li>
                <li><a className="text-white/80 hover:text-white" href={BRAND.tidycal} target="_blank" rel="noopener noreferrer">Book a call</a></li>
              </ul>
            </nav>
            <div className="lg:col-span-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/50">Contact</p>
              <ul className="mt-4 space-y-3 text-sm">
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
                  <a className="text-white/80 hover:text-white" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
                  <a className="text-white/80 hover:text-white" href={`tel:${BRAND.phoneHref}`}>{BRAND.phone}</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-white/10 pt-6 text-xs text-white/55">
            © {new Date().getFullYear()} {BRAND.legalName}
          </div>
        </div>
      </footer>
    </main>
  );
}
