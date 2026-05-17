/**
 * SEO Admin Panel
 *
 * One-click re-submission of the sitemap + individual URLs to:
 *   • Bing IndexNow (Bing + Yandex + Naver — one request, no signup)
 *   • Bing Webmaster API (requires API key in Admin → Integrations)
 *   • Google Search Console (deep-link — Google's API is restrictive)
 *
 * Plus a daily diff: if new public URLs appear in /sitemap.xml since the
 * last scan, we surface them here + send a Notification + (optionally) an
 * OpenRouter-generated SEO review of the new slugs.
 */
import { useEffect, useState, useCallback } from "react";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search,
  Send,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Globe,
  Clock,
  FileSearch,
} from "lucide-react";

function fmtTime(iso) {
  if (!iso) return "never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SeoAdmin() {
  const api = useAdminApi();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedUrls, setSelectedUrls] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/seo/state");
      setState(r.data);
    } catch (e) {
      toast.error("Failed to load SEO state");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const runScan = async () => {
    setBusy((b) => ({ ...b, scan: true }));
    try {
      const r = await api.post("/admin/seo/scan", {});
      const n = r.data?.new_urls?.length || 0;
      toast.success(`Scan complete — ${n} new URL${n === 1 ? "" : "s"}`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Scan failed");
    } finally {
      setBusy((b) => ({ ...b, scan: false }));
    }
  };

  const submitIndexNow = async (urls) => {
    setBusy((b) => ({ ...b, indexnow: true }));
    try {
      const r = await api.post("/admin/seo/submit/indexnow", { urls });
      if (r.data?.ok) {
        toast.success(`IndexNow ✓ submitted ${r.data.count} URL(s) · ${r.data.detail}`);
      } else {
        toast.warning(`IndexNow returned non-OK: ${r.data?.detail}`);
      }
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "IndexNow submit failed");
    } finally {
      setBusy((b) => ({ ...b, indexnow: false }));
    }
  };

  const submitBingWebmaster = async (urls) => {
    setBusy((b) => ({ ...b, bing: true }));
    try {
      const r = await api.post("/admin/seo/submit/bing-webmaster", { urls });
      if (r.data?.ok) {
        toast.success(`Bing Webmaster ✓ submitted ${r.data.count} URL(s)`);
      } else {
        toast.warning(r.data?.detail || "Bing Webmaster returned non-OK");
      }
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Bing Webmaster submit failed");
    } finally {
      setBusy((b) => ({ ...b, bing: false }));
    }
  };

  const openGoogle = () => {
    window.open(state.google_submit_url, "_blank", "noopener,noreferrer");
    toast.info("Opening Google Search Console — paste /sitemap.xml and click Submit there");
  };

  if (loading || !state) {
    return (
      <div className="p-8 text-sm text-muted-foreground" data-testid="seo-admin-loading">
        Loading SEO state…
      </div>
    );
  }

  const newUrls = state.new_urls || [];
  const allUrls = (state.new_urls || []).length
    ? [] // We render the full list below from a virtual "all" lookup; here we use new for spotlight
    : [];

  const submission = state.last_submission || {};
  const lastAi = Object.entries(state.ai_suggestions || {}).sort().reverse()[0];

  const selectedArr = Array.from(selectedUrls);
  const toggleSelect = (u) =>
    setSelectedUrls((prev) => {
      const n = new Set(prev);
      if (n.has(u)) n.delete(u);
      else n.add(u);
      return n;
    });

  return (
    <div className="p-6 lg:p-8 space-y-6" data-testid="seo-admin-page">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Search className="h-6 w-6 text-[#1E3A8A]" />
            Search Engine Submission
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            One-click re-submit the sitemap to Bing (IndexNow + Webmaster API)
            and Google Search Console. Daily scan detects new public URLs and
            files an actionable notification.
          </p>
        </div>
        <Button
          onClick={runScan}
          disabled={busy.scan}
          variant="outline"
          data-testid="seo-rescan-button"
        >
          {busy.scan ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileSearch className="h-4 w-4 mr-2" />
          )}
          Re-scan sitemap
        </Button>
      </div>

      {/* Status pills */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card data-testid="seo-card-total-urls">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Total public URLs
            </div>
            <div className="font-display text-2xl font-bold mt-1">{state.total_urls}</div>
            <div className="text-xs text-muted-foreground mt-1">in sitemap.xml</div>
          </CardContent>
        </Card>
        <Card data-testid="seo-card-new-urls">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              New since last scan
            </div>
            <div
              className={`font-display text-2xl font-bold mt-1 ${
                newUrls.length ? "text-emerald-700" : ""
              }`}
            >
              {newUrls.length}
            </div>
            <div className="text-xs text-muted-foreground mt-1">need submission</div>
          </CardContent>
        </Card>
        <Card data-testid="seo-card-last-scan">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Last scan
            </div>
            <div className="font-display text-sm font-semibold mt-1">
              {fmtTime(state.last_scan_at)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">daily 11:00 UTC</div>
          </CardContent>
        </Card>
        <Card data-testid="seo-card-bing-api">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Bing Webmaster API
            </div>
            <div className="font-display text-sm font-semibold mt-1 flex items-center gap-1.5">
              {state.bing_webmaster_api_configured ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Configured
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  Not set
                </>
              )}
            </div>
            <a
              href="/admin/integrations"
              className="text-xs text-[#1E3A8A] hover:underline mt-1 inline-block"
            >
              Manage in Integrations →
            </a>
          </CardContent>
        </Card>
      </div>

      {/* Submit-all panel */}
      <Card data-testid="seo-submit-all-card">
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Send className="h-5 w-5 text-[#1E3A8A]" />
            Submit entire sitemap
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Ping every search engine with all{" "}
            <strong>{state.total_urls}</strong> public URLs from{" "}
            <a
              href={state.sitemap_url}
              target="_blank"
              rel="noreferrer"
              className="text-[#1E3A8A] underline"
            >
              sitemap.xml
            </a>
            . Anchor URLs (#) are auto-stripped.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <SubmitButton
              testId="seo-submit-indexnow"
              icon={Globe}
              label="Submit to Bing IndexNow"
              hint="Bing + Yandex + Naver · works now"
              ok={submission.indexnow?.ok}
              lastAt={submission.indexnow?.at}
              onClick={() => submitIndexNow(null)}
              busy={busy.indexnow}
            />
            <SubmitButton
              testId="seo-submit-bing-webmaster"
              icon={Search}
              label="Submit to Bing Webmaster"
              hint={
                state.bing_webmaster_api_configured
                  ? "Bing Webmaster URL batch API"
                  : "Requires API key (see Integrations)"
              }
              ok={submission.bing_webmaster?.ok}
              lastAt={submission.bing_webmaster?.at}
              onClick={() => submitBingWebmaster(null)}
              busy={busy.bing}
              disabled={!state.bing_webmaster_api_configured}
            />
            <SubmitButton
              testId="seo-submit-google"
              icon={ExternalLink}
              label="Submit to Google (GSC)"
              hint="Opens Search Console (1 manual click)"
              external
              onClick={openGoogle}
            />
          </div>
          <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground bg-secondary/40">
            <div className="font-medium text-foreground mb-1">IndexNow ownership</div>
            Key file:{" "}
            <a
              href={state.indexnow_key_url}
              target="_blank"
              rel="noreferrer"
              className="text-[#1E3A8A] underline font-mono"
            >
              {state.indexnow_key_url}
            </a>{" "}
            (must be reachable for Bing to accept submissions)
          </div>
        </CardContent>
      </Card>

      {/* New URLs panel */}
      {newUrls.length > 0 && (
        <Card data-testid="seo-new-urls-card" className="border-emerald-200">
          <CardHeader>
            <CardTitle className="font-display text-lg flex items-center gap-2 text-emerald-900">
              <Sparkles className="h-5 w-5" />
              {newUrls.length} new URL{newUrls.length === 1 ? "" : "s"} detected
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Select the ones you want to push to search engines, or hit
              &ldquo;Submit all new&rdquo;.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {newUrls.map((u) => (
                <label
                  key={u}
                  className="flex items-center gap-3 p-3 text-sm cursor-pointer hover:bg-secondary/30"
                  data-testid={`seo-new-url-row`}
                >
                  <input
                    type="checkbox"
                    checked={selectedUrls.has(u)}
                    onChange={() => toggleSelect(u)}
                    className="h-4 w-4"
                  />
                  <span className="font-mono text-xs truncate flex-1">{u}</span>
                  <Badge className="bg-emerald-100 text-emerald-900 border-0 text-[10px]">
                    NEW
                  </Badge>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => submitIndexNow(newUrls)}
                disabled={busy.indexnow}
                className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                data-testid="seo-submit-new-indexnow"
              >
                {busy.indexnow ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4 mr-2" />
                )}
                Submit all new to IndexNow
              </Button>
              {selectedArr.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => submitIndexNow(selectedArr)}
                  disabled={busy.indexnow}
                  data-testid="seo-submit-selected-indexnow"
                >
                  Submit selected ({selectedArr.length})
                </Button>
              )}
              {state.bing_webmaster_api_configured && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => submitBingWebmaster(newUrls)}
                  disabled={busy.bing}
                  data-testid="seo-submit-new-bing"
                >
                  Submit all new to Bing Webmaster
                </Button>
              )}
            </div>
            {lastAi && lastAi[1] && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 mt-2" data-testid="seo-ai-suggestion">
                <div className="text-xs uppercase tracking-wider font-semibold text-blue-900 flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI SEO review (OpenRouter)
                  <span className="text-[10px] text-blue-700/70 normal-case font-normal ml-2">
                    {fmtTime(lastAi[0])}
                  </span>
                </div>
                <p className="text-sm text-blue-900/90 leading-relaxed whitespace-pre-line">
                  {lastAi[1]}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Submission history */}
      <Card data-testid="seo-history-card">
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#1E3A8A]" />
            Last submission per provider
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {["indexnow", "bing_webmaster"].map((p) => {
              const s = submission[p];
              return (
                <div
                  key={p}
                  className="rounded-lg border border-border p-4"
                  data-testid={`seo-history-${p}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-display font-semibold text-sm">
                      {p === "indexnow" ? "Bing IndexNow" : "Bing Webmaster API"}
                    </div>
                    {s ? (
                      s.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-rose-500" />
                      )
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        never
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s ? (
                      <>
                        {fmtTime(s.at)} · {s.count || 0} URL(s)
                        <br />
                        <span className="text-[11px]">{s.detail}</span>
                      </>
                    ) : (
                      "no submission yet"
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SubmitButton({ testId, icon: Icon, label, hint, ok, lastAt, onClick, busy, disabled, external }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      data-testid={testId}
      className={`group rounded-xl border-2 ${
        disabled
          ? "border-slate-200 bg-slate-50 cursor-not-allowed opacity-70"
          : "border-slate-200 bg-white hover:border-[#1E3A8A] hover:shadow-md"
      } p-4 text-left transition-all`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <Icon className={`h-5 w-5 ${disabled ? "text-slate-400" : "text-[#1E3A8A]"}`} />
        <div className="flex items-center gap-1">
          {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#1E3A8A]" />}
          {ok === true && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
          {ok === false && <AlertCircle className="h-3.5 w-3.5 text-rose-500" />}
          {external && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </div>
      <div className="font-display font-semibold text-sm">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
      {lastAt && (
        <div className="text-[10px] text-muted-foreground mt-1.5">
          last: {fmtTime(lastAt)}
        </div>
      )}
    </button>
  );
}
