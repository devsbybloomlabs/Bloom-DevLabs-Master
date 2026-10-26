import { Link } from "react-router-dom";
import { Header } from "@/components/sections/Header";
import { Footer } from "@/components/sections/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import SeoHead from "@/components/SeoHead";

export default function NotFound() {
  return (
    <main className="bg-background text-foreground" data-testid="not-found-page">
      <SeoHead
        title="Page not found"
        description="The page you're looking for doesn't exist."
        robots="noindex, nofollow"
      />
      <Header />
      <section className="bg-[var(--warm-50)] border-b border-border">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="max-w-3xl">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              404
            </div>
            <h1 className="font-display mt-3 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight">
              This page doesn&apos;t exist.
            </h1>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl">
              The link may be broken or the page may have moved. Head back home
              or take a look at our work.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild data-testid="not-found-home">
                <Link to="/">
                  Back to home <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/case-studies">Case studies</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/blog">Blog</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
