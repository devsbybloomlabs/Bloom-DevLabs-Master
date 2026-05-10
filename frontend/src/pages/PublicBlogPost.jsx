import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { Header } from "@/components/sections/Header";
import { Footer } from "@/components/sections/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import LeadMagnetForm from "@/components/LeadMagnetForm";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Minimal markdown → HTML renderer (headings, paragraphs, lists, code, blockquotes, links)
function renderMarkdown(md) {
  if (!md) return "";
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // code blocks
  html = html.replace(
    /```([\s\S]*?)```/g,
    (_, code) => `<pre class="rounded-lg bg-zinc-900 text-zinc-50 p-4 overflow-x-auto text-sm my-6"><code>${code.trim()}</code></pre>`
  );
  // inline code
  html = html.replace(/`([^`\n]+)`/g, '<code class="rounded bg-secondary px-1.5 py-0.5 text-[0.9em] font-mono">$1</code>');
  // headings
  html = html.replace(/^###\s+(.*)$/gm, '<h3 class="font-display text-xl font-semibold mt-8 mb-3">$1</h3>');
  html = html.replace(/^##\s+(.*)$/gm, '<h2 class="font-display text-2xl font-semibold mt-10 mb-4">$1</h2>');
  html = html.replace(/^#\s+(.*)$/gm, '<h1 class="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-2 mb-6">$1</h1>');
  // blockquotes
  html = html.replace(/^>\s+(.*)$/gm, '<blockquote class="border-l-4 border-[#3B82F6] pl-4 italic text-muted-foreground my-5">$1</blockquote>');
  // bold/italic
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  // links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="text-[#1E3A8A] underline underline-offset-4 hover:text-[#3B82F6]" href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // unordered lists
  html = html.replace(/^(?:- (.*)(?:\n|$))+/gm, (block) => {
    const items = block.split(/\n/).filter(Boolean).map((l) => `<li>${l.replace(/^- /, "")}</li>`).join("");
    return `<ul class="list-disc pl-6 my-4 space-y-1.5">${items}</ul>`;
  });
  // ordered lists
  html = html.replace(/^(?:\d+\.\s+(.*)(?:\n|$))+/gm, (block) => {
    const items = block.split(/\n/).filter(Boolean).map((l) => `<li>${l.replace(/^\d+\.\s+/, "")}</li>`).join("");
    return `<ol class="list-decimal pl-6 my-4 space-y-1.5">${items}</ol>`;
  });
  // paragraphs (any remaining lines)
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      if (/^<(h\d|ul|ol|pre|blockquote)/.test(block.trim())) return block;
      return `<p class="leading-relaxed my-4">${block.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");
  return html;
}

export default function PublicBlogPost() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setPost(null);
    setError("");
    axios
      .get(`${API}/blog/${slug}`)
      .then((r) => {
        setPost(r.data);
      })
      .catch((err) => {
        setError(err?.response?.status === 404 ? "Post not found" : "Failed to load");
      });
  }, [slug]);

  const canonicalUrl = `https://bybloomlabs.com/blog/${slug}`;
  const ogImage = post
    ? `${process.env.REACT_APP_BACKEND_URL}/api/og/blog/${slug}.svg`
    : undefined;

  const articleJsonLd = post && {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seo_description || post.excerpt,
    image: ogImage,
    author: {
      "@type": "Person",
      name: post.author_name || "Bloom Labs",
    },
    publisher: {
      "@type": "Organization",
      name: "Bloom Labs",
      logo: {
        "@type": "ImageObject",
        url: "https://bybloomlabs.com/og-default.png",
      },
    },
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    keywords: (post.tags || []).join(", "),
  };

  return (
    <main className="bg-background text-foreground" data-testid="public-blog-post-page">
      {post && (
        <SeoHead
          title={post.seo_title || post.title}
          description={post.seo_description || post.excerpt}
          keywords={(post.tags || []).join(", ")}
          image={ogImage}
          url={canonicalUrl}
          type="article"
          author={post.author_name}
          jsonLd={articleJsonLd}
          breadcrumbs={[
            { name: "Home", url: "https://bybloomlabs.com" },
            { name: "Blog", url: "https://bybloomlabs.com/blog" },
            { name: post.title, url: canonicalUrl },
          ]}
        />
      )}
      <Header />
      <article className="mx-auto max-w-[760px] px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/blog")}
          className="mb-6 -ml-2"
          data-testid="blog-post-back-button"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          All posts
        </Button>

        {error && (
          <div className="rounded-xl border border-border bg-card p-10 text-center" data-testid="blog-post-error">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Link to="/blog" className="mt-4 inline-block text-sm text-[#1E3A8A] underline">
              Back to blog
            </Link>
          </div>
        )}

        {!post && !error && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        )}

        {post && (
          <>
            <header className="mb-8">
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {post.tags.map((t) => (
                    <Badge
                      key={t}
                      variant="outline"
                      className="text-[11px] border-[#3B82F6]/30 text-[#1E3A8A]"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight leading-[1.1]">
                {post.title}
              </h1>
              {post.excerpt && (
                <p className="mt-4 text-base sm:text-lg text-muted-foreground">
                  {post.excerpt}
                </p>
              )}
              <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{post.author_name}</span>
                {post.published_at && (
                  <>
                    <span>·</span>
                    <time>{new Date(post.published_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</time>
                  </>
                )}
              </div>
            </header>

            {post.featured_image && (
              <img
                src={post.featured_image}
                alt={post.title}
                className="w-full rounded-2xl mb-8 aspect-[16/9] object-cover"
              />
            )}

            <div
              className="prose-content text-foreground/90"
              data-testid="blog-post-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }}
            />

            {/* Lead magnet opt-in — auto-fetches active magnet */}
            <div className="mt-14">
              <LeadMagnetForm sourceUrl={canonicalUrl} />
            </div>
          </>
        )}
      </article>
      <Footer />
    </main>
  );
}
