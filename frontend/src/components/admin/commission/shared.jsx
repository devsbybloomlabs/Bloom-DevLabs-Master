/**
 * Shared bits for the People & Commission admin pages.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export function fmtMoney(n, currency = "USD") {
  const v = Number(n || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export const RECURRING_LABELS = {
  one_time: "One-time sales only",
  first_n_months: "First N months",
  ongoing: "Ongoing",
};

const STATUS_STYLES = {
  pending: "bg-slate-200 text-slate-800",
  accrued: "bg-slate-200 text-slate-800",
  eligible: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
  void: "bg-rose-100 text-rose-800",
  active: "bg-emerald-100 text-emerald-800",
  inactive: "bg-slate-200 text-slate-600",
};

export function StatusBadge({ status }) {
  return (
    <Badge
      variant="secondary"
      className={`text-[10px] font-semibold capitalize ${STATUS_STYLES[status] || ""}`}
      data-testid={`status-badge-${status}`}
    >
      {status}
    </Badge>
  );
}

export function formatRate(type, value) {
  return type === "flat" ? `${fmtMoney(value)} / invoice` : `${Number(value)}%`;
}

/** Loads people + companies once for selects. */
export function useLookups(api) {
  const [people, setPeople] = useState([]);
  const [companies, setCompanies] = useState([]);
  const reload = useCallback(async () => {
    const [p, c] = await Promise.all([
      api.get("/admin/people"),
      api.get("/admin/companies", { params: { limit: 500 } }),
    ]);
    setPeople(p.data.items || []);
    setCompanies(c.data || []);
  }, [api]);
  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);
  return { people, companies, reload };
}

export function errMsg(e, fallback = "Something went wrong") {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
  return fallback;
}
