import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetHeader,
} from "@/components/ui/sheet";
import { Menu, Calendar, LogIn, User } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { useClientAuth } from "@/lib/clientAuth";

const NAV_ITEMS = [
  { id: "problem", label: "Problem" },
  { id: "solution", label: "Solution" },
  { id: "pricing", label: "Pricing" },
  { id: "case-studies", label: "Case Studies" },
  { id: "how-we-work", label: "How We Work" },
  { id: "faq", label: "FAQ" },
];

export const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { token, client } = useClientAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const clientLoggedIn = !!token;

  return (
    <header
      data-testid="header"
      className={`sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 transition-shadow ${
        scrolled
          ? "shadow-[0_1px_0_rgba(15,23,42,0.06)] border-b border-border"
          : "border-b border-transparent"
      }`}
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

        <nav className="hidden lg:flex items-center gap-7" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="text-sm text-foreground/80 hover:text-foreground transition-colors whitespace-nowrap"
              data-testid={`header-nav-${item.id}-link`}
            >
              {item.label}
            </a>
          ))}
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
              className="w-[85%] sm:w-[380px] bg-background"
              data-testid="mobile-menu-sheet"
            >
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2">
                  <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-7" />
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-1">
                {NAV_ITEMS.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={() => setOpen(false)}
                    className="px-3 py-3 rounded-lg text-base hover:bg-secondary transition-colors"
                    data-testid={`mobile-nav-${item.id}-link`}
                  >
                    {item.label}
                  </a>
                ))}
                {clientLoggedIn ? (
                  <Button
                    variant="outline"
                    className="mt-4 h-12 border-[#1E3A8A]/30 text-[#1E3A8A]"
                    onClick={() => {
                      setOpen(false);
                      navigate("/portal");
                    }}
                    data-testid="mobile-portal-button"
                  >
                    <User className="h-4 w-4 mr-2" />
                    My Portal
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="mt-4 h-12 border-[#1E3A8A]/30 text-[#1E3A8A]"
                    onClick={() => {
                      setOpen(false);
                      navigate("/login");
                    }}
                    data-testid="mobile-client-login-button"
                  >
                    <LogIn className="h-4 w-4 mr-2" />
                    Client Login
                  </Button>
                )}
                <Button
                  asChild
                  className="mt-2 bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-12"
                  onClick={() => setOpen(false)}
                  data-testid="mobile-book-call-button"
                >
                  <a href="#book">
                    <Calendar className="h-4 w-4 mr-2" />
                    Book a Discovery Call
                  </a>
                </Button>
                <p className="mt-3 text-xs text-muted-foreground px-3">
                  15 minutes, no pressure.
                </p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
