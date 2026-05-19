/**
 * Shared layout for the /gym-owners landing-page ecosystem.
 *
 * Sticky header with the 4-page nav + a persistent CTA. Footer with
 * Bloom Labs contact info. Mobile drawer collapses the nav cleanly.
 */
import { Link, NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import { ArrowRight, Menu, X, Dumbbell, Calendar, Mail, Phone, ChevronRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import ExitIntentModal from "../shared/ExitIntentModal";
import SeoHead from "@/components/SeoHead";
import RelatedLinks from "@/components/RelatedLinks";

const NAV = [
  { to: "/gym-owners", label: "Overview", end: true },
  { to: "/gym-owners/how-it-works", label: "How It Works" },
  { to: "/gym-owners/process", label: "Our Process" },
  { to: "/gym-owners/results", label: "Results" },
];

export function GymHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header
      className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200"
      data-testid="gym-header"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        <Link
          to="/gym-owners"
          className="flex items-center gap-2 group"
          data-testid="gym-header-logo"
        >
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-700 to-emerald-500 grid place-items-center text-white">
            <Dumbbell className="h-5 w-5" strokeWidth={2.4} />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-sm text-slate-900">Bloom DevLabs</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-600 font-medium">
              For Gym Owners
            </div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={`gym-nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) =>
                `px-3.5 py-2 text-sm rounded-md transition-colors ${
                  isActive
                    ? "text-blue-800 font-semibold bg-blue-50"
                    : "text-slate-700 hover:text-blue-800 hover:bg-slate-50"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={BRAND.tidycal}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="gym-header-cta"
            className="hidden sm:inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-md transition shadow-sm"
          >
            <Calendar className="h-4 w-4" />
            Book Discovery Call
          </a>
          <button
            className="md:hidden p-2 rounded-md text-slate-700 hover:bg-slate-100"
            onClick={() => setOpen((s) => !s)}
            data-testid="gym-mobile-menu-toggle"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-slate-200 bg-white" data-testid="gym-mobile-menu">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `block px-6 py-3 text-sm border-b border-slate-100 ${
                  isActive ? "text-blue-800 font-semibold bg-blue-50" : "text-slate-700"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
          <a
            href={BRAND.tidycal}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-6 py-3 text-sm font-semibold text-orange-600"
          >
            Book Discovery Call →
          </a>
        </div>
      )}
    </header>
  );
}

export function GymBreadcrumb({ label }) {
  return (
    <div className="bg-slate-50 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-3 flex items-center gap-2 text-xs text-slate-500">
        <Link to="/" className="hover:text-blue-700">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link to="/gym-owners" className="hover:text-blue-700">Gym Owners</Link>
        {label && (
          <>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-900 font-medium">{label}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function GymFooter() {
  return (
    <footer className="bg-slate-950 text-slate-300" data-testid="gym-footer">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-500 grid place-items-center text-white">
                <Dumbbell className="h-5 w-5" />
              </div>
              <span className="text-white font-semibold">Bloom DevLabs · For Gym Owners</span>
            </div>
            <p className="text-sm text-slate-400 max-w-md leading-relaxed">
              Custom member-management software for gym owners — built in 3 weeks,
              automates follow-ups, and recovers $2K-$4K/month in would-be cancellations.
            </p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-3">Explore</div>
            <ul className="space-y-2 text-sm">
              {NAV.map((n) => (
                <li key={n.to}>
                  <Link to={n.to} className="hover:text-white transition">{n.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-3">Contact</div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-500" />
                <a href={`mailto:${BRAND.email}`} className="hover:text-white">{BRAND.email}</a>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-500" />
                <a href={`tel:${BRAND.phoneHref}`} className="hover:text-white">{BRAND.phone}</a>
              </li>
              <li>
                <a
                  href={BRAND.tidycal}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 font-semibold"
                >
                  Book a call <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-6 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} {BRAND.legalName}. All rights reserved.</span>
          <Link to="/" className="hover:text-white">← back to bybloomlabs.com</Link>
        </div>
      </div>
    </footer>
  );
}

/**
 * Default export — wrap any gym-page content in a consistent shell.
 */
export default function GymLayout({ breadcrumb, seo, children }) {
  // Auto-scroll to top on route change.
  const { pathname } = useLocation();
  if (typeof window !== "undefined") {
    // Defer to next tick so the route mount finishes first.
    setTimeout(() => window.scrollTo({ top: 0, behavior: "instant" }), 0);
  }
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased" key={pathname}>
      {seo && <SeoHead {...seo} />}
      <GymHeader />
      <GymBreadcrumb label={breadcrumb} />
      <main>{children}</main>
      <RelatedLinks />
      <GymFooter />
      <ExitIntentModal variant="gym" />
    </div>
  );
}
