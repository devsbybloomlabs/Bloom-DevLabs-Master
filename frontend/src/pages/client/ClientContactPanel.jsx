/**
 * ClientContactPanel — Client portal "Contact Support" tab.
 *
 * POSTs multipart/form-data to /api/clients/me/contact:
 *   subject (required, 2-200 chars)
 *   body (required, 2-5000 chars)
 *   priority (Low / Medium / High)
 *   file (optional, ≤10MB)
 *
 * Lists past submissions below the form with status pills.
 */
import { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Send,
  Paperclip,
  X,
  Mail,
  CheckCircle2,
  Clock,
  AlertCircle,
  CheckCheck,
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL || "";
const MAX_BYTES = 10 * 1024 * 1024;

const STATUS_META = {
  sent: { label: "Sent", color: "bg-blue-100 text-blue-900", Icon: CheckCircle2 },
  queued: { label: "Queued", color: "bg-amber-100 text-amber-900", Icon: Clock },
  resolved: { label: "Resolved", color: "bg-emerald-100 text-emerald-900", Icon: CheckCheck },
  failed: { label: "Failed", color: "bg-rose-100 text-rose-900", Icon: AlertCircle },
};

const PRIORITY_META = {
  low: { color: "bg-slate-100 text-slate-900" },
  medium: { color: "bg-amber-100 text-amber-900" },
  high: { color: "bg-rose-100 text-rose-900" },
};

function fmtBytes(n) {
  if (!n) return "—";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ClientContactPanel({ token }) {
  const [form, setForm] = useState({
    subject: "",
    body: "",
    priority: "medium",
  });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const headers = { Authorization: `Bearer ${token}` };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const r = await axios.get(`${API}/api/clients/me/contact`, { headers });
      setHistory(Array.isArray(r.data) ? r.data : []);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error(`File too large (${fmtBytes(f.size)}). Max is 10MB.`);
      e.target.value = "";
      return;
    }
    setFile(f);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (form.subject.trim().length < 2) {
      toast.error("Subject is required");
      return;
    }
    if (form.body.trim().length < 2) {
      toast.error("Message body is required");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("subject", form.subject.trim());
      fd.append("body", form.body.trim());
      fd.append("priority", form.priority);
      if (file) fd.append("file", file);
      const r = await axios.post(`${API}/api/clients/me/contact`, fd, {
        headers: { ...headers, "Content-Type": "multipart/form-data" },
      });
      if (r.data.queued) {
        toast.success(
          "Message received — our team has been notified. We'll respond within a few hours."
        );
      } else {
        toast.success("Message sent — we'll respond within 2 hours.");
      }
      setForm({ subject: "", body: "", priority: "medium" });
      setFile(null);
      loadHistory();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 413) {
        toast.error("File must be under 10MB");
      } else {
        toast.error(detail || "Submit failed — please try again");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="client-contact-panel">
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Mail className="h-5 w-5 text-[#1E3A8A]" />
            Contact support
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            We typically respond within 2 hours during business days. Your message
            routes directly to our support team via Slack + email.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-[1fr_180px] gap-3">
              <div>
                <Label htmlFor="contact-subject" className="text-sm">
                  Subject <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="contact-subject"
                  required
                  maxLength={200}
                  placeholder="What's it about?"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="mt-1.5"
                  data-testid="contact-subject-input"
                />
              </div>
              <div>
                <Label className="text-sm">Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v })}
                >
                  <SelectTrigger className="mt-1.5" data-testid="contact-priority-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="contact-body" className="text-sm">
                Message <span className="text-rose-500">*</span>
              </Label>
              <Textarea
                id="contact-body"
                required
                rows={5}
                maxLength={5000}
                placeholder="Describe the issue or request in detail"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="mt-1.5"
                data-testid="contact-body-input"
              />
              <div className="text-xs text-muted-foreground text-right mt-1 tabular-nums">
                {form.body.length} / 5000
              </div>
            </div>

            <div>
              <Label className="text-sm">Attachment (optional, max 10MB)</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <label
                  htmlFor="contact-file-input"
                  className="inline-flex items-center gap-2 rounded-md border border-dashed border-border bg-secondary/30 px-3 py-2 text-sm cursor-pointer hover:bg-secondary/60 transition-colors"
                >
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {file ? "Replace file" : "Attach a file"}
                  </span>
                </label>
                <input
                  id="contact-file-input"
                  type="file"
                  className="hidden"
                  onChange={onFile}
                  data-testid="contact-file-input"
                />
                {file && (
                  <div className="flex items-center gap-2 rounded-md bg-secondary px-2.5 py-1 text-xs">
                    <span className="truncate max-w-[200px]">{file.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {fmtBytes(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-muted-foreground hover:text-rose-600"
                      aria-label="Remove file"
                      data-testid="contact-file-remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={busy}
                className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
                data-testid="contact-submit-button"
              >
                <Send className="h-4 w-4 mr-2" />
                {busy ? "Sending…" : "Send message"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Previous messages</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground" data-testid="contact-history-empty">
              No messages yet — send your first one above.
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((c) => {
                const meta = STATUS_META[c.status] || STATUS_META.queued;
                const StatusIcon = meta.Icon;
                const pri = PRIORITY_META[c.priority] || PRIORITY_META.medium;
                return (
                  <div
                    key={c.id}
                    className="rounded-lg border border-border p-3 hover:bg-secondary/30 transition-colors"
                    data-testid={`contact-history-row-${c.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {c.ticket_ref && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                navigator.clipboard?.writeText(c.ticket_ref).then(
                                  () => toast.success(`${c.ticket_ref} copied`),
                                  () => {}
                                );
                              }}
                              title="Click to copy"
                              className="font-mono text-[10px] font-semibold bg-secondary/70 hover:bg-secondary px-2 py-0.5 rounded transition-colors cursor-copy"
                              data-testid={`contact-history-ticket-${c.id}`}
                            >
                              {c.ticket_ref}
                            </button>
                          )}
                          <span className="font-medium text-sm truncate">{c.subject}</span>
                          <Badge className={`${pri.color} border-0 text-[10px] capitalize`}>
                            {c.priority}
                          </Badge>
                          <Badge className={`${meta.color} border-0 text-[10px]`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {meta.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {c.body}
                        </p>
                        {c.attachment && (
                          <a
                            href={`${API}/api/clients/me/contact/attachment/${c.attachment.id}?_t=${token.slice(0, 8)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 mt-1.5 text-xs text-[#1E3A8A] hover:text-[#3B82F6]"
                            onClick={async (e) => {
                              e.preventDefault();
                              try {
                                const res = await axios.get(
                                  `${API}/api/clients/me/contact/attachment/${c.attachment.id}`,
                                  { headers, responseType: "blob" }
                                );
                                const url = URL.createObjectURL(res.data);
                                const link = document.createElement("a");
                                link.href = url;
                                link.download = c.attachment.original_name || c.attachment.id;
                                link.click();
                                URL.revokeObjectURL(url);
                              } catch {
                                toast.error("Could not download attachment");
                              }
                            }}
                            data-testid={`contact-attachment-link-${c.id}`}
                          >
                            <Paperclip className="h-3 w-3" />
                            {c.attachment.original_name} · {fmtBytes(c.attachment.size_bytes)}
                          </a>
                        )}
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
                        {fmtTime(c.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
