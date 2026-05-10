/**
 * SeoHead — drop-in SEO meta tag injector for any public page.
 *
 * Sets document.title plus a comprehensive set of meta tags:
 *   • description, keywords, author, robots
 *   • Open Graph (og:title, og:description, og:image, og:url, og:type)
 *   • Twitter card (summary_large_image)
 *   • Canonical URL
 *   • Optional JSON-LD structured data (Article/WebPage/BreadcrumbList/Organization)
 *
 * All tags are cleaned up on unmount so different pages don't leak meta.
 */
import { useEffect } from "react";

const MANAGED_ATTR = "data-seo-head";

function setTag(selector, attrs) {
  let el = document.head.querySelector(selector + `[${MANAGED_ATTR}]`);
  if (!el) {
    el = document.createElement(selector.split("[")[0]);
    el.setAttribute(MANAGED_ATTR, "true");
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => {
    if (v == null) return;
    if (k === "innerText" || k === "textContent") {
      el.textContent = v;
    } else {
      el.setAttribute(k, v);
    }
  });
  return el;
}

function setMeta(name, content, attr = "name") {
  if (!content) return;
  const sel = `meta[${attr}="${name}"]`;
  setTag(sel, { [attr]: name, content });
}

function setLink(rel, href) {
  if (!href) return;
  const sel = `link[rel="${rel}"]`;
  setTag(sel, { rel, href });
}

function setJsonLd(id, data) {
  if (!data) return;
  const sel = `script[type="application/ld+json"][data-id="${id}"]`;
  setTag(sel, { type: "application/ld+json", "data-id": id, textContent: JSON.stringify(data) });
}

function cleanup() {
  document.head
    .querySelectorAll(`[${MANAGED_ATTR}]`)
    .forEach((el) => el.parentNode && el.parentNode.removeChild(el));
}

export default function SeoHead({
  title,
  description,
  keywords,
  image,
  url,
  type = "website",
  author = "Bloom Labs",
  twitterHandle = "@bloomlabs",
  robots = "index, follow, max-image-preview:large",
  jsonLd,
  breadcrumbs,
}) {
  useEffect(() => {
    const fullTitle = title
      ? title.includes("Bloom Labs")
        ? title
        : `${title} — Bloom Labs`
      : "Bloom Labs — Enterprise-grade web apps in 2–4 weeks";

    const canonical =
      url ||
      (typeof window !== "undefined"
        ? `https://bybloomlabs.com${window.location.pathname}`
        : undefined);

    const ogImage = image || "https://bybloomlabs.com/og-default.png";

    document.title = fullTitle;

    setMeta("description", description);
    setMeta("keywords", keywords);
    setMeta("author", author);
    setMeta("robots", robots);

    // Open Graph
    setMeta("og:type", type, "property");
    setMeta("og:title", fullTitle, "property");
    setMeta("og:description", description, "property");
    setMeta("og:image", ogImage, "property");
    setMeta("og:url", canonical, "property");
    setMeta("og:site_name", "Bloom Labs", "property");

    // Twitter
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", fullTitle);
    setMeta("twitter:description", description);
    setMeta("twitter:image", ogImage);
    setMeta("twitter:site", twitterHandle);

    // Canonical
    setLink("canonical", canonical);

    // Structured data
    if (jsonLd) setJsonLd("primary", jsonLd);
    if (breadcrumbs && breadcrumbs.length > 0) {
      setJsonLd("breadcrumbs", {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbs.map((b, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: b.name,
          item: b.url,
        })),
      });
    }

    return cleanup;
  }, [
    title,
    description,
    keywords,
    image,
    url,
    type,
    author,
    twitterHandle,
    robots,
    jsonLd,
    breadcrumbs,
  ]);

  return null;
}
