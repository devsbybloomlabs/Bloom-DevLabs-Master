import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Header } from "@/components/sections/Header";
import { Footer } from "@/components/sections/Footer";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight, BookOpen } from "lucide-react";
import SeoHead from "@/components/SeoHead";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PublicBlog() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    axios
      .get(`${API}/blog`)
      .then((r) => setItems(r.data || []))
      .catch(() => setItems([]));
  }, []);

  return (
    <main className="bg-background text-foreground" data-testid="public-blog-page">
      <SeoHead
        title="Blog — field notes from shipping AI-native systems"
        description="Deep dives on AI-native SaaS development, agency operations, and the playbook we use to ship enterprise web apps in 2–4 weeks."
        keywords="AI development blog, SaaS engineering, agency operations, fast software delivery, bloom labs"
        url="https://bybloomlabs.com/blog"
        type="website"
        breadcrumbs={[
          { name: "Home", url: "https://bybloomlabs.com" },
          { name: "Blog", url: "https://bybloomlabs.com/blog" },
        ]}
      />
      <Header />
      <section className="bg-[var(--warm-50)] border-b border-border">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="max-w-3xl">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Blog
            </div>
            <h1 className="font-display mt-3 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight">
              Field notes from shipping AI-native systems.
            </h1>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl">
              Real lessons from real projects — how we cut build cycles from
              months to weeks, and what we learned along the way.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {items === null && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        )}
        {items && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-[var(--warm-50)] p-12 text-center" data-testid="public-blog-empty">
            <div className="mx-auto h-12 w-12 rounded-full bg-white flex items-center justify-center mb-3 shadow-[var(--shadow-sm)]">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-display text-lg font-medium">First post coming soon</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;re drafting deep dives on AI-native development. Check back shortly.
            </p>
          </div>
        )}
        {items && items.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="public-blog-grid">
            {items.map((p) => (
              <article
                key={p.id}
                className="group rounded-2xl border border-border bg-card overflow-hidden hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all"
                data-testid={`public-blog-card-${p.slug}`}
              >
                <Link to={`/blog/${p.slug}`} className="block">
                  {p.featured_image ? (
                    <div className="aspect-[16/10] bg-secondary overflow-hidden">
                      <img
                        src={p.featured_image}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[16/10] bg-gradient-to-br from-[#1E3A8A]/10 to-[#3B82F6]/10 flex items-center justify-center">
                      <BookOpen className="h-10 w-10 text-[#1E3A8A]/30" />
                    </div>
                  )}
                  <div className="p-5 sm:p-6">
                    {p.tags && p.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {p.tags.slice(0, 3).map((t) => (
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
                    <h3 className="font-display text-lg font-semibold leading-tight">
                      {p.title}
                    </h3>
                    {p.excerpt && (
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                        {p.excerpt}
                      </p>
                    )}
                    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{p.author_name || "Bloom Labs"}</span>
                      {p.published_at && (
                        <time>{new Date(p.published_at).toLocaleDateString()}</time>
                      )}
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}
