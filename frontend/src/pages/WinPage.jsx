import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, ArrowUpRight, Check, Loader2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { getAffiliateRef } from "@/lib/affiliate";
import SeoHead from "@/components/SeoHead";
import { trackEvent } from "@/components/Analytics";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PDF_URL = "/Bloom-DevLabs-Showcase-Book-2026-A4.pdf";
const DRAW_AT = new Date("2026-11-30T00:00:00");
const DRAW_LABEL = "November 30, 2026";

const CHANNELS = ["WhatsApp", "Instagram", "Facebook", "Web chat", "Other"];

const ABILITIES = [
  ["Sells", "Qualifies leads and closes."],
  ["Books", "Appointments, right in the chat."],
  ["Understands", "Voice notes and photos."],
  ["Remembers", "Every customer's history."],
  ["Follows up", "So no lead goes cold."],
  ["Never sleeps", "Replies in seconds, 24/7."],
];

const STEPS = [
  ["Scan and sign up.", "Leave your name, business and contact details."],
  ["Join the draw.", `The winner is drawn on ${DRAW_LABEL}.`],
  ["Win, then get audited.", "We audit your systems and set BloomConnect up around them."],
];

const SPREADS = [
  { src: "/showcase/page-06.jpg", alt: "BloomConnect product page from the Bloom DevLabs showcase book", caption: "BloomConnect" },
  { src: "/showcase/page-04.jpg", alt: "Showcase book page: what Bloom builds", caption: "What we build" },
  { src: "/showcase/page-09.jpg", alt: "Showcase book page: selected client work", caption: "Selected work" },
  { src: "/showcase/page-10.jpg", alt: "Showcase book page: how we work and packages", caption: "How we work" },
];

const FAQ = [
  ["Is it really free?", "Yes. Entering costs nothing, and the prize is a lifetime BloomConnect account with no renewals."],
  ["When is the winner drawn?", `On ${DRAW_LABEL}. One winner is drawn from every entry.`],
  ["What do I have to do if I win?", "Complete a Bloom DevLabs systems audit. We look at how your business runs today, then set BloomConnect up around your systems."],
  ["Which chats does it work on?", "WhatsApp, Instagram, Facebook and web chat, and more on top of that."],
  ["How will I know if I won?", "We contact the winner using the email and phone number on the entry. Everyone who enters gets a confirmation email."],
  ["Can I enter more than once?", "One entry per email address."],
];

const entrySchema = z.object({
  name: z.string().trim().min(1, "Tell us your name."),
  business: z.string().trim().min(1, "Tell us your business name."),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z.string().trim().min(7, "Enter a phone number we can reach."),
  channel: z.enum(CHANNELS, { errorMap: () => ({ message: "Pick the chat you use most." }) }),
  consent: z.literal(true, { errorMap: () => ({ message: "Please agree so we can contact the winner." }) }),
  website: z.string().optional(),
});

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
      className={`transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      } ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

function useCountdown() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const ms = Math.max(0, DRAW_AT.getTime() - now);
  return {
    done: ms === 0,
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms / 3600000) % 24),
    minutes: Math.floor((ms / 60000) % 60),
    seconds: Math.floor((ms / 1000) % 60),
  };
}

/** The flyer's stamp, made bigger: a lime disc that carries the live countdown. */
function StampDisc() {
  const t = useCountdown();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    <div
      className="relative aspect-square w-[min(88vw,560px)] lg:w-[min(40vw,620px)] rounded-full bg-[#D4F53C] text-[#0B0B0B] flex items-center justify-center"
      data-testid="win-stamp"
    >
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 h-full w-full motion-safe:animate-[win-spin_40s_linear_infinite]"
        aria-hidden="true"
      >
        <defs>
          <path id="win-ring" d="M100,100 m-82,0 a82,82 0 1,1 164,0 a82,82 0 1,1 -164,0" />
        </defs>
        <text fontSize="13" fontWeight="800" fill="#0B0B0B" letterSpacing="2.2">
          <textPath href="#win-ring">FREE FOR LIFETIME · NO RENEWALS · FREE FOR LIFETIME · NO RENEWALS · </textPath>
        </text>
      </svg>
      <div className="relative text-center px-6">
        {t && !t.done ? (
          <>
            <p className="font-display font-extrabold leading-[0.85] tracking-[-0.045em] text-[clamp(4.5rem,15vw,11rem)] tabular-nums" data-testid="win-days">
              {t.days}
            </p>
            <p className="font-display font-bold text-xl sm:text-3xl tracking-[-0.02em] mt-1">
              {t.days === 1 ? "day" : "days"} to the draw
            </p>
            <p className="mt-3 text-base sm:text-lg font-medium tabular-nums">
              {pad(t.hours)}h {pad(t.minutes)}m {pad(t.seconds)}s
            </p>
          </>
        ) : (
          <>
            <p className="font-display font-extrabold leading-[0.9] tracking-[-0.04em] text-[clamp(2.5rem,8vw,6rem)]">
              {t?.done ? "Draw day." : "Nov 30."}
            </p>
            <p className="mt-3 text-base sm:text-lg font-medium">{DRAW_LABEL}</p>
          </>
        )}
      </div>
    </div>
  );
}

/** A real interface fragment of BloomConnect booking an appointment. */
function ChatFragment() {
  const msgs = [
    { me: false, text: "May slot pa po this Saturday?" },
    { me: true, text: "Yes po! 10:00 AM or 2:30 PM. Which works for you?" },
    { me: false, text: "2:30 PM po!" },
    { me: true, text: "Booked! Saturday · 2:30 PM", strong: true },
  ];
  return (
    <div data-ui className="rounded-3xl bg-[#141414] text-white p-5 sm:p-7 w-full max-w-[460px]">
      <div className="flex items-center gap-3 mb-6">
        <span className="h-11 w-11 rounded-full bg-[#2E7D4F]" aria-hidden="true" />
        <div>
          <p className="font-semibold leading-tight">Your Business</p>
          <p className="text-sm text-white/70 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#4ADE80]" aria-hidden="true" /> Online 24/7
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {msgs.map((m, i) => (
          <div
            key={m.text}
            style={{ animationDelay: `${0.4 + i * 0.9}s` }}
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-base leading-snug motion-safe:animate-[win-pop_0.5s_ease-out_both] ${
              m.me
                ? m.strong
                  ? "self-end bg-white text-[#0B0B0B] font-semibold"
                  : "self-end bg-[#2E7D4F] text-white"
                : "self-start bg-[#262626] text-white"
            }`}
          >
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Jagged paper edge, the same cut as the flyer's black-to-lime break. */
function TornEdge({ className = "" }) {
  const d = useMemo(() => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const pts = ["0,100"];
    for (let x = 0; x <= 1000; x += 10) pts.push(`${x},${Math.round(15 + rnd() * 70)}`);
    pts.push("1000,100");
    return pts.join(" ");
  }, []);
  return (
    <svg
      viewBox="0 0 1000 100"
      preserveAspectRatio="none"
      className={`block w-full h-6 sm:h-10 ${className}`}
      aria-hidden="true"
    >
      <polygon points={d} fill="currentColor" />
    </svg>
  );
}

function Field({ id, label, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-base font-semibold mb-2">
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-2 text-base font-medium text-[#0B0B0B] bg-white px-3 py-1.5" role="alert" data-testid={`win-error-${id}`}>
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls =
  "w-full h-14 px-4 text-lg bg-white text-[#0B0B0B] placeholder:text-[#0B0B0B]/50 rounded-none outline-none focus-visible:ring-4 focus-visible:ring-[#0B0B0B] transition-shadow";

function EntryForm() {
  const [done, setDone] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(entrySchema),
    defaultValues: { name: "", business: "", email: "", phone: "", channel: "", consent: false, website: "" },
  });

  const onSubmit = async (values) => {
    const params = new URLSearchParams(window.location.search);
    const utm = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((k) => {
      if (params.get(k)) utm[k] = params.get(k);
    });
    try {
      const { data } = await axios.post(`${API}/win/enter`, {
        ...values,
        source_url: window.location.href,
        utm,
        affiliate_ref: getAffiliateRef() || undefined,
      });
      trackEvent("win_entry", { channel: values.channel, repeat: !!data?.already_entered });
      setDone({ name: values.name.split(" ")[0], email: values.email, repeat: !!data?.already_entered });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Something went wrong. Please try again.");
    }
  };

  if (done) {
    return (
      <div className="bg-[#0B0B0B] text-white p-8 sm:p-12" data-testid="win-success" role="status">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#D4F53C] text-[#0B0B0B]">
          <Check className="h-7 w-7" />
        </span>
        <h3 className="font-display font-bold text-4xl sm:text-5xl leading-[0.98] tracking-[-0.03em] mt-6">
          {done.repeat ? `You're already in, ${done.name}.` : `You're in, ${done.name}.`}
        </h3>
        <p className="mt-4 text-lg sm:text-xl text-white/90 max-w-[34rem]">
          The draw is on {DRAW_LABEL}. We'll contact the winner at {done.email}. Want a head start? Book a call and
          see what BloomConnect would do for your business.
        </p>
        <a
          href={BRAND.tidycal}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackEvent("win_book_call")}
          className="mt-8 inline-flex h-14 items-center gap-2 rounded-full bg-[#D4F53C] px-8 text-lg font-bold text-[#0B0B0B] transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
          data-testid="win-success-book"
        >
          Book a discovery call <ArrowUpRight className="h-5 w-5" />
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-6" data-testid="win-form">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="name" label="Your name" error={errors.name?.message}>
          <input id="name" autoComplete="name" className={inputCls} placeholder="Juan Dela Cruz" {...register("name")} data-testid="win-input-name" />
        </Field>
        <Field id="business" label="Business name" error={errors.business?.message}>
          <input id="business" autoComplete="organization" className={inputCls} placeholder="Your business" {...register("business")} data-testid="win-input-business" />
        </Field>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="email" label="Email" error={errors.email?.message}>
          <input id="email" type="email" autoComplete="email" inputMode="email" className={inputCls} placeholder="you@business.com" {...register("email")} data-testid="win-input-email" />
        </Field>
        <Field id="phone" label="Phone or WhatsApp" error={errors.phone?.message}>
          <input id="phone" type="tel" autoComplete="tel" inputMode="tel" className={inputCls} placeholder="+63 900 000 0000" {...register("phone")} data-testid="win-input-phone" />
        </Field>
      </div>
      <Field id="channel" label="Which chat do your customers message you on most?" error={errors.channel?.message}>
        <select id="channel" className={inputCls} defaultValue="" {...register("channel")} data-testid="win-input-channel">
          <option value="" disabled>
            Choose one
          </option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      {/* Honeypot: hidden from people, tempting to bots. */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>

      <div>
        <label className="flex items-start gap-3 text-base sm:text-lg cursor-pointer" htmlFor="consent">
          <input
            id="consent"
            type="checkbox"
            className="mt-1 h-6 w-6 shrink-0 accent-[#0B0B0B]"
            {...register("consent")}
            data-testid="win-input-consent"
          />
          <span>
            I agree to be contacted about the draw. If I win, I'll complete a Bloom DevLabs systems audit to claim the prize.
          </span>
        </label>
        {errors.consent && (
          <p className="mt-2 text-base font-medium bg-white px-3 py-1.5 inline-block" role="alert" data-testid="win-error-consent">
            {errors.consent.message}
          </p>
        )}
      </div>

      <div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-16 items-center justify-center gap-3 rounded-full bg-[#0B0B0B] px-10 text-xl font-bold text-[#D4F53C] transition-transform hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white w-full sm:w-auto"
          data-testid="win-submit"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Entering
            </>
          ) : (
            <>
              Enter the draw <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>
        <p className="mt-4 text-base">Free to join. One entry per email.</p>
      </div>
    </form>
  );
}

export default function WinPage() {
  const scrollToForm = () => trackEvent("win_cta_click");
  return (
    <main className="bg-[#0B0B0B] text-white font-sans" data-testid="win-page">
      <style>{`
        @keyframes win-spin { to { transform: rotate(360deg); } }
        @keyframes win-pop { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: none; } }
        @keyframes win-drift { 0%,100% { transform: translateY(0) rotate(-1.5deg); } 50% { transform: translateY(-10px) rotate(-1.5deg); } }
        html { scroll-behavior: smooth; }
        @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
      `}</style>
      <SeoHead
        title="Win a lifetime BloomConnect account | Bloom Labs"
        description={`Enter free to win a lifetime BloomConnect account, the AI sales agent that replies, sells and books appointments in your chats 24/7. Winner drawn ${DRAW_LABEL}.`}
        url="https://bybloomlabs.com/win"
      />

      {/* Bar */}
      <header className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-5 sm:px-8">
        <a href="/" aria-label="Bloom Labs home">
          <img src={BRAND.logos.fullLight} alt="Bloom Labs" className="h-9 sm:h-11 w-auto" />
        </a>
        <a
          href="#enter"
          onClick={scrollToForm}
          className="inline-flex h-11 items-center rounded-full bg-[#D4F53C] px-6 text-base font-bold text-[#0B0B0B] transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
          data-testid="win-nav-enter"
        >
          Enter the draw
        </a>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden pb-20 sm:pb-28">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-8 pt-8 sm:pt-14">
          <Reveal as="h1" className="font-display font-extrabold uppercase text-[#D4F53C] text-[clamp(1.4rem,6.2vw,7rem)] leading-[0.92] tracking-[-0.035em]" data-testid="win-headline">
            Win BloomConnect
            <br />
            for life.
          </Reveal>
        </div>
        <div className="mx-auto mt-10 grid max-w-[1440px] items-center gap-12 px-4 sm:px-8 lg:mt-10 lg:grid-cols-[1fr_auto]">
          <div className="max-w-[40rem]">
            <Reveal delay={90} as="p" className="font-display text-2xl sm:text-4xl leading-[1.1] tracking-[-0.02em] font-semibold">
              Your best salesperson could be free.
            </Reveal>
            <Reveal delay={160} as="p" className="mt-6 text-lg sm:text-xl text-white/90">
              BloomConnect is an AI sales agent that replies, sells and books appointments in your chats, 24/7. One
              lifetime account, no renewals. Joining is free.
            </Reveal>
            <Reveal delay={230} className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href="#enter"
                onClick={scrollToForm}
                className="inline-flex h-16 items-center gap-3 rounded-full bg-[#D4F53C] px-10 text-xl font-bold text-[#0B0B0B] transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
                data-testid="win-hero-cta"
              >
                Enter the draw <ArrowRight className="h-5 w-5" />
              </a>
              <span className="text-lg font-medium">Draw on {DRAW_LABEL}</span>
            </Reveal>
          </div>
          <Reveal delay={200} className="justify-self-center lg:justify-self-end lg:-mr-[6vw] lg:-mt-28">
            <StampDisc />
          </Reveal>
        </div>
      </section>

      {/* What you win */}
      <section className="bg-[#D4F53C] text-[#0B0B0B]">
        <div className="mx-auto grid max-w-[1440px] gap-14 px-4 py-20 sm:px-8 sm:py-32 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
          <div>
            <Reveal as="h2" className="font-display font-extrabold text-4xl sm:text-6xl lg:text-7xl leading-[0.96] tracking-[-0.035em]">
              An AI sales agent that never sleeps.
            </Reveal>
            <Reveal delay={90} as="p" className="mt-6 text-lg sm:text-xl max-w-[36rem]">
              Every message you miss at night is a customer who buys from someone else. BloomConnect answers in
              seconds, in your customer's language.
            </Reveal>
            <dl className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {ABILITIES.map(([t, d], i) => (
                <Reveal key={t} delay={i * 70} className="bg-[#0B0B0B] text-white p-6">
                  <dt className="font-display font-bold text-2xl tracking-[-0.02em]">{t}</dt>
                  <dd className="mt-1 text-lg text-white/90">{d}</dd>
                </Reveal>
              ))}
            </dl>
          </div>
          <div className="flex flex-col items-start gap-8 lg:items-end lg:pt-6">
            <Reveal delay={120} className="w-full flex lg:justify-end">
              <ChatFragment />
            </Reveal>
            <Reveal delay={200} className="w-full max-w-[460px]">
              <p className="font-display font-bold text-2xl tracking-[-0.02em]">Works on</p>
              <ul className="mt-4 flex flex-wrap gap-3">
                {["WhatsApp", "Instagram", "Facebook", "Web chat", "and more"].map((c) => (
                  <li key={c} className="rounded-full bg-[#0B0B0B] px-5 py-2.5 text-base font-semibold text-[#D4F53C]">
                    {c}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* How it works + showcase pictures */}
      <section>
        <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-8 sm:py-32">
          <Reveal as="h2" className="font-display font-extrabold text-4xl sm:text-6xl lg:text-7xl leading-[0.96] tracking-[-0.035em] text-[#D4F53C]">
            Three steps. Zero cost.
          </Reveal>
          <ol className="mt-14 grid gap-12 lg:grid-cols-3 lg:gap-10">
            {STEPS.map(([t, d], i) => (
              <Reveal as="li" key={t} delay={i * 110} className="bg-[#1A1A1A] p-8 sm:p-10 min-h-[15rem]">
                <p className="font-display font-bold text-3xl sm:text-4xl leading-[1.02] tracking-[-0.03em] text-white">{t}</p>
                <p className="mt-4 text-lg sm:text-xl text-white/90">{d}</p>
              </Reveal>
            ))}
          </ol>

          <div className="mt-28 sm:mt-40 grid gap-10 lg:grid-cols-[1fr_2fr] lg:items-end">
            <Reveal>
              <h3 className="font-display font-bold text-3xl sm:text-5xl leading-[0.98] tracking-[-0.03em]">
                Meet your auditors.
              </h3>
              <p className="mt-5 text-lg sm:text-xl text-white/90 max-w-[30rem]">
                The winner's audit is run by Bloom DevLabs, the studio behind these pages. We build AI-native web apps on
                fixed prices. Here's the book of what we make.
              </p>
              <a
                href={PDF_URL}
                download
                onClick={() => trackEvent("win_showcase_download")}
                className="mt-8 inline-flex h-14 items-center gap-2 rounded-full bg-white px-8 text-lg font-bold text-[#0B0B0B] transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
                data-testid="win-download-book"
              >
                Download the showcase book <ArrowUpRight className="h-5 w-5" />
              </a>
            </Reveal>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {SPREADS.map((s, i) => (
                <Reveal key={s.src} delay={i * 80} className={i % 2 ? "sm:translate-y-8" : ""}>
                  <figure className="transition-transform duration-300 hover:-translate-y-1">
                    <img src={s.src} alt={s.alt} width="640" height="905" loading="lazy" className="h-auto w-full bg-[#1A1A1A]" />
                    <figcaption className="mt-3 text-base font-medium text-white/90">{s.caption}</figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Entry form */}
      <section id="enter" className="relative scroll-mt-0 text-[#D4F53C]">
        <TornEdge className="text-[#D4F53C] -mb-px" />
        <div className="bg-[#D4F53C] text-[#0B0B0B]">
          <div className="mx-auto grid max-w-[1440px] gap-14 px-4 py-16 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1.25fr] lg:gap-20">
            <div>
              <Reveal as="h2" className="font-display font-extrabold text-5xl sm:text-7xl lg:text-8xl leading-[0.92] tracking-[-0.04em]">
                Enter the draw.
              </Reveal>
              <Reveal delay={90} as="p" className="mt-6 text-xl sm:text-2xl font-medium max-w-[28rem]">
                Free to join. Takes a minute. Winner drawn {DRAW_LABEL}.
              </Reveal>
              <Reveal delay={160} as="p" className="mt-4 text-lg max-w-[28rem]">
                You'll get a confirmation email right away.
              </Reveal>
            </div>
            <Reveal delay={120} className="relative">
              <EntryForm />
            </Reveal>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section>
        <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-8 sm:py-32">
          <Reveal as="h2" className="font-display font-extrabold text-4xl sm:text-6xl leading-[0.96] tracking-[-0.035em] text-[#D4F53C]">
            The fine print, plainly.
          </Reveal>
          <dl className="mt-14 grid gap-x-16 gap-y-12 md:grid-cols-2">
            {FAQ.map(([q, a], i) => (
              <Reveal key={q} delay={(i % 2) * 90}>
                <dt className="font-display font-bold text-2xl sm:text-3xl tracking-[-0.02em]">{q}</dt>
                <dd className="mt-3 text-lg sm:text-xl text-white/90 max-w-[34rem]">{a}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* Footer: the name returns at full width */}
      <footer className="overflow-hidden bg-[#D4F53C] text-[#0B0B0B]">
        <div className="mx-auto max-w-[1440px] px-4 pt-16 sm:px-8 sm:pt-24">
          <p className="max-w-[46rem] text-base sm:text-lg">
            Draw on {DRAW_LABEL}. Prize: one lifetime BloomConnect account. The winner must complete a Bloom DevLabs
            systems audit to claim the prize. Full mechanics at bybloomlabs.com/win.
          </p>
          <p className="mt-6 text-base">
            Questions? <a className="font-bold underline underline-offset-4" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
          </p>
        </div>
        <p
          className="mt-10 whitespace-nowrap px-2 text-center font-display font-extrabold leading-[0.8] tracking-[-0.05em] text-[clamp(4rem,21vw,20rem)] translate-y-[0.06em]"
          aria-hidden="true"
        >
          bloom
        </p>
      </footer>
    </main>
  );
}
