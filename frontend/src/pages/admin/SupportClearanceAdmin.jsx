/**
 * SupportClearanceAdmin — Phase C lookup tool for the support team.
 *
 * Workflow:
 *   1. Agent receives a chat / email from a client.
 *   2. Asks them to share their Support UID (the BL-SUP-XXXXXX shown in
 *      their portal header) OR an email address.
 *   3. Pastes it here → sees the company, support tier, SLA promise, the
 *      pre-written response spiel, recent tickets, active subscriptions.
 *   4. One-click "Copy SLA spiel" → paste into ThriveDesk / email.
 *   5. If tier is wrong, agent can override tier or rotate UID right here.
 *
 * Also includes an SLA matrix editor at the bottom for tier copy edits.
 */
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Shield,
  Search,
  Copy,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Hash,
  Mail,
  Phone,
  ExternalLink,
  Settings2,
  Crown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

const TIER_META = {
  vip: { label: "VIP", cls: "bg-amber-100 text-amber-900 border-amber-300", Icon: Crown },
  premium: { label: "Premium", cls: "bg-sky-100 text-sky-900 border-sky-300", Icon: Shield },
  standard: { label: "Standard", cls: "bg-secondary text-foreground border-border", Icon: Clock },
  none: { label: "No plan", cls: "bg-slate-100 text-slate-600 border-slate-200", Icon: AlertCircle },
};

export default function SupportClearanceAdmin() {
  const api = useAdminApi();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [sla, setSla] = useState(null);

  const loadSla = useCallback(async () => {
    try {
      const r = await api.get("/admin/support-clearance/sla");
      setSla(r.data?.matrix || null);
    } catch {
      /* silent */
    }
  }, [api]);

  useEffect(() => {
    loadSla();
  }, [loadSla]);

  const onSearch = async (e) => {
    e?.preventDefault?.();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setResult(null);
    try {
      const q = query.trim();
      // Auto-detect: UID format vs email
      const isUid = /^BL-SUP-[A-Z0-9]{4,8}$/i.test(q);
      const params = isUid ? `uid=${encodeURIComponent(q.toUpperCase())}` : `email=${encodeURIComponent(q)}`;
      const r = await api.get(`/admin/support-clearance/lookup?${params}`);
      setResult(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || "Lookup failed");
    } finally {
      setSearching(false);
    }
  };

  const copy = async (text, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      window.prompt("Copy this:", text);
    }
  };

  const setTier = async (newTier) => {
    if (!result?.company?.id) return;
    if (!window.confirm(`Change tier to ${newTier.toUpperCase()}?`)) return;
    try {
      await api.post(`/admin/support-clearance/companies/${result.company.id}/tier`, {
        tier: newTier,
        reason: "Manual override from Support Clearance",
      });
      toast.success("Tier updated");
      onSearch();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update tier");
    }
  };

  const rotateUid = async () => {
    if (!result?.company?.id) return;
    if (!window.confirm("Rotate Support UID? The old UID will stop working.")) return;
    try {
      const r = await api.post(`/admin/support-clearance/companies/${result.company.id}/regenerate-uid`);
      toast.success(`New UID: ${r.data.support_uid}`);
      onSearch();
    } catch {
      toast.error("Could not rotate UID");
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-support-clearance-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">
            Support Clearance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paste a Support UID (e.g. <code className="px-1 rounded bg-secondary text-xs">BL-SUP-A4F2X9</code>)
            or email address. We'll surface the tier, the right SLA spiel,
            and any active context for the agent.
          </p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={onSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="BL-SUP-A4F2X9 or client@example.com"
            className="pl-9 h-11 text-base"
            autoFocus
            data-testid="support-clearance-search-input"
          />
        </div>
        <Button
          type="submit"
          disabled={searching || !query.trim()}
          size="lg"
          data-testid="support-clearance-search-submit"
        >
          {searching ? "Looking up…" : "Lookup"}
        </Button>
      </form>

      {/* Results */}
      {searching && <Skeleton className="h-64 w-full" />}

      {error && !searching && (
        <Card className="border-rose-200 bg-rose-50" data-testid="support-clearance-error">
          <CardContent className="p-5 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <p className="text-sm text-rose-900">{error}</p>
          </CardContent>
        </Card>
      )}

      {result && !searching && (
        <>
          <ClearanceCard result={result} onCopy={copy} onSetTier={setTier} onRotateUid={rotateUid} />
          <TicketsCard tickets={result.recent_tickets || []} />
          <ActiveSubscriptionsCard subs={result.active_subscriptions || []} />
          <ContactsCard contacts={result.contacts || []} />
        </>
      )}

      {/* SLA matrix editor */}
      {sla && (
        <SlaEditor api={api} sla={sla} onSaved={loadSla} />
      )}
    </div>
  );
}

function ClearanceCard({ result, onCopy, onSetTier, onRotateUid }) {
  const { company, sla } = result;
  const tier = company.support_tier || "none";
  const meta = TIER_META[tier];
  const Icon = meta.Icon;
  return (
    <Card className="border-2" style={{ borderColor: `var(--${meta.color || "border"})` }} data-testid="support-clearance-result">
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Company
            </p>
            <h2 className="text-2xl font-bold">{company.name}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {company.primary_email}
              </span>
              {company.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {company.phone}
                </span>
              )}
            </p>
          </div>
          <Badge
            variant="outline"
            className={`text-base px-3 py-1 ${meta.cls}`}
            data-testid="support-clearance-tier-badge"
          >
            <Icon className="h-4 w-4 mr-1.5" />
            {meta.label}
          </Badge>
        </div>

        {/* Support UID */}
        <div className="bg-secondary/40 rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Support UID
            </p>
            <p className="font-mono text-lg font-semibold" data-testid="support-clearance-uid">
              {company.support_uid || "—"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCopy(company.support_uid || "", "UID copied")}
              data-testid="support-clearance-copy-uid"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy UID
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onRotateUid}
              title="Rotate Support UID"
              data-testid="support-clearance-rotate-uid"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* SLA info */}
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            SLA promise · {sla.response_time}
          </p>
          <div className="relative">
            <Textarea
              value={sla.spiel || ""}
              readOnly
              rows={5}
              className="bg-white pr-12 font-medium text-sm"
              data-testid="support-clearance-spiel"
            />
            <Button
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => onCopy(sla.spiel || "", "Spiel copied — paste into ThriveDesk")}
              data-testid="support-clearance-copy-spiel"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy spiel
            </Button>
          </div>
        </div>

        {/* Tier override */}
        <div className="border-t border-border pt-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Manual override (use if a subscription didn't auto-detect)
          </p>
          <div className="flex flex-wrap gap-2">
            {["vip", "premium", "standard", "none"].map((t) => (
              <Button
                key={t}
                size="sm"
                variant={tier === t ? "default" : "outline"}
                onClick={() => onSetTier(t)}
                disabled={tier === t}
                data-testid={`support-clearance-set-tier-${t}`}
              >
                Set {t.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TicketsCard({ tickets }) {
  if (!tickets.length) return null;
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Recent tickets ({tickets.length})
        </p>
        <div className="space-y-2">
          {tickets.slice(0, 5).map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-border last:border-0">
              <Hash className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-xs">{t.ticket_ref || t.id.slice(0, 8)}</span>
              <span className="flex-1 truncate">{t.subject}</span>
              <Badge variant="outline" className="text-[10px] capitalize">{t.status}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveSubscriptionsCard({ subs }) {
  if (!subs.length) return null;
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Active subscriptions ({subs.length})
        </p>
        <div className="space-y-2">
          {subs.map((s) => (
            <div key={s.id || s.subscription_id} className="flex items-center gap-2 text-sm py-1.5 border-b border-border last:border-0">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>{s.plan_name || s.plan_id || "Subscription"}</span>
              <span className="flex-1" />
              <Badge variant="outline" className="text-[10px] capitalize">{s.status}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ContactsCard({ contacts }) {
  if (!contacts.length) return null;
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Contacts ({contacts.length})
        </p>
        <div className="space-y-2">
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-border last:border-0">
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground truncate">{c.email}</span>
              {c.is_primary && (
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-900 border-amber-300">
                  Primary
                </Badge>
              )}
              {c.role && <span className="ml-auto text-xs text-muted-foreground">{c.role}</span>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SlaEditor({ api, sla, onSaved }) {
  const [openTier, setOpenTier] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  const startEdit = (tier) => {
    setOpenTier(tier);
    setDraft({ ...(sla[tier] || {}) });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/support-clearance/sla/${openTier}`, {
        label: draft.label,
        response_time: draft.response_time,
        spiel: draft.spiel,
      });
      toast.success("SLA updated");
      setOpenTier(null);
      onSaved();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-secondary/30">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            <p className="font-medium">SLA Matrix</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {Object.entries(sla).map(([tier, info]) => {
            const meta = TIER_META[tier] || TIER_META.none;
            return (
              <button
                key={tier}
                onClick={() => startEdit(tier)}
                className="text-left bg-card border border-border rounded-lg p-3 hover:border-primary/40 transition-all"
                data-testid={`sla-edit-${tier}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="outline" className={`text-[10px] uppercase ${meta.cls}`}>
                    {meta.label}
                  </Badge>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{info.spiel}</p>
              </button>
            );
          })}
        </div>

        {/* Inline editor */}
        {openTier && (
          <div className="mt-4 bg-card border border-border rounded-lg p-4 space-y-3">
            <p className="font-medium text-sm uppercase">{openTier} tier</p>
            <div>
              <Label className="text-xs">Label</Label>
              <Input
                value={draft.label || ""}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Response time</Label>
              <Input
                value={draft.response_time || ""}
                onChange={(e) => setDraft({ ...draft, response_time: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Spiel (paste into ThriveDesk)</Label>
              <Textarea
                value={draft.spiel || ""}
                onChange={(e) => setDraft({ ...draft, spiel: e.target.value })}
                rows={5}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setOpenTier(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving} data-testid="sla-editor-save">
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
