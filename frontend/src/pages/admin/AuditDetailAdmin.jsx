/**
 * AuditDetailAdmin — per-submission view with Claude analysis + sales workflow.
 * Mounted at /admin/audits/:auditId.
 */
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ChevronLeft,
  Loader2,
  Sparkles,
  RefreshCw,
  Trash2,
  Phone,
  Mail,
  Building2,
  Briefcase,
  Calendar,
  ExternalLink,
} from "lucide-react";

const STATUSES = [
  { value: "submitted", label: "Submitted" },
  { value: "analyzed", label: "Analyzed" },
  { value: "reviewed", label: "Reviewed" },
  { value: "called", label: "Called" },
  { value: "closed_won", label: "Closed — Won" },
  { value: "closed_lost", label: "Closed — Lost" },
  { value: "abandoned", label: "Abandoned" },
];

function renderMarkdown(md) {
  if (!md) return "";
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  html = html.replace(/^###\s+(.*)$/gm, '<h3 class="font-display text-base font-semibold mt-5 mb-2">$1</h3>');
  html = html.replace(/^##\s+(.*)$/gm, '<h2 class="font-display text-lg font-semibold mt-6 mb-2">$1</h2>');
  html = html.replace(/^#\s+(.*)$/gm, '<h1 class="font-display text-xl font-semibold mt-6 mb-2">$1</h1>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(/^- (.*)$/gm, '<li class="ml-5 list-disc">$1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>(\n)?)+/g, (block) => `<ul class="my-2 space-y-1">${block}</ul>`);
  html = html
    .split(/\n{2,}/)
    .map((b) => {
      if (/^<(h\d|ul|li|strong)/.test(b.trim())) return b;
      return `<p class="leading-relaxed my-2 text-sm">${b.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");
  return html;
}

export default function AuditDetailAdmin() {
  const api = useAdminApi();
  const nav = useNavigate();
  const { auditId } = useParams();
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [notes, setNotes] = useState("");
  const [dealValue, setDealValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/admin/audits/${auditId}`);
      setAudit(r.data);
      setNotes(r.data.notes || "");
      setDealValue(r.data.deal_value_usd || "");
    } catch {
      toast.error("Failed to load audit");
    } finally {
      setLoading(false);
    }
  }, [api, auditId]);

  useEffect(() => {
    load();
  }, [load]);

  const updateField = async (patch) => {
    setSaving(true);
    try {
      const r = await api.patch(`/admin/audits/${auditId}`, patch);
      setAudit(r.data);
      toast.success("Saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onReanalyze = async () => {
    setReanalyzing(true);
    try {
      await api.post(`/admin/audits/${auditId}/reanalyze`, {});
      toast.success("AI analysis re-queued — refresh in 10s");
      setTimeout(load, 10000);
    } catch {
      toast.error("Re-analysis failed");
    } finally {
      setReanalyzing(false);
    }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this audit permanently?")) return;
    try {
      await api.delete(`/admin/audits/${auditId}`);
      toast.success("Deleted");
      nav("/admin/audits");
    } catch {
      toast.error("Delete failed");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!audit) {
    return <div className="text-sm text-muted-foreground">Audit not found.</div>;
  }

  return (
    <div className="space-y-6" data-testid="audit-detail">
      <button
        onClick={() => nav("/admin/audits")}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        data-testid="audit-detail-back"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to audits
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px]">{audit.industry}</Badge>
            <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px]">{audit.budget_range}</Badge>
            <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]">{audit.timeline}</Badge>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            {audit.customer_name} <span className="text-muted-foreground font-normal">@ {audit.company_name}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Submitted {new Date(audit.created_at).toLocaleString()}
            {audit.source_cta && audit.source_cta !== "direct" && (
              <> · via <code>{audit.source_cta}</code></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onReanalyze} disabled={reanalyzing} data-testid="audit-reanalyze">
            {reanalyzing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Re-analyze
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} data-testid="audit-detail-delete">
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      </div>

      <Card className="border-border">
        <CardContent className="p-5 grid sm:grid-cols-2 gap-3 text-sm">
          <InfoRow icon={Mail} label="Email">
            <a href={`mailto:${audit.customer_email}`} className="text-[#1E3A8A] hover:underline">{audit.customer_email}</a>
          </InfoRow>
          <InfoRow icon={Phone} label="Phone">
            <a href={`tel:${audit.customer_phone}`} className="text-[#1E3A8A] hover:underline">{audit.customer_phone}</a>
          </InfoRow>
          <InfoRow icon={Briefcase} label="Role">{audit.customer_title}</InfoRow>
          <InfoRow icon={Building2} label="Size">{audit.company_size}</InfoRow>
          <InfoRow icon={Sparkles} label="Pain point" full>{audit.pain_point}</InfoRow>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="border-border">
          <CardContent className="p-5">
            <p className="font-medium text-sm mb-2">Customer&rsquo;s current workflow</p>
            <p className="text-sm whitespace-pre-wrap text-foreground/90" data-testid="audit-workflow-text">{audit.workflow_description}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-5">
            <p className="font-medium text-sm mb-2">Biggest bottleneck</p>
            <p className="text-sm whitespace-pre-wrap text-foreground/90" data-testid="audit-bottleneck-text">{audit.bottleneck_description}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2 border-[#1E3A8A]/30 bg-[#1E3A8A]/[0.03]">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#1E3A8A]" />
              <p className="font-display text-lg font-semibold">AI Analysis · Claude Sonnet 4.5</p>
            </div>
            {audit.analyzed_at && (
              <span className="text-xs text-muted-foreground">
                Analyzed {new Date(audit.analyzed_at).toLocaleString()}
              </span>
            )}
          </div>
          {audit.quick_win && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 mb-4">
              <p className="text-xs uppercase tracking-wide text-amber-900 font-medium mb-0.5">Quick Win</p>
              <p className="text-sm text-amber-900">{audit.quick_win}</p>
            </div>
          )}
          {audit.recommendation_titles?.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {audit.recommendation_titles.map((t, i) => (
                <Badge key={i} className="bg-[#1E3A8A] text-white border-0">{i + 1}. {t}</Badge>
              ))}
            </div>
          )}
          {audit.analyzed_recommendations ? (
            <div
              className="prose prose-sm max-w-none"
              data-testid="audit-ai-analysis"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(audit.analyzed_recommendations) }}
            />
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Analysis pending — usually ready within 1–2 minutes of submission. Click &quot;Re-analyze&quot; if it&rsquo;s been longer.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="p-5 space-y-4">
          <p className="font-display text-lg font-semibold">Sales workflow</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Status</Label>
              <Select
                value={audit.status}
                onValueChange={(v) => updateField({ status: v })}
              >
                <SelectTrigger className="mt-1.5" data-testid="audit-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Deal value (USD, if won)</Label>
              <Input
                type="number"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                onBlur={() => {
                  const v = parseFloat(dealValue);
                  if (!isNaN(v)) updateField({ deal_value_usd: v });
                }}
                placeholder="9995"
                className="mt-1.5"
                data-testid="audit-deal-value"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Sales notes</Label>
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (audit.notes || "")) updateField({ notes });
              }}
              placeholder="Call recap, objections, next step…"
              className="mt-1.5"
              data-testid="audit-notes"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              asChild
              data-testid="audit-mailto"
            >
              <a href={`mailto:${audit.customer_email}?subject=Your%20Bloom%20Labs%20Audit&body=Hi%20${encodeURIComponent(audit.customer_name)}%2C%0A%0A`}>
                <Mail className="h-4 w-4 mr-1.5" />
                Email customer
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
              data-testid="audit-tel"
            >
              <a href={`tel:${audit.customer_phone}`}>
                <Phone className="h-4 w-4 mr-1.5" />
                Call now
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateField({ call_completed_at: new Date().toISOString(), status: "called" })
              }
              data-testid="audit-mark-called"
            >
              <Calendar className="h-4 w-4 mr-1.5" />
              Mark as called
            </Button>
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ icon: Icon, label, full, children }) {
  return (
    <div className={`flex items-start gap-2 ${full ? "sm:col-span-2" : ""}`}>
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
        <p className="text-sm">{children}</p>
      </div>
    </div>
  );
}
