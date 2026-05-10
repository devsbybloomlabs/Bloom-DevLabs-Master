import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  Phone,
  Linkedin,
  Twitter,
  Instagram,
  Facebook,
  Youtube,
} from "lucide-react";
import { BRAND } from "@/lib/brand";

const SOCIALS = [
  { key: "linkedin", label: "LinkedIn", icon: Linkedin, href: BRAND.social.linkedin },
  { key: "twitter", label: "Twitter / X", icon: Twitter, href: BRAND.social.twitter },
  { key: "instagram", label: "Instagram", icon: Instagram, href: BRAND.social.instagram },
  { key: "facebook", label: "Facebook", icon: Facebook, href: BRAND.social.facebook },
  { key: "youtube", label: "YouTube", icon: Youtube, href: BRAND.social.youtube },
];

const LINKS = [
  { label: "Problem", href: "#problem" },
  { label: "Solution", href: "#solution" },
  { label: "Pricing", href: "#pricing" },
  { label: "Case Studies", href: "#case-studies" },
  { label: "How We Work", href: "#how-we-work" },
  { label: "FAQ", href: "#faq" },
  { label: "Book a Call", href: "#book" },
];

// 5x click within 3s on the footer logo → /admin/login (hidden admin gate)
const ADMIN_GATE_CLICKS = 5;
const ADMIN_GATE_WINDOW_MS = 3000;

export const Footer = () => {
  const year = new Date().getFullYear();
  const navigate = useNavigate();
  const clicksRef = useRef([]);

  const onLogoClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    const recent = [...clicksRef.current, now].filter(
      (t) => now - t <= ADMIN_GATE_WINDOW_MS
    );
    clicksRef.current = recent;
    if (recent.length >= ADMIN_GATE_CLICKS) {
      clicksRef.current = [];
      // Hard navigate so any state weirdness is bypassed.
      navigate("/admin/login");
      window.setTimeout(() => {
        if (window.location.pathname !== "/admin/login") {
          window.location.assign("/admin/login");
        }
      }, 80);
    }
  };

  return (
    <footer data-testid="footer" className="bg-[var(--navy-950)] text-white">
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <button
              type="button"
              onClick={onLogoClick}
              aria-label="Bloom Labs"
              className="cursor-default focus:outline-none"
              data-testid="footer-logo-admin-gate"
            >
              <img
                src={BRAND.logos.fullLight}
                alt="Bloom Labs"
                className="h-9 w-auto select-none"
                draggable="false"
              />
            </button>
            <p className="mt-4 text-sm text-white/70 leading-relaxed max-w-md">
              {BRAND.tagline} &nbsp;Bloom Labs builds enterprise-grade custom
              web apps in 2&ndash;4 weeks at ~40% lower cost than traditional
              agencies.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {SOCIALS.map((s) => (
                <a
                  key={s.key}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  data-testid={`footer-social-${s.key}-link`}
                  className="h-9 w-9 rounded-lg border border-white/15 hover:border-white/40 hover:bg-white/5 transition-colors flex items-center justify-center text-white/80 hover:text-white"
                >
                  <s.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/50">
              Explore
            </div>
            <ul className="mt-4 space-y-2.5">
              {LINKS.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-sm text-white/80 hover:text-white transition-colors"
                    data-testid={`footer-link-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/50">
              Get in touch
            </div>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href={`mailto:${BRAND.email}`}
                  className="flex items-center gap-3 text-sm text-white/85 hover:text-white transition-colors"
                  data-testid="footer-email-link"
                >
                  <Mail className="h-4 w-4 text-[#3B82F6]" />
                  {BRAND.email}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${BRAND.phoneHref}`}
                  className="flex items-center gap-3 text-sm text-white/85 hover:text-white transition-colors"
                  data-testid="footer-phone-link"
                >
                  <Phone className="h-4 w-4 text-[#3B82F6]" />
                  {BRAND.phone}
                </a>
              </li>
            </ul>
            <a
              href="#book"
              data-testid="footer-book-call-cta"
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white text-sm font-medium h-10 px-4 transition-colors"
            >
              Book a Discovery Call →
            </a>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="text-xs text-white/55">
            © {year} {BRAND.legalName}. All rights reserved.
          </div>
          <div className="flex items-center gap-5 text-xs">
            <a
              href="#"
              className="text-white/55 hover:text-white transition-colors"
              data-testid="footer-privacy-link"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="text-white/55 hover:text-white transition-colors"
              data-testid="footer-terms-link"
            >
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
