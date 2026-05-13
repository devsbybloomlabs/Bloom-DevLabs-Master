/**
 * CompaniesAdmin — Phase B replacement for ClientsAdmin.
 *
 * Lists every company (the entity that pays us). Click a row → slide-in
 * Client Detail drawer (CompanyDetailDrawer) with tabs for Overview,
 * Contacts, Projects, Project Brief (Phase D), Transactions, Milestones,
 * Support (Phase C), Documents, and Activity.
 *
 * Powered by Phase B's `/api/admin/companies` + `/detail` endpoints.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Building2,
  Plus,
  Search,
  RefreshCw,
  Mail,
  Phone,
  ChevronRight,
  Loader2,
  Tag,
} from "lucide-react";
import CompanyDetailDrawer from "@/components/admin/CompanyDetailDrawer";

const TIER_STYLES = {
  vip: "bg-amber-100 text-amber-900 border-amber-300",
  premium: "bg-sky-100 text-sky-900 border-sky-300",
  standard: "bg-secondary text-foreground border-border",
  none: "bg-slate-100 text-slate-600 border-slate-200",
};

function emptyForm() {
  return {
    name: "",
    primary_email: "",
    primary_contact_name: "",
    domain: "",
    phone: "",
    source: "inbound",
  };
}

export default function CompaniesAdmin() {
  const api = useAdminApi();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [drawerCompanyId, setDrawerCompanyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/companies");
      setCompanies(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      toast.error("Could not load companies");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (tierFilter !== "all" && c.support_tier !== tierFilter) return false;
      if (!q) return true;
      return (
        (c.name || "").toLowerCase().includes(q) ||
        (c.primary_email || "").toLowerCase().includes(q) ||
        (c.domain || "").toLowerCase().includes(q)
      );
    });
  }, [companies, query, tierFilter]);

  const onCreate = async () => {
    if (!form.name || !form.primary_email) {
      toast.error("Name + primary email required");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/admin/companies", {
        name: form.name,
        primary_email: form.primary_email,
        primary_contact_name: form.primary_contact_name || form.name,
        domain: form.domain || null,
        phone: form.phone || null,
        source: form.source,
      });
      toast.success("Company created");
      setForm(emptyForm());
      setCreating(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-companies-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">
            Companies
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every client company in one place. Click a row to open the unified
            detail drawer — contacts, projects, transactions, milestones &
            activity.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} data-testid="admin-companies-refresh">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button onClick={() => setCreating(true)} data-testid="admin-companies-new-btn">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Company
          </Button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatTile label="Total" value={companies.length} testid="stat-total" />
        <StatTile
          label="VIP support"
          value={companies.filter((c) => c.support_tier === "vip").length}
          accent="text-amber-600"
          testid="stat-vip"
        />
        <StatTile
          label="Premium"
          value={companies.filter((c) => c.support_tier === "premium").length}
          accent="text-sky-600"
          testid="stat-premium"
        />
        <StatTile
          label="Recent (7d)"
          value={
            companies.filter((c) => {
              const t = new Date(c.updated_at);
              return Date.now() - t.getTime() < 7 * 86_400_000;
            }).length
          }
          accent="text-emerald-600"
          testid="stat-recent"
        />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or domain…"
            className="pl-9"
            data-testid="admin-companies-search"
          />
        </div>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          data-testid="admin-companies-tier-filter"
        >
          <option value="all">All tiers</option>
          <option value="vip">VIP</option>
          <option value="premium">Premium</option>
          <option value="standard">Standard</option>
          <option value="none">No support</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-3">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="font-medium">No companies match</p>
            <p className="text-sm text-muted-foreground">
              {query ? "Try a different search." : "Click New Company to add one."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="admin-companies-list">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="relative group w-full bg-card border border-border rounded-lg hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <button
                onClick={() => setDrawerCompanyId(c.id)}
                className="w-full text-left p-4 flex items-center gap-4 pr-12"
                data-testid={`admin-company-row-${c.id}`}
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                  {(c.name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{c.name}</p>
                    {c.support_tier && c.support_tier !== "none" && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase tracking-wider ${TIER_STYLES[c.support_tier] || ""}`}
                      >
                        {c.support_tier}
                      </Badge>
                    )}
                    {Array.isArray(c.tags) && c.tags.slice(0, 2).map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">
                        <Tag className="h-2.5 w-2.5 mr-1" />
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground truncate flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {c.primary_email}
                    </span>
                    {c.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {c.phone}
                      </span>
                    )}
                    {c.domain && <span className="text-xs">· {c.domain}</span>}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
              </button>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!window.confirm(`Delete "${c.name}" PERMANENTLY?\n\nAll contacts and activity history for this company will also be removed. This cannot be undone.`)) return;
                  try {
                    await api.delete(`/admin/companies/${c.id}/hard`);
                    toast.success("Deleted");
                    load();
                  } catch (e2) {
                    toast.error(e2?.response?.data?.detail || "Delete failed");
                  }
                }}
                title="Delete permanently"
                data-testid={`admin-company-delete-${c.id}`}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* New company dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-[520px]" data-testid="admin-companies-create-dialog">
          <DialogHeader>
            <DialogTitle>New company</DialogTitle>
            <DialogDescription>
              The primary email becomes the first contact. You can add teammates after.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="co-name">Company name</Label>
              <Input
                id="co-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Acme Inc."
                data-testid="admin-companies-create-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="co-email">Primary email</Label>
                <Input
                  id="co-email"
                  type="email"
                  value={form.primary_email}
                  onChange={(e) =>
                    setForm({ ...form, primary_email: e.target.value })
                  }
                  placeholder="ceo@acme.com"
                  data-testid="admin-companies-create-email"
                />
              </div>
              <div>
                <Label htmlFor="co-contact">Contact name</Label>
                <Input
                  id="co-contact"
                  value={form.primary_contact_name}
                  onChange={(e) =>
                    setForm({ ...form, primary_contact_name: e.target.value })
                  }
                  placeholder="Jane Doe"
                  data-testid="admin-companies-create-contact"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="co-domain">Domain</Label>
                <Input
                  id="co-domain"
                  value={form.domain}
                  onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  placeholder="acme.com"
                />
              </div>
              <div>
                <Label htmlFor="co-phone">Phone</Label>
                <Input
                  id="co-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+1 555 123 4567"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="co-source">Source</Label>
              <select
                id="co-source"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="inbound">Inbound</option>
                <option value="referral">Referral</option>
                <option value="outbound">Outbound</option>
                <option value="existing">Existing</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              onClick={onCreate}
              disabled={submitting}
              data-testid="admin-companies-create-submit"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create company"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CompanyDetailDrawer
        companyId={drawerCompanyId}
        onClose={() => setDrawerCompanyId(null)}
        onChanged={load}
      />
    </div>
  );
}

function StatTile({ label, value, accent = "", testid }) {
  return (
    <Card data-testid={testid}>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
