/**
 * SeoHead — drop-in SEO meta tag injector for any public page.
 *
 * IMPORTANT: This component HIJACKS any existing static meta/link tags from
 * public/index.html (saving their original content) so that they get
 * overridden in place — preserving DOM order so crawlers + social-card
 * scrapers see the right values. On unmount we restore the original
 * content / remove tags we injected.
 *
 * Sets document.title plus:
 *   • <meta name=description|keywords|author|robots>
 *   • Open Graph (<meta property=og:*>)
 *   • Twitter card (<meta name=twitter:*>)
 *   • <link rel=canonical>
 *   • <script type=application/ld+json> JSON-LD blocks
 */
import { useEffect } from "react";

const MANAGED = "data-seo-head";
const ORIG = "data-seo-orig";

function pickTag(bareSelector, fallbackSelector) {
  // Find a non-managed tag first (static from index.html), then any tag.
  let el = document.head.querySelector(`${bareSelector}:not([${MANAGED}])`);
  if (el) return { el, hijacked: true };
  el = document.head.querySelector(fallbackSelector || bareSelector);
  if (el) return { el, hijacked: false };
  return { el: null, hijacked: false };
}

function setAttr(el, k, v) {
  if (v == null) return;
  if (k === "textContent") el.textContent = v;
  else el.setAttribute(k, v);
}

function ensureTag(tagName, selectorWithoutManaged, attrs, content) {
  let found = pickTag(selectorWithoutManaged);
  let el = found.el;
  const isNew = !el;
  if (isNew) {
    el = document.createElement(tagName);
  }
  // Save original content (only when first hijacking a static tag)
  if (!isNew && !el.hasAttribute(ORIG) && !el.hasAttribute(MANAGED)) {
    // For meta tags, content is in the "content" attribute. For link, in "href". For script, in textContent.
    const origVal =
      tagName === "script"
        ? el.textContent
        : tagName === "link"
        ? el.getAttribute("href") || ""
        : el.getAttribute("content") || "";
    el.setAttribute(ORIG, origVal);
  }
  el.setAttribute(MANAGED, "true");
  Object.entries(attrs).forEach(([k, v]) => setAttr(el, k, v));
  if (content != null) {
    if (tagName === "script") el.textContent = content;
    else if (tagName === "link") el.setAttribute("href", content);
    else el.setAttribute("content", content);
  }
  if (isNew) document.head.appendChild(el);
  return el;
}

function setMetaName(name, content) {
  if (content == null) return;
  ensureTag("meta", `meta[name="${name}"]`, { name }, content);
}
function setMetaProp(property, content) {
  if (content == null) return;
  ensureTag("meta", `meta[property="${property}"]`, { property }, content);
}
function setLink(rel, href) {
  if (href == null) return;
  ensureTag("link", `link[rel="${rel}"]`, { rel }, href);
}
function setJsonLd(id, data) {
  if (data == null) return;
  ensureTag(
    "script",
    `script[type="application/ld+json"][data-id="${id}"]`,
    { type: "application/ld+json", "data-id": id },
    JSON.stringify(data)
  );
}

function cleanup() {
  document.head.querySelectorAll(`[${MANAGED}]`).forEach((el) => {
    if (el.hasAttribute(ORIG)) {
      // Hijacked a static tag → restore its original content
      const orig = el.getAttribute(ORIG);
      const tag = el.tagName.toLowerCase();
      if (tag === "script") el.textContent = orig;
      else if (tag === "link") el.setAttribute("href", orig);
      else el.setAttribute("content", orig);
      el.removeAttribute(MANAGED);
      el.removeAttribute(ORIG);
    } else {
      // We created it from scratch → remove it
      el.parentNode && el.parentNode.removeChild(el);
    }
  });
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
  extraJsonLd,
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

    setMetaName("description", description);
    setMetaName("keywords", keywords);
    setMetaName("author", author);
    setMetaName("robots", robots);

    setMetaProp("og:type", type);
    setMetaProp("og:title", fullTitle);
    setMetaProp("og:description", description);
    setMetaProp("og:image", ogImage);
    setMetaProp("og:url", canonical);
    setMetaProp("og:site_name", "Bloom Labs");

    setMetaName("twitter:card", "summary_large_image");
    setMetaName("twitter:title", fullTitle);
    setMetaName("twitter:description", description);
    setMetaName("twitter:image", ogImage);
    setMetaName("twitter:site", twitterHandle);

    setLink("canonical", canonical);

    if (jsonLd) setJsonLd("primary", jsonLd);
    if (Array.isArray(extraJsonLd)) {
      extraJsonLd.forEach((block, i) => {
        if (block) setJsonLd(`extra-${i}`, block);
      });
    }
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
    extraJsonLd,
    breadcrumbs,
  ]);

  return null;
}
