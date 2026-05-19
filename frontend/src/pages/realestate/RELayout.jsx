/**
 * Shared layout for the /real-estate landing-page ecosystem.
 * Navy + amber palette (industry-standard real-estate visual cues).
 */
import { Link, NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { ArrowRight, Menu, X, Calendar, Mail, Phone, ChevronRight, Home } from "lucide-react";
import { BRAND } from "@/lib/brand";
import ExitIntentModal from "../shared/ExitIntentModal";
import SeoHead from "@/components/SeoHead";
import RelatedLinks from "@/components/RelatedLinks";

const NAV = [
  { to: "/real-estate", label: "Overview", end: true },
  { to: "/real-estate/how-it-works", label: "How It Works" },
  { to: "/real-estate/process", label: "Our Process" },
  { to: "/real-estate/results", label: "Results" },
];

export function REHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200" data-testid="re-header">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        <Link to="/real-estate" className="flex items-center gap-2" data-testid="re-header-logo">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-900 to-amber-500 grid place-items-center text-white">
            <Home className="h-5 w-5" strokeWidth={2.4} />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-sm text-slate-900">Bloom DevLabs</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-indigo-900 font-medium">
              For Real Estate Agents
            </div>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={`re-nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) =>
                `px-3.5 py-2 text-sm rounded-md transition-colors ${
                  isActive ? "text-indigo-900 font-semibold bg-indigo-50" : "text-slate-700 hover:text-indigo-900 hover:bg-slate-50"
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
            data-testid="re-header-cta"
            className="hidden sm:inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-md transition shadow-sm"
          >
            <Calendar className="h-4 w-4" />
            Book Walkthrough
          </a>
          <button className="md:hidden p-2 rounded-md text-slate-700 hover:bg-slate-100" onClick={() => setOpen((s) => !s)} data-testid="re-mobile-menu-toggle" aria-label="Toggle menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="md:hidden border-t border-slate-200 bg-white" data-testid="re-mobile-menu">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} className={({ isActive }) => `block px-6 py-3 text-sm border-b border-slate-100 ${isActive ? "text-indigo-900 font-semibold bg-indigo-50" : "text-slate-700"}`}>
              {n.label}
            </NavLink>
          ))}
          <a href={BRAND.tidycal} target="_blank" rel="noopener noreferrer" className="block px-6 py-3 text-sm font-semibold text-amber-600">
            Book Walkthrough →
          </a>
        </div>
      )}
    </header>
  );
}

export function REBreadcrumb({ label }) {
  return (
    <div className="bg-slate-50 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-3 flex items-center gap-2 text-xs text-slate-500">
        <Link to="/" className="hover:text-indigo-900">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link to="/real-estate" className="hover:text-indigo-900">Real Estate Agents</Link>
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

export function REFooter() {
  return (
    <footer className="bg-slate-950 text-slate-300" data-testid="re-footer">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-800 to-amber-500 grid place-items-center text-white">
                <Home className="h-5 w-5" />
              </div>
              <span className="text-white font-semibold">Bloom DevLabs · For Real Estate</span>
            </div>
            <p className="text-sm text-slate-400 max-w-md leading-relaxed">
              MLS-integrated agent websites with auto-syncing listings and lead-capture on every page — built and live in 24 hours.
            </p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-3">Explore</div>
            <ul className="space-y-2 text-sm">
              {NAV.map((n) => (
                <li key={n.to}><Link to={n.to} className="hover:text-white transition">{n.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-3">Contact</div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-500" /><a href={`mailto:${BRAND.email}`} className="hover:text-white">{BRAND.email}</a></li>
              <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-500" /><a href={`tel:${BRAND.phoneHref}`} className="hover:text-white">{BRAND.phone}</a></li>
              <li><a href={BRAND.tidycal} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-semibold">Book a walkthrough <ArrowRight className="h-3.5 w-3.5" /></a></li>
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

export default function RELayout({ breadcrumb, seo, children }) {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased" key={pathname}>
      {seo && <SeoHead {...seo} />}
      <REHeader />
      <REBreadcrumb label={breadcrumb} />
      <main>{children}</main>
      <RelatedLinks />
      <REFooter />
      <ExitIntentModal variant="realestate" />
    </div>
  );
}
