/**
 * Header — Phase H Mega Menu redesign.
 *
 * Full-width 3-category mega menu (Platform · Resources · Work) with
 * rich descriptions, icons, and a featured CTA per column. Falls back to
 * a clean drawer on mobile.
 */
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetHeader,
} from "@/components/ui/sheet";
import {
  Menu,
  Calendar,
  LogIn,
  User,
  ChevronDown,
  Sparkles,
  TrendingUp,
  FileSignature,
  Workflow,
  PenLine,
  BookOpen,
  PlayCircle,
  HelpCircle,
  Briefcase,
  ArrowRight,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { useClientAuth } from "@/lib/clientAuth";

// --------------------------------------------------------------------------
// Mega menu data model
// --------------------------------------------------------------------------
const MEGA_GROUPS = [
  {
    id: "platform",
    label: "Platform",
    columns: [
      {
        heading: "What we ship",
        items: [
          {
            id: "problem",
            icon: TrendingUp,
            label: "The Problem we solve",
            description: "Why generic agencies stall growth.",
            href: "/#problem",
          },
          {
            id: "solution",
            icon: Workflow,
            label: "Our Solution",
            description: "The 4-pillar Bloom Labs system.",
            href: "/#solution",
          },
          {
            id: "how-we-work",
            icon: PenLine,
            label: "How we work",
            description: "From discovery to live in 8 weeks.",
            href: "/#how-we-work",
          },
        ],
      },
      {
        heading: "Tools",
        items: [
          {
            id: "breezedocs",
            icon: FileSignature,
            label: "BreezeDocs Proposals",
            description: "AI-signed scope-of-work in 24 hours.",
            href: "/#solution",
          },
          {
            id: "ai-brief",
            icon: Sparkles,
            label: "AI Project Brief",
            description: "Onboarding turns into a signed brief.",
            href: "/#solution",
          },
        ],
      },
    ],
    featured: {
      eyebrow: "Try the platform",
      title: "Walk through a live demo",
      description: "60-second click-through of a real Bloom Labs engagement.",
      cta: "See it live →",
      to: "/tour",
      testid: "mega-featured-tour",
    },
  },
  {
    id: "resources",
    label: "Resources",
    columns: [
      {
        heading: "Learn",
        items: [
          {
            id: "blog",
            icon: BookOpen,
            label: "Blog",
            description: "Playbooks for founder-led growth.",
            href: "/blog",
            type: "route",
          },
          {
            id: "case-studies",
            icon: Briefcase,
            label: "Case Studies",
            description: "Real client wins — full numbers.",
            href: "/case-studies",
            type: "route",
          },
        ],
      },
      {
        heading: "Pricing & FAQ",
        items: [
          {
            id: "pricing",
            icon: TrendingUp,
            label: "Pricing",
            description: "Two tiers, monthly billing, no surprises.",
            href: "/#pricing",
          },
          {
            id: "faq",
            icon: HelpCircle,
            label: "FAQ",
            description: "Answers to the most common questions.",
            href: "/#faq",
          },
        ],
      },
    ],
    featured: {
      eyebrow: "Watch first",
      title: "2-minute platform demo",
      description: "Quick walkthrough of every dashboard you'll get.",
      cta: "Play demo →",
      to: "/tour",
      testid: "mega-featured-demo",
    },
  },
  {
    id: "work",
    label: "Work",
    columns: [
      {
        heading: "Selected projects",
        items: [
          {
            id: "case-studies-feature",
            icon: Briefcase,
            label: "All case studies",
            description: "Browse every published engagement.",
            href: "/case-studies",
            type: "route",
          },
          {
            id: "sandbox-tour",
            icon: PlayCircle,
            label: "Live sandbox",
            description: "Anonymous, no signup — explore the system.",
            href: "/tour",
            type: "route",
          },
        ],
      },
    ],
    featured: {
      eyebrow: "Ready to brief us?",
      title: "Book a 30-min Discovery call",
      description: "We diagnose, scope, and price within the same hour.",
      cta: "Book a call →",
      to: "/#book",
      testid: "mega-featured-book",
    },
  },
];

// Flat list for mobile drawer.
const MOBILE_ITEMS = [
  { id: "problem", label: "Problem", type: "anchor" },
  { id: "solution", label: "Solution", type: "anchor" },
  { id: "pricing", label: "Pricing", type: "anchor" },
  { id: "case-studies", label: "Case Studies", type: "route", to: "/case-studies" },
  { id: "tour", label: "See it live", type: "route", to: "/tour" },
  { id: "blog", label: "Blog", type: "route", to: "/blog" },
  { id: "how-we-work", label: "How We Work", type: "anchor" },
  { id: "faq", label: "FAQ", type: "anchor" },
];

// --------------------------------------------------------------------------
// Components
// --------------------------------------------------------------------------
function MegaPanel({ group, onClose }) {
  return (
    <div
      className="absolute left-0 right-0 top-full bg-background border-b border-border shadow-[0_10px_30px_-15px_rgba(15,23,42,0.18)] animate-in fade-in-0 slide-in-from-top-1 z-40"
      data-testid={`mega-panel-${group.id}`}
      onMouseEnter={() => {}}
    >
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
          {group.columns.map((col, idx) => (
            <div key={`${group.id}-col-${idx}`}>
              <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-muted-foreground mb-3">
                {col.heading}
              </p>
              <ul className="space-y-3">
                {col.items.map((item) => {
                  const Icon = item.icon;
                  const linkProps =
                    item.type === "route"
                      ? { as: Link, to: item.href }
                      : { as: "a", href: item.href };
                  const Component = item.type === "route" ? Link : "a";
                  return (
                    <li key={item.id}>
                      <Component
                        {...(item.type === "route"
                          ? { to: item.href }
                          : { href: item.href })}
                        onClick={onClose}
                        className="group flex gap-3 items-start rounded-lg p-2 -m-2 hover:bg-secondary/40 transition-colors"
                        data-testid={`mega-link-${item.id}`}
                      >
                        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-snug">{item.label}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </Component>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {group.featured && (
          <div className="col-span-12 lg:col-span-4 rounded-xl bg-gradient-to-br from-primary/10 via-blue-50 to-emerald-50/40 border border-primary/15 p-5 flex flex-col">
            <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-primary">
              {group.featured.eyebrow}
            </p>
            <h3 className="font-display text-lg font-semibold mt-1.5 leading-tight">
              {group.featured.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1.5">
              {group.featured.description}
            </p>
            <div className="mt-auto pt-4">
              {group.featured.to?.startsWith("/#") ? (
                <a
                  href={group.featured.to}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:gap-2 transition-all"
                  data-testid={group.featured.testid}
                >
                  {group.featured.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              ) : (
                <Link
                  to={group.featured.to}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:gap-2 transition-all"
                  data-testid={group.featured.testid}
                >
                  {group.featured.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeMega, setActiveMega] = useState(null);
  const { token, client } = useClientAuth();
  const navigate = useNavigate();
  const closeTimer = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const clientLoggedIn = !!token;

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setActiveMega(null), 140);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  return (
    <header
      data-testid="header"
      className={`sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 transition-shadow ${
        scrolled
          ? "shadow-[0_1px_0_rgba(15,23,42,0.06)] border-b border-border"
          : "border-b border-transparent"
      }`}
      onMouseLeave={scheduleClose}
    >
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        <a
          href="#top"
          className="flex items-center gap-2 flex-shrink-0"
          data-testid="header-logo-link"
          aria-label="Bloom Labs home"
        >
          <img
            src={BRAND.logos.fullDark}
            alt="Bloom Labs"
            className="h-7 sm:h-8 w-auto select-none"
            draggable="false"
          />
        </a>

        <nav className="hidden lg:flex items-center gap-1" aria-label="Primary">
          {MEGA_GROUPS.map((g) => {
            const active = activeMega === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onMouseEnter={() => {
                  cancelClose();
                  setActiveMega(g.id);
                }}
                onFocus={() => setActiveMega(g.id)}
                onClick={() => setActiveMega(active ? null : g.id)}
                className={`inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "text-foreground bg-secondary/60"
                    : "text-foreground/80 hover:text-foreground hover:bg-secondary/40"
                }`}
                aria-expanded={active}
                aria-controls={`mega-panel-${g.id}`}
                data-testid={`mega-trigger-${g.id}`}
              >
                {g.label}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${active ? "rotate-180" : ""}`}
                />
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {clientLoggedIn ? (
            <Button
              asChild
              variant="outline"
              className="hidden lg:inline-flex h-10 px-4 border-[#1E3A8A]/30 text-[#1E3A8A] hover:bg-[#1E3A8A]/5"
              data-testid="header-portal-button"
            >
              <Link to="/portal">
                <User className="h-4 w-4 mr-2" />
                {(client?.name || "My").split(" ")[0]} → Portal
              </Link>
            </Button>
          ) : (
            <Button
              asChild
              variant="outline"
              className="hidden lg:inline-flex h-10 px-4 border-[#1E3A8A]/30 text-[#1E3A8A] hover:bg-[#1E3A8A]/5"
              data-testid="header-client-login-button"
            >
              <Link to="/login">
                <LogIn className="h-4 w-4 mr-2" />
                Client Login
              </Link>
            </Button>
          )}
          <Button
            asChild
            className="hidden lg:inline-flex bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-10 px-5"
            data-testid="header-book-call-button"
          >
            <a href="#book">
              <Calendar className="h-4 w-4 mr-2" />
              Book a Discovery Call
            </a>
          </Button>

          {/* Mobile */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open menu"
                data-testid="mobile-menu-open-button"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-80 sm:w-96"
              data-testid="mobile-menu-sheet"
            >
              <SheetHeader>
                <SheetTitle className="text-left">Menu</SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-1">
                {MOBILE_ITEMS.map((item) =>
                  item.type === "route" ? (
                    <Link
                      key={item.id}
                      to={item.to}
                      className="text-base text-foreground/85 hover:text-foreground py-2.5 px-2 rounded-md hover:bg-secondary/40 transition-colors"
                      onClick={() => setOpen(false)}
                      data-testid={`mobile-nav-${item.id}-link`}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <a
                      key={item.id}
                      href={`/#${item.id}`}
                      className="text-base text-foreground/85 hover:text-foreground py-2.5 px-2 rounded-md hover:bg-secondary/40 transition-colors"
                      onClick={() => setOpen(false)}
                      data-testid={`mobile-nav-${item.id}-link`}
                    >
                      {item.label}
                    </a>
                  )
                )}
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  {clientLoggedIn ? (
                    <Button
                      asChild
                      variant="outline"
                      className="w-full justify-start border-[#1E3A8A]/30 text-[#1E3A8A]"
                      onClick={() => setOpen(false)}
                    >
                      <Link to="/portal">
                        <User className="h-4 w-4 mr-2" />
                        My Portal
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      asChild
                      variant="outline"
                      className="w-full justify-start border-[#1E3A8A]/30 text-[#1E3A8A]"
                      onClick={() => setOpen(false)}
                    >
                      <Link to="/login">
                        <LogIn className="h-4 w-4 mr-2" />
                        Client Login
                      </Link>
                    </Button>
                  )}
                  <Button
                    asChild
                    className="w-full bg-[#1E3A8A] hover:bg-[#1A3278]"
                    onClick={() => setOpen(false)}
                  >
                    <a href="#book">
                      <Calendar className="h-4 w-4 mr-2" />
                      Book a Discovery Call
                    </a>
                  </Button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Mega panel */}
      {activeMega && (
        <div onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
          <MegaPanel
            group={MEGA_GROUPS.find((g) => g.id === activeMega)}
            onClose={() => setActiveMega(null)}
          />
        </div>
      )}
    </header>
  );
};

export default Header;
