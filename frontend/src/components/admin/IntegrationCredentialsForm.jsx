/**
 * IntegrationCredentialsForm
 *
 * Lets the founder paste Approval Studio + ThriveDesk + Slack credentials
 * directly from the admin UI — no `.env` edits required. Values are stored
 * in `app_settings.integration_credentials` MongoDB doc. Env vars always win
 * if present (so production overrides via Emergent secrets still work).
 *
 * Secrets are masked on read; the field is empty by default so a paste
 * uploads a new value. Empty submit = clear the field.
 */
import { useEffect, useState, useCallback } from "react";
import { useAdminApi } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  KeyRound,
  Save,
  RefreshCw,
  ExternalLink,
  MessageSquare,
  Eye,
  EyeOff,
  CalendarDays,
  PlugZap,
  FileSignature,
  CreditCard,
} from "lucide-react";

const PROVIDER_SPECS = [
  {
    key: "paypal",
    label: "PayPal",
    icon: CreditCard,
    color: "#1E3A8A",
    helpUrl: "https://developer.paypal.com/dashboard/applications",
    description:
      "REST API credentials. Use SANDBOX in preview, LIVE in production — set them independently in each environment so dev and prod stay isolated.",
    fields: [
      { name: "client_id", label: "Client ID", placeholder: "AcqmRBWBxVefV5FQ0A…" },
      { name: "client_secret", label: "Client secret", secret: true, placeholder: "Paste live or sandbox secret" },
      {
        name: "env",
        label: "Environment",
        kind: "select",
        options: [
          { value: "sandbox", label: "sandbox · for preview / dev" },
          { value: "live", label: "live · for production payments" },
        ],
        placeholder: "sandbox",
      },
      { name: "webhook_id", label: "Webhook ID (optional)", placeholder: "WH-…" },
    ],
    testPath: "/admin/integrations/paypal/test",
  },
  {
    key: "breezedocs",
    label: "BreezeDocs",
    icon: FileSignature,
    color: "#0EA5E9",
    helpUrl: "https://breezedoc.com/developer/docs/",
    description: "Personal access token (JWT bearer). Powers proposals + contracts (Sales → Proposals tab).",
    fields: [
      { name: "api_key", label: "Personal access token", secret: true, placeholder: "eyJ0eXAiOiJKV1Qi…" },
    ],
  },
  {
    key: "slack",
    label: "Slack (incoming webhook)",
    icon: MessageSquare,
    color: "#7C3AED",
    helpUrl: "https://api.slack.com/messaging/webhooks",
    description: "Single webhook URL. Receives URGENT support escalations + manual test pings.",
    fields: [
      {
        name: "webhook_url",
        label: "Incoming webhook URL",
        secret: true,
        placeholder: "https://hooks.slack.com/services/...",
      },
    ],
  },
  {
    key: "google_calendar",
    label: "Google Calendar",
    icon: CalendarDays,
    color: "#10B981",
    helpUrl: "https://console.cloud.google.com/",
    description:
      "OAuth2 client from Google Cloud Console. Click Connect button after saving.",
    fields: [
      { name: "client_id", label: "OAuth client ID", placeholder: "xxxxxxxx.apps.googleusercontent.com" },
      { name: "client_secret", label: "OAuth client secret", secret: true },
      {
        name: "redirect_uri",
        label: "Redirect URI (must match Google Cloud)",
        placeholder: "https://your-app/api/oauth/calendar/callback",
      },
    ],
    customConnect: true,
  },
];

export default function IntegrationCredentialsForm() {
  const api = useAdminApi();
  const [stored, setStored] = useState({});
  const [drafts, setDrafts] = useState({});
  const [visible, setVisible] = useState({});
  const [busy, setBusy] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/integrations/credentials");
      setStored(r.data.providers || {});
    } catch {
      toast.error("Could not load credentials");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onSave = async (providerKey) => {
    const fields = drafts[providerKey] || {};
    // Skip noop saves
    if (Object.keys(fields).length === 0) {
      toast.info("No changes to save");
      return;
    }
    setBusy({ ...busy, [providerKey]: true });
    try {
      await api.put(`/admin/integrations/credentials/${providerKey}`, {
        fields,
      });
      toast.success(`${providerKey} credentials saved`);
      setDrafts({ ...drafts, [providerKey]: {} });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setBusy({ ...busy, [providerKey]: false });
    }
  };

  const onTest = async (providerKey) => {
    setBusy({ ...busy, [`${providerKey}_test`]: true });
    try {
      // Backend test endpoints follow the `-` separator
      const SLUG_OVERRIDES = {
        google_calendar: "calendar",
      };
      const slug = SLUG_OVERRIDES[providerKey] || providerKey;
      const r = await api.post(`/admin/integrations/${slug}/test`);
      if (r.data?.ok) {
        toast.success(`${providerKey} ✓ test passed`);
      } else if (r.data?.mode === "mock") {
        toast.info(`${providerKey} is in MOCK mode — set credentials to go live`);
      } else {
        toast.warning(`${providerKey}: ${r.data?.reason || "test returned non-ok"}`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Test failed");
    } finally {
      setBusy({ ...busy, [`${providerKey}_test`]: false });
    }
  };

  const onConnect = async (providerKey) => {
    setBusy({ ...busy, [`${providerKey}_connect`]: true });
    try {
      const slug = providerKey === "google_calendar" ? "calendar" : providerKey;
      const r = await api.get(`/admin/integrations/${slug}/start`);
      if (r.data?.authorization_url) {
        window.open(r.data.authorization_url, "_blank", "noopener,noreferrer");
        toast.info("Approve access in the new tab, then refresh this page");
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start OAuth");
    } finally {
      setBusy({ ...busy, [`${providerKey}_connect`]: false });
    }
  };

  return (
    <Card className="border-border" data-testid="integration-credentials-card">
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-[#1E3A8A]" />
          Credentials
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Paste keys here to flip PayPal, BreezeDocs, Slack, and Google Calendar
          credentials live in <strong>this environment</strong>. Preview and
          production each have their own database, so saving sandbox keys here
          won&apos;t affect live. Env vars on the server take precedence over
          DB for BreezeDocs/Slack/Calendar; PayPal is DB-first so the form is
          authoritative.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          PROVIDER_SPECS.map((spec) => {
            const Icon = spec.icon;
            const currentStored = stored[spec.key] || {};
            const draft = drafts[spec.key] || {};
            const hasAnyStored = Object.values(currentStored).some(
              (v) => typeof v === "string" && v
            );
            return (
              <div
                key={spec.key}
                className="rounded-xl border border-border p-4 space-y-3"
                data-testid={`credentials-${spec.key}-section`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-9 w-9 rounded-lg text-white flex items-center justify-center flex-shrink-0"
                      style={{ background: spec.color }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-semibold">{spec.label}</span>
                        {hasAnyStored ? (
                          <Badge className="bg-emerald-100 text-emerald-900 border-0 text-[10px]">
                            Stored
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Empty
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {spec.description}
                      </p>
                    </div>
                  </div>
                  <a
                    href={spec.helpUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-[#1E3A8A] hover:text-[#3B82F6] inline-flex items-center gap-1"
                  >
                    Docs
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {spec.fields.map((f) => {
                    const storedVal = currentStored[f.name] || "";
                    const draftVal = draft[f.name] ?? "";
                    const visKey = `${spec.key}__${f.name}`;
                    const isVisible = visible[visKey];
                    return (
                      <div key={f.name}>
                        <Label className="text-sm">
                          {f.label}
                          {storedVal && (
                            <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                              · stored: {storedVal}
                            </span>
                          )}
                        </Label>
                        <div className="relative mt-1.5">
                          {f.kind === "select" ? (
                            <select
                              value={draftVal || storedVal || ""}
                              onChange={(e) =>
                                setDrafts({
                                  ...drafts,
                                  [spec.key]: { ...draft, [f.name]: e.target.value },
                                })
                              }
                              data-testid={`credentials-${spec.key}-${f.name}-input`}
                              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              <option value="">— Select —</option>
                              {(f.options || []).map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              type={f.secret && !isVisible ? "password" : "text"}
                              value={draftVal}
                              placeholder={f.placeholder || (storedVal ? "(leave blank to keep)" : "")}
                              onChange={(e) =>
                                setDrafts({
                                  ...drafts,
                                  [spec.key]: { ...draft, [f.name]: e.target.value },
                                })
                              }
                              className={f.secret ? "pr-10 font-mono text-xs" : ""}
                              data-testid={`credentials-${spec.key}-${f.name}-input`}
                            />
                          )}
                          {f.secret && f.kind !== "select" && (
                            <button
                              type="button"
                              onClick={() =>
                                setVisible({ ...visible, [visKey]: !isVisible })
                              }
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              aria-label={isVisible ? "Hide" : "Show"}
                            >
                              {isVisible ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {spec.customConnect && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onConnect(spec.key)}
                      disabled={busy[`${spec.key}_connect`]}
                      data-testid={`credentials-${spec.key}-connect-button`}
                    >
                      {busy[`${spec.key}_connect`] ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <PlugZap className="h-4 w-4 mr-2" />
                      )}
                      Connect
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onTest(spec.key)}
                    disabled={busy[`${spec.key}_test`]}
                    data-testid={`credentials-${spec.key}-test-button`}
                  >
                    {busy[`${spec.key}_test`] ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Test connection
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onSave(spec.key)}
                    disabled={busy[spec.key]}
                    className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                    data-testid={`credentials-${spec.key}-save-button`}
                  >
                    {busy[spec.key] ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
