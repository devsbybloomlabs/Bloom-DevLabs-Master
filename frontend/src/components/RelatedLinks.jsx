/**
 * RelatedLinks — SEO-friendly contextual link block to inject above each
 * page footer. Renders the curated map from `/lib/internalLinks.js` as
 * keyword-rich anchor text so search engines can crawl the topic cluster
 * and visitors have an obvious next read.
 *
 * Usage:
 *   <RelatedLinks />               // auto-detects pathname
 *   <RelatedLinks path="/blog" />  // explicit override
 *   <RelatedLinks variant="dark" /> // for dark backgrounds
 */
import { Link, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { getRelatedLinks } from "@/lib/internalLinks";

export default function RelatedLinks({ path, variant = "light", title = "Keep reading" }) {
  const location = useLocation();
  const pathname = path || location.pathname;
  const links = getRelatedLinks(pathname);
  if (!links || links.length === 0) return null;

  const dark = variant === "dark";

  return (
    <aside
      data-testid="related-links"
      aria-label="Related links"
      className={`${dark ? "bg-slate-950 text-slate-200" : "bg-slate-50 border-t border-slate-200 text-slate-800"} py-12`}
    >
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8">
        <h2
          className={`text-base md:text-lg font-display font-semibold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}
          data-testid="related-links-title"
        >
          {title}
        </h2>
        <p
          className={`mt-1 text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}
        >
          Topic-relevant pages from across bybloomlabs.com
        </p>
        <ul className="mt-5 grid sm:grid-cols-2 gap-2.5">
          {links.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                data-testid={`related-link-${l.to.replace(/[^a-z0-9]+/gi, "-")}`}
                className={`group flex items-start gap-3 rounded-lg border p-3.5 transition-colors ${
                  dark
                    ? "border-white/10 hover:border-white/30 hover:bg-white/5"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="min-w-0 flex-1">
                  {l.kicker && (
                    <p
                      className={`text-[10px] uppercase tracking-[0.16em] font-medium ${
                        dark ? "text-blue-300" : "text-blue-700"
                      }`}
                    >
                      {l.kicker}
                    </p>
                  )}
                  <p
                    className={`mt-0.5 text-sm font-medium leading-snug ${
                      dark ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {l.label}
                  </p>
                </div>
                <ArrowRight
                  className={`h-4 w-4 mt-1 flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${
                    dark ? "text-slate-400" : "text-slate-400"
                  }`}
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
