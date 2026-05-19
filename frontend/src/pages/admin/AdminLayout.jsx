import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useMatch } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  CalendarClock,
  Users,
  PenSquare,
  TrendingUp,
  Award,
  BookOpen,
  Mic,
  ShieldCheck,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  CircleDollarSign,
  Newspaper,
  ClipboardList,
  Repeat,
  Receipt,
  FileText,
  Sparkles,
  Inbox,
  Target,
  Plug,
  Search,
  ImagePlus,
  LifeBuoy,
  KanbanSquare,
  FolderUp,
  FlaskConical,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { toast } from "sonner";
import NotificationsBell from "@/components/admin/NotificationsBell";

const NAV = [
  // ── Daily — open this in the morning ───────────────────────────────────
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Daily" },
  { to: "/admin/routine", label: "Today's Routine", icon: CalendarClock, group: "Daily" },
  { to: "/admin/support-triage", label: "Support Triage", icon: LifeBuoy, group: "Daily" },

  // ── Pipeline — win new work ────────────────────────────────────────────
  { to: "/admin/audits", label: "Audit Leads", icon: Sparkles, group: "Pipeline" },
  { to: "/admin/pipeline", label: "Pipeline", icon: TrendingUp, group: "Pipeline" },
  { to: "/admin/outreach", label: "Outreach AI", icon: Users, group: "Pipeline" },
  { to: "/admin/companies", label: "Companies", icon: Users, group: "Pipeline" },
  { to: "/admin/proposals", label: "Proposals", icon: FileText, group: "Pipeline" },

  // ── Delivery — ship the work ───────────────────────────────────────────
  { to: "/admin/onboarding", label: "Onboarding", icon: ClipboardList, group: "Delivery" },
  { to: "/admin/project-mode", label: "Project Mode", icon: KanbanSquare, group: "Delivery" },
  { to: "/admin/project-files", label: "Project Files", icon: FolderUp, group: "Delivery" },
  { to: "/admin/milestones", label: "Milestones", icon: Target, group: "Delivery" },
  { to: "/admin/support-clearance", label: "Support Clearance", icon: ShieldCheck, group: "Delivery" },

  // ── Money ──────────────────────────────────────────────────────────────
  { to: "/admin/invoices", label: "Invoices", icon: FileText, group: "Money" },
  { to: "/admin/subscriptions", label: "Subscriptions", icon: Repeat, group: "Money" },
  { to: "/admin/paypal-plans", label: "PayPal Plans", icon: Repeat, group: "Money" },
  { to: "/admin/paypal-orders", label: "PayPal Orders", icon: Receipt, group: "Money" },

  // ── Authority — content + brand ────────────────────────────────────────
  { to: "/admin/content", label: "Content AI", icon: PenSquare, group: "Authority" },
  { to: "/admin/lead-magnets", label: "Lead Magnets", icon: Sparkles, group: "Authority" },
  { to: "/admin/warm-leads", label: "Warm Leads", icon: Inbox, group: "Authority" },
  { to: "/admin/credibility", label: "Credibility Hub", icon: ShieldCheck, group: "Authority" },
  { to: "/admin/case-studies", label: "Case Studies", icon: Award, group: "Authority" },
  { to: "/admin/testimonials", label: "Testimonials", icon: Mic, group: "Authority" },
  { to: "/admin/thought-leadership", label: "Thought Leadership", icon: BookOpen, group: "Authority" },
  { to: "/admin/blog", label: "Blog", icon: Newspaper, group: "Authority" },
  { to: "/admin/authority", label: "Authority Score", icon: ShieldCheck, group: "Authority" },

  // ── System ─────────────────────────────────────────────────────────────
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3, group: "System" },
  { to: "/admin/ab-tests", label: "A/B Tests", icon: FlaskConical, group: "System" },
  { to: "/admin/seo", label: "SEO Submit", icon: Search, group: "System" },
  { to: "/admin/integrations", label: "Integrations", icon: Plug, group: "System" },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon, group: "System" },
];

const GROUPS = ["Daily", "Pipeline", "Delivery", "Money", "Authority", "System"];

function SidebarItem({ to, label, Icon, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      data-testid={`sidebar-link-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      className={({ isActive }) =>
        `group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? "bg-[#1E3A8A] text-white"
            : "text-foreground/85 hover:bg-secondary hover:text-foreground"
        }`
      }
      end
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

function SidebarBody({ onNavigate }) {
  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      <div className="px-4 py-5 border-b border-border">
        <a href="/" className="inline-flex items-center gap-2">
          <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-7" />
        </a>
        <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Admin
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Admin navigation">
        {GROUPS.map((g) => {
          const items = NAV.filter((n) => n.group === g);
          if (!items.length) return null;
          return (
            <div key={g}>
              <div className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {g}
              </div>
              <div className="space-y-0.5">
                {items.map((it) => (
                  <SidebarItem
                    key={it.to}
                    to={it.to}
                    label={it.label}
                    Icon={it.icon}
                    onClick={onNavigate}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Focus Shell — when entering Project Mode for a SPECIFIC project
  // (/admin/project-mode/{id}) we hide the admin chrome so the founder
  // can concentrate on one project at a time. The list page
  // /admin/project-mode keeps the regular layout.
  const focusMatch = useMatch("/admin/project-mode/:projectId");
  const isFocusMode = Boolean(focusMatch);

  // SEO: ensure admin pages are not indexed (belt-and-suspenders alongside robots.txt)
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow, noarchive, nosnippet";
    meta.setAttribute("data-admin-noindex", "true");
    document.head.appendChild(meta);
    const prevTitle = document.title;
    document.title = "Bloom Labs Admin";
    return () => {
      document.head.removeChild(meta);
      document.title = prevTitle;
    };
  }, []);

  const handleLogout = () => {
    logout();
    toast.success("Signed out");
    navigate("/admin/login");
  };

  if (isFocusMode) {
    return (
      <div
        className="min-h-screen bg-[var(--warm-50)] flex flex-col"
        data-testid="admin-layout-focus"
      >
        {/* Slim focus-mode top bar */}
        <header
          className="sticky top-0 z-30 bg-background border-b border-border h-12 flex items-center justify-between px-4 sm:px-6"
          data-testid="focus-shell-topbar"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/project-mode")}
            className="h-9 -ml-2"
            data-testid="focus-shell-back"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Admin
          </Button>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground inline-flex items-center gap-1.5">
            <KanbanSquare className="h-3.5 w-3.5" />
            Focus Mode
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Sign out"
            className="h-9 w-9"
            data-testid="focus-shell-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <main className="flex-1 min-w-0 overflow-x-hidden" data-testid="focus-shell-main">
          <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--warm-50)]" data-testid="admin-layout">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-40 bg-background border-b border-border h-14 flex items-center justify-between px-4">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="admin-mobile-menu-button" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[280px]" data-testid="admin-mobile-menu-sheet">
            <SheetHeader className="sr-only"><SheetTitle>Admin menu</SheetTitle></SheetHeader>
            <SidebarBody onNavigate={() => setSheetOpen(false)} />
          </SheetContent>
        </Sheet>
        <img src={BRAND.logos.fullDark} alt="Bloom Labs" className="h-6" />
        <div className="flex items-center gap-1">
          <NotificationsBell />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Sign out"
            data-testid="admin-mobile-logout-button"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="lg:flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-[260px] flex-shrink-0 h-screen sticky top-0">
          <SidebarBody />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-x-hidden">
          {/* Top user bar */}
          <div className="hidden lg:flex items-center justify-end gap-3 h-14 px-6 border-b border-border bg-background">
            <NotificationsBell />
            <div className="text-sm text-foreground/90" data-testid="admin-user-name">
              {user?.name || user?.email}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="h-9"
              data-testid="admin-logout-button"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>
          <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
