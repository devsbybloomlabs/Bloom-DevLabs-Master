import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, CornerDownRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import SeoHead from "@/components/SeoHead";
import { trackEvent } from "@/components/Analytics";
import { PayPalCheckoutButton } from "@/components/payment/PayPalCheckoutButton";

const PRICE = "200.00";
const DESCRIPTION = "Starter one-pager: website design & development";
const ACCENT = "#D4F53C";

const INCLUDED = [
  ["One page, designed from scratch.", "Hero, up to five sections and a contact block, laid out for your business, not a template swap."],
  ["Built in code and live on the web.", "Fast, mobile-first and SEO-ready, with your copy and your images."],
  ["Two rounds of changes.", "You see a working preview, we adjust it twice, then it ships."],
  ["A contact form that reaches you.", "Messages land in your inbox. Your phone number and socials are one tap away."],
  ["Delivered in 7 days.", "From the day you send us your details to a live link."],
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
  { src: "/showcase/page-04.jpg", alt: "Bloom Labs showcase page: what we build", caption: "What we build" },
  { src: "/showcase/page-05.jpg", alt: "Bloom Labs showcase page: industry solutions", caption: "Industry starting points" },
  { src: "/showcase/page-09.jpg", alt: "Bloom Labs showcase page: selected client work", caption: "Selected client work" },
  { src: "/showcase/page-10.jpg", alt: "Bloom Labs showcase page: how we work and packages", caption: "How we work" },
];

const FAQ = [
  ["Is it really $200?", "Yes. One flat payment for one designed and built page. No monthly retainer and no surprise invoice."],
  ["What if I need more than one page?", "Start with the one-pager. When you're ready for more pages, a booking system or an app, our fixed-price builds start from $5,995. No pressure, and no obligation."],
  ["Do I need to have a logo or copy ready?", "No. Send what you have. If you have only a business name and a few lines, we'll shape the rest and you approve it in the preview."],
  ["Who owns the page?", "You do. We hand over the files and the live site when it's done."],
  ["What if I don't like it?", "That's what the two rounds of changes are for. If we can't get it right, email us and we'll sort it out."],
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

function scrollToPay(location) {
  trackEvent("start_cta_click", { location });
  document.getElementById("pay")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function PayButton({ location, className = "" }) {
  return (
    <Button
      size="lg"
      onClick={() => scrollToPay(location)}
      className={`rounded-none h-14 px-8 text-lg font-semibold transition-transform active:scale-[0.98] ${className}`}
      data-testid={`start-cta-${location}`}
    >
      Get my one-pager for $200 <ArrowRight className="ml-2 h-5 w-5" />
    </Button>
  );
}

/** The live thing: pick the sections of your page and watch it stack up. */
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
    <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20 lg:items-start">
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
                  className={`h-12 px-5 text-base font-medium transition-[transform,background-color,color] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40 ${
                    on
                      ? "bg-primary text-primary-foreground"
                      : "bg-[var(--slate-100)] text-foreground hover:bg-[var(--slate-200)]"
                  }`}
                >
                  {on && <Check className="mr-2 inline h-4 w-4" aria-hidden="true" />}
                  {s.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <p className="mt-6 text-lg" aria-live="polite">
          {picked.length} of {MAX} sections picked. Hero and footer are always included.
        </p>
      </div>

      <div
        className="bg-[var(--slate-100)] p-4 sm:p-6 max-w-md w-full lg:ml-auto"
        role="img"
        aria-label={`Preview of a one-page website with ${picked.length} sections`}
      >
        <div className="bg-primary text-primary-foreground px-5 py-8">
          <div className="font-display text-2xl font-semibold tracking-[-0.02em]">Your business</div>
          <div className="mt-2 text-base opacity-85">Your hero line goes here.</div>
          <div className="mt-4 inline-block px-3 py-1.5 text-sm font-semibold text-foreground" style={{ background: ACCENT }}>
            Call to action
          </div>
        </div>
        {ordered.map((s) => (
          <div
            key={s.id}
            className={`mt-2 bg-background px-5 py-4 ${s.height} flex items-center text-base font-medium animate-fade-up`}
          >
            {s.label}
          </div>
        ))}
        <div className="mt-2 bg-foreground px-5 py-3 text-sm text-background/85">Footer, socials and contact details</div>
      </div>
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
    <section id="pay" className="bg-foreground text-background scroll-mt-4">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8 py-20 sm:py-32 grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
        <div>
          <Reveal
            as="h2"
            className="font-display text-5xl sm:text-7xl lg:text-[5.5rem] font-semibold leading-[0.95] tracking-[-0.035em]"
          >
            One page. Live in a week.
          </Reveal>
          <Reveal as="p" delay={80} className="mt-8 max-w-xl text-lg sm:text-xl text-background/90">
            Pay once with PayPal, send us your details, and you have a working link in your hands within 7 days.
          </Reveal>
        </div>

        <Reveal delay={120} className="bg-background text-foreground p-6 sm:p-8">
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
                className="mt-6 rounded-none h-12 px-6 text-base"
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
              <p className="mt-1 font-display text-6xl font-semibold tracking-[-0.04em]">$200</p>
              <label className="mt-6 block text-base font-medium" htmlFor="start-name">
                Your name
              </label>
              <input
                id="start-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full h-12 bg-[var(--slate-100)] px-4 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
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
                className="mt-2 w-full h-12 bg-[var(--slate-100)] px-4 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
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
                  <p className="text-base text-[var(--slate-700)]" data-testid="start-pay-hint">
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

export default function StartPage() {
  return (
    <main className="bg-background text-foreground" data-testid="start-page">
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

      {/* Plain bar: wordmark and one action */}
      <header className="bg-background">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 h-16 flex items-center justify-between">
          <a href="/" aria-label={`${BRAND.name} home`}>
            <img src={BRAND.logos.fullDark} alt={BRAND.name} className="h-8 w-auto" width="140" height="32" />
          </a>
          <Button
            size="sm"
            onClick={() => scrollToPay("nav")}
            className="rounded-none h-10 px-5 text-base font-semibold active:scale-[0.98]"
            data-testid="start-cta-nav"
          >
            Get started
          </Button>
        </div>
      </header>

      {/* Hero: the price is the picture */}
      <section className="bg-background overflow-hidden">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 pt-10 sm:pt-16 pb-16 sm:pb-24 grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:items-end">
          <div>
            <Reveal
              as="p"
              aria-hidden="true"
              className="font-display text-[8rem] sm:text-[14rem] lg:text-[16rem] font-extrabold leading-[0.8] tracking-[-0.06em] text-primary"
            >
              $200
            </Reveal>
            <Reveal
              as="h1"
              delay={80}
              className="mt-6 font-display text-4xl sm:text-6xl lg:text-7xl font-semibold leading-[0.98] tracking-[-0.035em] max-w-[18ch]"
            >
              <span className="sr-only">$200: </span>A real website, designed and built.
            </Reveal>
            <Reveal as="p" delay={160} className="mt-6 max-w-xl text-lg sm:text-xl">
              One custom page for your business, live in 7 days. Flat price, two rounds of changes, and it&apos;s yours.
            </Reveal>
            <Reveal delay={240} className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              <PayButton location="hero" />
              <span className="text-base">Pay securely with PayPal</span>
            </Reveal>
          </div>

          <Reveal delay={120} className="flex justify-center lg:justify-end">
            <img
              src="/showcase/page-09.jpg"
              alt="A page from the Bloom Labs showcase book: selected client work."
              width="900"
              height="1273"
              className="w-[min(70vw,22rem)] h-auto rotate-[2deg] origin-bottom"
            />
          </Reveal>
        </div>
      </section>

      {/* What you get: whole field of colour */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 py-20 sm:py-32 grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
          <Reveal
            as="h2"
            className="font-display text-4xl sm:text-6xl font-semibold leading-[0.98] tracking-[-0.03em]"
          >
            Here&apos;s what $200 gets you.
          </Reveal>
          <ul className="space-y-7 sm:space-y-9">
            {INCLUDED.map(([title, body], i) => (
              <Reveal as="li" key={title} delay={i * 70} className="flex gap-4">
                <CornerDownRight className="mt-1.5 h-5 w-5 shrink-0" style={{ color: ACCENT }} aria-hidden="true" />
                <p className="text-lg sm:text-xl leading-snug">
                  <strong className="font-semibold">{title}</strong> {body}
                </p>
              </Reveal>
            ))}
            <Reveal as="li" delay={INCLUDED.length * 70} className="pt-2">
              <p className="text-base sm:text-lg text-primary-foreground/90 max-w-xl">{NOT_INCLUDED}</p>
            </Reveal>
          </ul>
        </div>
      </section>

      {/* The live thing */}
      <section className="bg-background">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 py-20 sm:py-32">
          <Reveal
            as="h2"
            className="font-display text-4xl sm:text-6xl font-semibold leading-[0.98] tracking-[-0.03em] max-w-3xl"
          >
            Pick what goes on your page.
          </Reveal>
          <Reveal as="p" delay={80} className="mt-6 max-w-xl text-lg sm:text-xl">
            Choose up to five sections. You can change your mind in the preview, too.
          </Reveal>
          <Reveal delay={140} className="mt-12 sm:mt-16">
            <PageBuilder />
          </Reveal>
        </div>
      </section>

      {/* How it works: a real ordered list, shown by position and size */}
      <section className="bg-[var(--slate-100)]">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 py-20 sm:py-32">
          <Reveal
            as="h2"
            className="font-display text-4xl sm:text-6xl font-semibold leading-[0.98] tracking-[-0.03em] max-w-3xl"
          >
            From payment to live in a week.
          </Reveal>
          <ol className="mt-12 sm:mt-16 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4 list-none p-0">
            {STEPS.map(([title, body], i) => (
              <Reveal as="li" key={title} delay={i * 80} className={i % 2 ? "lg:mt-16" : ""}>
                <h3 className="font-display text-2xl sm:text-3xl font-semibold leading-tight tracking-[-0.02em]">
                  {title}
                </h3>
                <p className="mt-3 text-lg">{body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Real Bloom work */}
      <section className="bg-background">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 py-20 sm:py-32">
          <Reveal
            as="h2"
            className="font-display text-4xl sm:text-6xl font-semibold leading-[0.98] tracking-[-0.03em] max-w-3xl"
          >
            Real builds, by the same team.
          </Reveal>
          <div className="mt-12 sm:mt-16 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10 sm:gap-x-6">
            {WORK.map((s, i) => (
              <Reveal key={s.src} delay={i * 80} className={i % 2 ? "lg:mt-16" : ""}>
                <img
                  src={s.src}
                  alt={s.alt}
                  loading="lazy"
                  width="900"
                  height="1273"
                  className="w-full h-auto transition-transform duration-500 hover:-translate-y-1"
                />
                <p className="mt-3 text-base">{s.caption}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ: native disclosure, surfaces separated by tone */}
      <section className="bg-[var(--slate-100)]">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 py-20 sm:py-32 grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <Reveal
            as="h2"
            className="font-display text-4xl sm:text-6xl font-semibold leading-[0.98] tracking-[-0.03em]"
          >
            Questions, answered.
          </Reveal>
          <div className="space-y-3">
            {FAQ.map(([q, a], i) => (
              <Reveal key={q} delay={i * 60}>
                <details className="group bg-background p-5 sm:p-6" data-testid={`start-faq-${i}`}>
                  <summary className="cursor-pointer list-none text-lg sm:text-xl font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                    {q}
                  </summary>
                  <p className="mt-3 text-lg">{a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <PaySection />

      {/* Designed close: the name returns large */}
      <footer className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 pt-16 sm:pt-24 pb-8">
          <p className="font-display text-6xl sm:text-9xl lg:text-[12rem] font-extrabold leading-[0.85] tracking-[-0.05em]">
            Bloom Labs
          </p>
          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-base">
            <a className="underline" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
            <a className="underline" href={`tel:${BRAND.phoneHref}`}>{BRAND.phone}</a>
            <a className="underline" href="/">bybloomlabs.com</a>
          </div>
          <p className="mt-6 text-base text-primary-foreground/85">© {new Date().getFullYear()} {BRAND.legalName}</p>
        </div>
      </footer>
    </main>
  );
}
