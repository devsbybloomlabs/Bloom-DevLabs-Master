/**
 * CompanyDetailDrawer — the unified "bird's-eye view" of a company.
 *
 * Slides in from the right with tabs:
 *   - Overview       (stats + key fields)
 *   - Contacts       (multiple people per company)
 *   - Projects       (active + completed; reads from onboarding + milestones)
 *   - Project Brief  (Phase D)
 *   - Transactions   (invoices + PayPal orders + subscriptions)
 *   - Milestones     (timeline view — Phase E will animate this)
 *   - Support        (UID + tier + tickets — full feature in Phase C)
 *   - Documents      (BreezeDocs proposals)
 *   - Activity       (chronological audit log)
 *
 * Backed by /api/admin/companies/{id}/detail (denormalized) + the
 * /activity, /contacts, /notes endpoints for actions.
 */
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Building2,
  Mail,
  Phone,
  Globe,
  Users,
  FileText,
  Receipt,
  Target,
  Shield,
  Activity as ActivityIcon,
  FolderOpen,
  Plus,
  Star,
  Trash2,
  Loader2,
  Save,
  Archive,
  ExternalLink,
  StickyNote,
} from "lucide-react";

const TIER_STYLES = {
  vip: "bg-amber-100 text-amber-900",
  premium: "bg-sky-100 text-sky-900",
  standard: "bg-secondary text-foreground",
  none: "bg-slate-100 text-slate-600",
};

function fmtMoney(n, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(n || 0));
  } catch {
    return `${currency} ${Number(n || 0).toFixed(2)}`;
  }
}

function fmtDate(iso, withTime = false) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return withTime
      ? d.toLocaleString()
      : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

const ACTIVITY_ICONS = {
  "company.created": Building2,
  "company.migrated": Building2,
  "company.archived": Archive,
  "company.restored": Building2,
  "contact.added": Users,
  "note.added": StickyNote,
  "invoice.created": Receipt,
  "invoice.paid": Receipt,
  "invoice.refunded": Receipt,
  "proposal.sent": FileText,
  "proposal.signed": FileText,
  "milestone.completed": Target,
  "support.upgraded": Shield,
};

export default function CompanyDetailDrawer({ companyId, onClose, onChanged }) {
  const api = useAdminApi();
  const [detail, setDetail] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [d, a] = await Promise.all([
        api.get(`/admin/companies/${companyId}/detail`),
        api.get(`/admin/companies/${companyId}/activity`),
      ]);
      setDetail(d.data);
      setActivity(Array.isArray(a.data) ? a.data : []);
    } catch (e) {
      toast.error("Could not load company detail");
    } finally {
      setLoading(false);
    }
  }, [companyId, api]);

  useEffect(() => {
    if (companyId) load();
    else {
      setDetail(null);
      setActivity([]);
    }
  }, [companyId, load]);

  if (!companyId) return null;

  const company = detail?.company;
  const stats = detail?.stats || {};

  return (
    <Sheet open={Boolean(companyId)} onOpenChange={(open) => !open && onClose?.()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl overflow-y-auto"
        data-testid="company-detail-drawer"
      >
        {loading || !detail ? (
          <div className="space-y-4 mt-8">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b border-border pb-4">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0">
                  {(company.name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-xl flex items-center gap-2 flex-wrap">
                    {company.name}
                    {company.support_tier && company.support_tier !== "none" && (
                      <Badge variant="outline" className={`text-[10px] uppercase ${TIER_STYLES[company.support_tier]}`}>
                        {company.support_tier} support
                      </Badge>
                    )}
                  </SheetTitle>
                  <SheetDescription className="flex items-center gap-3 text-xs flex-wrap mt-1">
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {company.primary_email}
                    </span>
                    {company.domain && (
                      <span className="inline-flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {company.domain}
                      </span>
                    )}
                    <span>Updated {fmtDate(company.updated_at, true)}</span>
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            {/* Stat strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-4">
              <MiniStat label="Lifetime paid" value={fmtMoney(stats.lifetime_paid)} accent="text-emerald-600" />
              <MiniStat label="Outstanding" value={fmtMoney(stats.outstanding)} accent="text-amber-600" />
              <MiniStat label="Active subs" value={stats.active_subscriptions} />
              <MiniStat label="Open tickets" value={stats.open_tickets} />
            </div>

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="flex w-full overflow-x-auto bg-secondary/60 h-auto p-1 no-scrollbar">
                <TabsTrigger value="overview" data-testid="drawer-tab-overview">
                  <Building2 className="h-3.5 w-3.5 mr-1.5" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="contacts" data-testid="drawer-tab-contacts">
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  Contacts ({detail.contacts.length})
                </TabsTrigger>
                <TabsTrigger value="projects" data-testid="drawer-tab-projects">
                  <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                  Projects
                </TabsTrigger>
                <TabsTrigger value="transactions" data-testid="drawer-tab-transactions">
                  <Receipt className="h-3.5 w-3.5 mr-1.5" />
                  Transactions
                </TabsTrigger>
                <TabsTrigger value="milestones" data-testid="drawer-tab-milestones">
                  <Target className="h-3.5 w-3.5 mr-1.5" />
                  Milestones
                </TabsTrigger>
                <TabsTrigger value="documents" data-testid="drawer-tab-documents">
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Documents
                </TabsTrigger>
                <TabsTrigger value="activity" data-testid="drawer-tab-activity">
                  <ActivityIcon className="h-3.5 w-3.5 mr-1.5" />
                  Activity
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                <OverviewTab
                  detail={detail}
                  api={api}
                  onChange={() => {
                    load();
                    onChanged?.();
                  }}
                />
              </TabsContent>

              <TabsContent value="contacts" className="space-y-3 mt-4">
                <ContactsTab
                  companyId={companyId}
                  contacts={detail.contacts}
                  api={api}
                  onChange={() => {
                    load();
                    onChanged?.();
                  }}
                />
              </TabsContent>

              <TabsContent value="projects" className="space-y-3 mt-4">
                <ProjectsTab detail={detail} />
              </TabsContent>

              <TabsContent value="transactions" className="space-y-3 mt-4">
                <TransactionsTab detail={detail} />
              </TabsContent>

              <TabsContent value="milestones" className="space-y-3 mt-4">
                <MilestonesTab detail={detail} />
              </TabsContent>

              <TabsContent value="documents" className="space-y-3 mt-4">
                <DocumentsTab detail={detail} />
              </TabsContent>

              <TabsContent value="activity" className="space-y-3 mt-4">
                <ActivityTab
                  companyId={companyId}
                  activity={activity}
                  api={api}
                  onChange={load}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({ label, value, accent = "" }) {
  return (
    <div className="bg-secondary/40 rounded-md px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${accent}`}>{value}</p>
    </div>
  );
}

/* ----------------------- Tab components ----------------------- */
function OverviewTab({ detail, api, onChange }) {
  const c = detail.company;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: c.name || "",
    domain: c.domain || "",
    phone: c.phone || "",
    industry: c.industry || "",
    size: c.size || "",
    notes: c.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/companies/${c.id}`, form);
      toast.success("Saved");
      setEditing(false);
      onChange();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        {editing ? (
          <>
            <Field label="Company name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Domain">
                <Input
                  value={form.domain}
                  onChange={(e) => setForm({ ...form, domain: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Industry">
                <Input
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                />
              </Field>
              <Field label="Size">
                <select
                  value={form.size}
                  onChange={(e) => setForm({ ...form, size: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  <option value="1-10">1–10</option>
                  <option value="11-50">11–50</option>
                  <option value="51-200">51–200</option>
                  <option value="201+">201+</option>
                </select>
              </Field>
            </div>
            <Field label="Internal notes">
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={4}
              />
            </Field>
            <div className="flex gap-2 justify-end pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving} data-testid="drawer-overview-save">
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    Save changes
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            <ReadField label="Domain" value={c.domain} />
            <ReadField label="Industry" value={c.industry} />
            <ReadField label="Size" value={c.size} />
            <ReadField label="Phone" value={c.phone} />
            <ReadField label="Source" value={c.source} />
            <ReadField label="Internal notes" value={c.notes || "—"} pre />
            <div className="pt-3 border-t border-border flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="drawer-overview-edit">
                Edit
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ReadField({ label, value, pre = false }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm mt-0.5 ${pre ? "whitespace-pre-wrap" : ""}`}>{value || "—"}</p>
    </div>
  );
}

function ContactsTab({ companyId, contacts, api, onChange }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "", phone: "" });
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!form.name || !form.email) {
      toast.error("Name + email required");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/admin/companies/${companyId}/contacts`, form);
      toast.success("Contact added");
      setAdding(false);
      setForm({ name: "", email: "", role: "", phone: "" });
      onChange();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Add failed");
    } finally {
      setSaving(false);
    }
  };

  const promote = async (id) => {
    try {
      await api.post(`/admin/contacts/${id}/promote`);
      toast.success("Primary contact updated");
      onChange();
    } catch {
      toast.error("Could not promote");
    }
  };

  const archive = async (id) => {
    if (!window.confirm("Archive this contact?")) return;
    try {
      await api.delete(`/admin/contacts/${id}`);
      toast.success("Archived");
      onChange();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Archive failed");
    }
  };

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAdding(true)} data-testid="drawer-contacts-add-btn">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add contact
        </Button>
      </div>

      {adding && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="CEO" />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={add} disabled={saving} data-testid="drawer-contacts-add-submit">
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No contacts yet.</p>
      ) : (
        contacts.map((p) => (
          <Card key={p.id} data-testid={`drawer-contact-${p.id}`}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-xs font-medium">
                {(p.name || "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  {p.name}
                  {p.is_primary && (
                    <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {p.email}{p.role ? ` · ${p.role}` : ""}{p.phone ? ` · ${p.phone}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                {!p.is_primary && (
                  <Button variant="ghost" size="sm" onClick={() => promote(p.id)} title="Make primary">
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                )}
                {!p.is_primary && (
                  <Button variant="ghost" size="sm" onClick={() => archive(p.id)} title="Archive">
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </>
  );
}

function ProjectsTab({ detail }) {
  const onboarding = detail.onboarding;
  if (!onboarding) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No active project yet. Start one from Admin → Onboarding.
        </CardContent>
      </Card>
    );
  }
  const phaseMap = { 1: "Design Language", 2: "Function Language", 3: "Company Background" };
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-medium">Current onboarding</p>
          <Badge variant="outline" className="text-[10px] uppercase">
            Phase {onboarding.current_phase || 1}
          </Badge>
        </div>
        {[1, 2, 3].map((n) => {
          const submitted = onboarding[`phase${n}_submitted_at`];
          return (
            <div key={n} className="flex items-center justify-between text-sm border-t border-border pt-2">
              <span>{phaseMap[n]}</span>
              <span className={`text-xs ${submitted ? "text-emerald-700" : "text-muted-foreground"}`}>
                {submitted ? `✓ ${fmtDate(submitted)}` : "Pending"}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TransactionsTab({ detail }) {
  const invoices = detail.invoices || [];
  const orders = detail.paypal_orders || [];
  const subs = detail.subscriptions || [];

  return (
    <>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mt-2">
        Recent invoices ({invoices.length})
      </p>
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        invoices.map((i) => (
          <Card key={i.id}>
            <CardContent className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{i.number}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(i.issued_at)} · status: <span className="capitalize">{i.status}</span>
                </p>
              </div>
              <p className="text-sm font-semibold">{fmtMoney(i.total, i.currency)}</p>
            </CardContent>
          </Card>
        ))
      )}

      <p className="text-xs uppercase tracking-wider text-muted-foreground mt-4">
        PayPal orders ({orders.length})
      </p>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No PayPal orders.</p>
      ) : (
        orders.map((o, idx) => (
          <Card key={o.order_id || idx}>
            <CardContent className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{o.order_id || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(o.created_at)} · {o.status || "—"}
                </p>
              </div>
              <p className="text-sm font-semibold">{fmtMoney(o.amount, o.currency)}</p>
            </CardContent>
          </Card>
        ))
      )}

      <p className="text-xs uppercase tracking-wider text-muted-foreground mt-4">
        Subscriptions ({subs.length})
      </p>
      {subs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No subscriptions.</p>
      ) : (
        subs.map((s) => (
          <Card key={s.subscription_id || s.id}>
            <CardContent className="p-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{s.plan_name || s.plan_id || "—"}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  Status: {s.status}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase">
                {s.status}
              </Badge>
            </CardContent>
          </Card>
        ))
      )}
    </>
  );
}

function MilestonesTab({ detail }) {
  const ms = detail.milestones || [];
  if (ms.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No milestones yet — the team will add these as the project moves forward.
          <p className="text-xs mt-2">Phase E will turn this into an animated timeline.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {ms.map((m, idx) => (
        <Card key={m.id || idx}>
          <CardContent className="p-3 flex items-center gap-3">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                m.status === "completed"
                  ? "bg-emerald-500"
                  : m.status === "in_progress"
                  ? "bg-blue-500"
                  : "bg-slate-300"
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{m.title}</p>
              <p className="text-xs text-muted-foreground capitalize">{m.status?.replace("_", " ")}</p>
            </div>
            {m.completed_at && (
              <span className="text-xs text-emerald-700">✓ {fmtDate(m.completed_at)}</span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DocumentsTab({ detail }) {
  const props = detail.proposals || [];
  if (props.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No proposals yet. Send one from Admin → Proposals.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {props.map((p) => (
        <Card key={p.id}>
          <CardContent className="p-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{p.title || "Proposal"}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {p.status} · {fmtDate(p.created_at)}
              </p>
            </div>
            {p.sign_url && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.open(p.sign_url, "_blank", "noreferrer")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ActivityTab({ companyId, activity, api, onChange }) {
  const [note, setNote] = useState({ title: "", description: "" });
  const [saving, setSaving] = useState(false);

  const addNote = async () => {
    if (!note.title.trim()) {
      toast.error("Note title required");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/admin/companies/${companyId}/notes`, note);
      toast.success("Note added");
      setNote({ title: "", description: "" });
      onChange();
    } catch {
      toast.error("Could not add note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-2">
          <Label className="text-xs">Quick note</Label>
          <Input
            value={note.title}
            onChange={(e) => setNote({ ...note, title: e.target.value })}
            placeholder="e.g. Called for renewal check-in"
            data-testid="drawer-activity-note-title"
          />
          <Textarea
            value={note.description}
            onChange={(e) => setNote({ ...note, description: e.target.value })}
            placeholder="Optional details…"
            rows={2}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={addNote} disabled={saving} data-testid="drawer-activity-note-submit">
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              Add note
            </Button>
          </div>
        </CardContent>
      </Card>

      {activity.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No activity yet. Notes + system events will appear here.
        </p>
      ) : (
        <div className="space-y-1.5" data-testid="drawer-activity-list">
          {activity.map((a) => {
            const Icon = ACTIVITY_ICONS[a.type] || ActivityIcon;
            return (
              <div
                key={a.id}
                className="flex items-start gap-3 py-2 border-b border-border last:border-0"
              >
                <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5 text-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.title}</p>
                  {a.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                      {a.description}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {fmtDate(a.created_at, true)} · {a.actor}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
