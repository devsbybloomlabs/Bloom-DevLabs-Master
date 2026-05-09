import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient, useAuth } from "@/lib/auth";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Webhook,
  PlayCircle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/agencyhandy";

const TEST_EVENTS = [
  "ORDER.CREATED",
  "ORDER.UPDATED",
  "INVOICE.STATUS.CHANGED",
  "PAYMENT.RECEIVED",
  "PAYMENT.FAILED",
  "PROPOSAL.SENT",
  "PROPOSAL.ACCEPTED",
  "PROPOSAL.REJECTED",
  "CLIENT.ADDED",
  "PUBLIC_FORM.RESPONSE.CREATED",
  "TASK.COMPLETED",
];

export default function AgencyHandyWebhookPanel() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEvent, setTestEvent] = useState("ORDER.CREATED");

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/agencyhandy/webhooks/status");
      setStatus(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load webhook status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const register = async () => {
    setRegistering(true);
    try {
      const r = await api.post("/agencyhandy/webhooks/register");
      toast.success(
        r.data.action === "created"
          ? `Webhook registered (${r.data.events_count} events)`
          : `Webhook updated (${r.data.events_count} events)`
      );
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Register failed");
    } finally {
      setRegistering(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      await api.post(`/agencyhandy/webhooks/test/${testEvent}`);
      toast.success(`Sent ${testEvent} test event`);
      // Give Agency Handy a moment to deliver the event
      setTimeout(load, 1500);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Test failed");
    } finally {
      setTesting(false);
    }
  };

  if (loading && !status) {
    return <Skeleton className="h-44" data-testid="ah-webhook-loading" />;
  }

  if (!status) return null;
  const registered = status.registered || [];
  const isRegistered = registered.length > 0;

  return (
    <Card className="border-border" data-testid="settings-ah-webhook">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Webhook className="h-4 w-4 text-[#3B82F6]" />
          Agency Handy webhooks
          {isRegistered ? (
            <Badge variant="outline" className="bg-emerald-100 text-emerald-900 border-0">
              Registered
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-100 text-amber-900 border-0">
              Not registered
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground mb-1">
            Target URL
          </div>
          <div className="text-sm font-mono break-all">
            {status.target_url || (
              <span className="text-amber-700">
                No target URL configured. Set <code>AGENCYHANDY_WEBHOOK_TARGET_URL</code> or <code>APP_BASE_URL</code>.
              </span>
            )}
          </div>
        </div>

        {isRegistered && (
          <div className="text-sm">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground mb-1">
              Active webhook
            </div>
            {registered.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between border border-border rounded-lg px-3 py-2"
              >
                <div>
                  <div className="font-medium">{w.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Created {formatDateTime(w.createdAt, { dateOnly: true })} &middot;{" "}
                    {w.isActive ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-rose-700">
                        <XCircle className="h-3 w-3" /> Inactive
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={register}
            disabled={registering || !status.target_url}
            variant="default"
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="ah-webhook-register-button"
          >
            {registering ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {isRegistered ? "Re-sync events" : "Register webhook"}
          </Button>
          {isRegistered && (
            <div className="flex items-center gap-2">
              <Select value={testEvent} onValueChange={setTestEvent}>
                <SelectTrigger
                  className="w-56 h-9"
                  data-testid="ah-webhook-test-event-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEST_EVENTS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={sendTest}
                disabled={testing}
                variant="outline"
                size="sm"
                data-testid="ah-webhook-test-button"
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-2" />
                )}
                Send test
              </Button>
            </div>
          )}
          <Button
            asChild
            variant="link"
            size="sm"
            className="text-[#1E3A8A]"
            data-testid="ah-webhook-docs-link"
          >
            <a
              href="https://api.agencyhandy.com/api/v1/docs/#/Webhook"
              target="_blank"
              rel="noopener noreferrer"
            >
              Docs <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
        </div>

        {status.last_events?.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground mb-2">
              Last events received
            </div>
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {status.last_events.slice(0, 6).map((e, idx) => (
                <li
                  key={idx}
                  className="text-xs px-3 py-2 flex items-center justify-between bg-card"
                >
                  <div className="font-medium">
                    {e.event_name || (
                      <span className="text-muted-foreground">(unknown event)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {e.token_ok ? (
                      <Badge
                        variant="outline"
                        className="bg-emerald-100 text-emerald-900 border-0 text-[10px]"
                      >
                        verified
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-rose-100 text-rose-900 border-0 text-[10px]"
                      >
                        unverified
                      </Badge>
                    )}
                    <span className="text-muted-foreground tabular-nums">
                      {formatDateTime(e.received_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
