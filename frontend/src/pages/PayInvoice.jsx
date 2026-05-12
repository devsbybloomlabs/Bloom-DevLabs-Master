/**
 * PayInvoice — public, unauthenticated pay page.
 *
 * URL: /pay/invoice/:invoiceId
 *
 * The invoice ID is a UUID, so anyone with the link can pay (this is the
 * whole point — we put it inside the invoice email to collapse "email →
 * portal login → portal nav → pay" into a single click).
 *
 * The page:
 *  1. Fetches a lightweight invoice summary from `/api/public/invoices/{id}/summary`
 *  2. Renders the totals + line items in the Bloom Labs shell
 *  3. "Pay with PayPal" CTA hits `/api/public/invoices/{id}/pay` which
 *     redirects (302) to the PayPal approval URL.
 *
 * Already paid / voided invoices render a status banner instead.
 */
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, FileText, Shield, Download, ArrowRight } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const LOGO_URL =
  "https://customer-assets.emergentagent.com/job_6ae936eb-6f62-4e1a-8f50-8423b436560b/artifacts/xayvxy1s_Logo%20-%20Full%20-%20MASTER.png";

function fmtMoney(n, c = "USD") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c,
      maximumFractionDigits: 2,
    }).format(Number(n || 0));
  } catch {
    return `${c} ${Number(n || 0).toFixed(2)}`;
  }
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

const STATUS_STYLES = {
  paid: "bg-emerald-100 text-emerald-900 border-emerald-300",
  issued: "bg-blue-100 text-blue-900 border-blue-300",
  draft: "bg-secondary text-foreground border-border",
  void: "bg-rose-100 text-rose-900 border-rose-300",
  overdue: "bg-rose-100 text-rose-900 border-rose-300",
  partial: "bg-amber-100 text-amber-900 border-amber-300",
};

export default function PayInvoice() {
  const { invoiceId } = useParams();
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${BACKEND}/api/public/invoices/${invoiceId}/summary`);
      setInv(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || "Invoice not found");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePay = () => {
    setRedirecting(true);
    // Server-side redirect to PayPal approval URL.
    window.location.href = `${BACKEND}/api/public/invoices/${invoiceId}/pay`;
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="pay-invoice-page">
      {/* Header */}
      <header className="bg-white border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" data-testid="pay-invoice-home-link">
            <img src={LOGO_URL} alt="Bloom Labs" className="h-7 w-auto" />
          </Link>
          <a
            href="mailto:founder@thesalvador.group"
            className="text-sm text-muted-foreground hover:text-foreground"
            data-testid="pay-invoice-support-link"
          >
            Need help?
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {loading && (
          <div className="space-y-4" data-testid="pay-invoice-loading">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {!loading && error && (
          <Card data-testid="pay-invoice-error">
            <CardContent className="p-10 text-center space-y-3">
              <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
              <h1 className="text-xl font-bold">We couldn't find this invoice</h1>
              <p className="text-muted-foreground">{error}</p>
              <Link to="/" className="text-primary hover:underline inline-block">
                Back to bybloomlabs.com
              </Link>
            </CardContent>
          </Card>
        )}

        {!loading && inv && (
          <>
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-sm uppercase tracking-wider text-muted-foreground mb-1">
                  Invoice
                </p>
                <h1
                  className="text-3xl font-bold tracking-tight"
                  data-testid="pay-invoice-number"
                >
                  {inv.number}
                </h1>
                {inv.client_name && (
                  <p className="text-muted-foreground mt-1">For {inv.client_name}</p>
                )}
              </div>
              <Badge
                variant="outline"
                className={`text-xs px-3 py-1 capitalize ${STATUS_STYLES[inv.status] || ""}`}
                data-testid="pay-invoice-status"
              >
                {inv.status}
              </Badge>
            </div>

            {/* Already paid / voided banners */}
            {inv.status === "paid" && (
              <Card className="border-emerald-300 bg-emerald-50 mb-6" data-testid="pay-invoice-paid-banner">
                <CardContent className="p-6 flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-900">This invoice has been paid in full.</p>
                    <p className="text-sm text-emerald-800">
                      Thank you! A receipt has been emailed to you. Need a PDF copy?{" "}
                      <a
                        href={`${BACKEND}/api/public/invoices/${invoiceId}/pay`}
                        className="underline hidden"
                      >
                        Re-download
                      </a>
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {inv.status === "void" && (
              <Card className="border-rose-300 bg-rose-50 mb-6" data-testid="pay-invoice-void-banner">
                <CardContent className="p-6 flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
                  <p className="font-semibold text-rose-900">
                    This invoice has been voided. No payment is due.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Amount due card */}
            <Card className="mb-6 shadow-sm">
              <CardContent className="p-8 space-y-6">
                <div className="flex items-baseline justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                      {inv.status === "paid" ? "Amount paid" : "Balance due"}
                    </p>
                    <p className="text-4xl font-bold" data-testid="pay-invoice-balance">
                      {fmtMoney(
                        inv.status === "paid" ? inv.total : inv.balance_due || inv.total,
                        inv.currency
                      )}
                    </p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <div>Issued {fmtDate(inv.issued_at)}</div>
                    {inv.due_at && <div>Due {fmtDate(inv.due_at)}</div>}
                    {inv.paid_at && <div>Paid {fmtDate(inv.paid_at)}</div>}
                  </div>
                </div>

                {/* Pay CTA */}
                {(inv.status === "issued" ||
                  inv.status === "partial" ||
                  inv.status === "overdue" ||
                  inv.status === "draft") &&
                  Number(inv.balance_due || inv.total || 0) > 0 && (
                    <>
                      <Button
                        size="lg"
                        className="w-full text-base py-6"
                        onClick={handlePay}
                        disabled={redirecting}
                        data-testid="pay-invoice-pay-button"
                      >
                        {redirecting ? (
                          "Redirecting to PayPal…"
                        ) : (
                          <>
                            Pay with PayPal
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <Shield className="w-3 h-3" />
                        <span>Secure checkout · You can pay by card without a PayPal account</span>
                      </div>
                    </>
                  )}
              </CardContent>
            </Card>

            {/* Line items */}
            {inv.line_items && inv.line_items.length > 0 && (
              <Card className="mb-6">
                <CardContent className="p-6">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-4">
                    What's included
                  </p>
                  <div className="space-y-3" data-testid="pay-invoice-line-items">
                    {inv.line_items.map((li, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">{li.description}</p>
                          {li.quantity > 1 && (
                            <p className="text-xs text-muted-foreground">
                              Qty {li.quantity} × {fmtMoney(li.unit_price, inv.currency)}
                            </p>
                          )}
                        </div>
                        <p className="text-sm font-semibold whitespace-nowrap">
                          {fmtMoney(li.amount, inv.currency)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-4 mt-4 border-t-2 border-foreground/10">
                    <span className="text-sm font-semibold">Total</span>
                    <span className="text-lg font-bold">{fmtMoney(inv.total, inv.currency)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            {inv.notes && (
              <Card className="mb-6 border-l-4 border-l-primary">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                    Notes
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{inv.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Helper links */}
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground mt-8">
              <a
                href={`${BACKEND}/api/public/invoices/${invoiceId}/summary`}
                target="_blank"
                rel="noreferrer"
                className="hidden"
              >
                JSON
              </a>
              <Link to="/login" className="hover:text-foreground inline-flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                Sign in to your portal
              </Link>
              <span>·</span>
              <a
                href="mailto:founder@thesalvador.group"
                className="hover:text-foreground"
              >
                Questions? Email us
              </a>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
