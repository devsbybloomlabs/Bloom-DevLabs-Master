/**
 * Real Estate ROI Calculator — commission / lead based.
 *
 * Assumptions (transparent):
 *   without-system  : ~5 leads/month from ad spend, low conversion
 *   with-system     : 20-60 leads/month via MLS site + lead capture
 *   conversion      : ~5% of captured leads become showings; ~20% of showings become deals
 *   commission      : configurable ($/deal)
 */
import { useState, useMemo } from "react";
import { Calculator, Sparkles, TrendingUp } from "lucide-react";

const STARTER_COST = 2995;

function fmt(n) {
  if (!isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

export function SimpleREROICalculator() {
  const [leads, setLeads] = useState(25);
  const [commission, setCommission] = useState(6000);
  const dealsPerMonth = (leads * 0.05 * 0.2);
  const monthlyRevenue = dealsPerMonth * commission;
  const annualRevenue = monthlyRevenue * 12;
  const payback = monthlyRevenue > 0 ? Math.max(1, Math.ceil(STARTER_COST / monthlyRevenue)) : null;

  return (
    <div
      className="rounded-2xl border-2 border-indigo-100 bg-white p-6 md:p-8 shadow-sm"
      data-testid="re-roi-calc-simple"
    >
      <div className="flex items-start gap-3 mb-5">
        <div className="h-10 w-10 rounded-lg bg-indigo-50 grid place-items-center">
          <Calculator className="h-5 w-5 text-indigo-700" />
        </div>
        <div>
          <h3 className="font-semibold text-lg text-slate-900">What's your ROI math?</h3>
          <p className="text-sm text-slate-500">Tap the numbers below to match your market.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-slate-500 font-medium">
            Website leads / month
          </label>
          <input
            type="number" min="0" value={leads}
            onChange={(e) => setLeads(Math.max(0, +e.target.value || 0))}
            data-testid="re-roi-input-leads"
            className="mt-1 w-full h-12 px-4 rounded-lg border border-slate-200 text-lg font-semibold tabular-nums text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-slate-500 font-medium">
            Avg. commission / deal ($)
          </label>
          <input
            type="number" min="0" value={commission}
            onChange={(e) => setCommission(Math.max(0, +e.target.value || 0))}
            data-testid="re-roi-input-commission"
            className="mt-1 w-full h-12 px-4 rounded-lg border border-slate-200 text-lg font-semibold tabular-nums text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none"
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Expected deals / mo" value={dealsPerMonth.toFixed(1)} tone="emerald" />
        <Stat label="Monthly commission" value={fmt(monthlyRevenue)} tone="emerald" />
        <Stat label="Annual upside" value={fmt(annualRevenue)} tone="indigo" />
        <Stat label="Starter payback" value={payback ? `${payback} mo` : "—"} tone="amber" sub={`on $${STARTER_COST.toLocaleString()}`} />
      </div>

      <p className="text-xs text-slate-500 mt-4 leading-relaxed">
        We assume ~5% of captured leads become showings, and ~20% of showings become deals
        (industry mid-band). Your numbers will vary by market and follow-up consistency.
      </p>
    </div>
  );
}

export function DetailedREROICalculator() {
  const [leads, setLeads] = useState(35);
  const [showRate, setShowRate] = useState(5); // % of leads that book showing
  const [closeRate, setCloseRate] = useState(20); // % of showings that close
  const [commission, setCommission] = useState(7000);
  const showings = useMemo(() => (leads * showRate) / 100, [leads, showRate]);
  const deals = useMemo(() => (showings * closeRate) / 100, [showings, closeRate]);
  const monthlyRev = deals * commission;
  const annualRev = monthlyRev * 12;
  const payback = monthlyRev > 0 ? Math.max(1, Math.ceil(STARTER_COST / monthlyRev)) : null;
  const year1Net = annualRev - STARTER_COST;
  const year2Net = annualRev;

  return (
    <div
      className="rounded-2xl border-2 border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30 p-6 md:p-10 shadow-md"
      data-testid="re-roi-calc-detailed"
    >
      <div className="flex items-start gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-indigo-100 grid place-items-center">
          <TrendingUp className="h-5 w-5 text-indigo-700" />
        </div>
        <div>
          <h3 className="font-semibold text-xl text-slate-900">The math, dialed in for your market</h3>
          <p className="text-sm text-slate-500">Adjust four numbers — see what your website is worth.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <NumberField label="Leads / month" value={leads} onChange={setLeads} testid="re-roi-detailed-leads" />
        <RangeField label="Lead → showing %" value={showRate} onChange={setShowRate} min={2} max={15} testid="re-roi-detailed-show" />
        <RangeField label="Showing → deal %" value={closeRate} onChange={setCloseRate} min={5} max={50} testid="re-roi-detailed-close" />
        <NumberField label="Avg. commission ($)" value={commission} onChange={setCommission} testid="re-roi-detailed-commission" />
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Insight label="Showings / month" big={showings.toFixed(1)} sub={`${showRate}% of leads`} tone="indigo" />
        <Insight label="Deals / month" big={deals.toFixed(2)} sub={`${closeRate}% of showings`} tone="emerald" />
        <Insight label="Monthly commission" big={fmt(monthlyRev)} sub="recurring upside" tone="emerald" />
        <Insight label="Annual commission" big={fmt(annualRev)} sub="year 1 + every year after" tone="indigo" />
        <Insight label="Starter payback" big={payback ? `${payback} months` : "—"} sub="then pure margin" tone="amber" />
        <Insight label="Net Year 1" big={fmt(year1Net)} sub={`after $${STARTER_COST.toLocaleString()} system`} tone="slate" />
      </div>

      <div className="mt-6 rounded-xl bg-slate-900 text-white p-5 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm leading-relaxed">
          <strong className="text-white">Year 2+:</strong>{" "}
          <span className="tabular-nums">{fmt(year2Net)}</span>
          {" "}in commission with no additional build cost. <strong className="text-amber-300">One extra deal pays for the entire system.</strong>
        </p>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, testid }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-slate-500 font-medium">{label}</label>
      <input
        type="number" min="0" value={value}
        onChange={(e) => onChange(Math.max(0, +e.target.value || 0))}
        data-testid={testid}
        className="mt-1 w-full h-12 px-4 rounded-lg border border-slate-200 text-lg font-semibold tabular-nums text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none"
      />
    </div>
  );
}

function RangeField({ label, value, onChange, min, max, testid }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-slate-500 font-medium">{label}</label>
      <div className="mt-1 flex items-center gap-3">
        <input
          type="range" min={min} max={max} value={value}
          onChange={(e) => onChange(+e.target.value)}
          data-testid={testid}
          className="flex-1 accent-indigo-700"
        />
        <span className="font-semibold text-slate-900 tabular-nums w-10 text-right">{value}%</span>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone = "indigo" }) {
  const tones = {
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-[10px] opacity-70 mt-0.5">{sub}</div>}
    </div>
  );
}

function Insight({ label, big, sub, tone }) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50/50",
    indigo: "border-indigo-200 bg-indigo-50/40",
    amber: "border-amber-200 bg-amber-50/50",
    slate: "border-slate-200 bg-white",
  };
  return (
    <div className={`rounded-xl border ${tones[tone]} p-4`}>
      <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">{label}</div>
      <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">{big}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

export default SimpleREROICalculator;
