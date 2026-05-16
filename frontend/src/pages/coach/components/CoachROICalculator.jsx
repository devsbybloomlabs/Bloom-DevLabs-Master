/**
 * Coach ROI Calculator — booking-focused (not churn-focused).
 *
 * Simple mode (Hero): 2 inputs — leads/mo + avg session/package value
 * Detailed mode (Results): 3 inputs — leads/mo + current booking rate + value
 *
 * Math assumption: a professional booking system lifts conversion by ~25%
 * absolute (the mid-point of the 20-30% range cited in copy).
 */
import { useMemo, useState } from "react";
import { Calculator, Sparkles, TrendingUp } from "lucide-react";

const STARTER_COST = 2995;
const PREMIUM_COST = 8995;

function fmt(n) {
  if (!isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

export function SimpleCoachROICalculator() {
  const [leads, setLeads] = useState(20);
  const [value, setValue] = useState(500);
  // Without system: 40% booking rate. With system: 60% (mid of 50-70%).
  const baseRate = 0.4;
  const liftRate = 0.6;
  const lostBookings = Math.round(leads * (liftRate - baseRate));
  const lostRevenue = lostBookings * value;
  const annualLost = lostRevenue * 12;
  const payback = lostRevenue > 0 ? Math.ceil(STARTER_COST / lostRevenue) : null;

  return (
    <div
      className="rounded-2xl border-2 border-teal-100 bg-white p-6 md:p-8 shadow-sm"
      data-testid="coach-roi-calc-simple"
    >
      <div className="flex items-start gap-3 mb-5">
        <div className="h-10 w-10 rounded-lg bg-teal-50 grid place-items-center">
          <Calculator className="h-5 w-5 text-teal-700" />
        </div>
        <div>
          <h3 className="font-semibold text-lg text-slate-900">
            How much is a bad booking flow costing you?
          </h3>
          <p className="text-sm text-slate-500">
            Tap the numbers below to match your coaching practice.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-slate-500 font-medium">
            Leads contacting you / month
          </label>
          <input
            type="number"
            min="0"
            value={leads}
            onChange={(e) => setLeads(Math.max(0, +e.target.value || 0))}
            data-testid="coach-roi-input-leads"
            className="mt-1 w-full h-12 px-4 rounded-lg border border-slate-200 text-lg font-semibold tabular-nums text-slate-900 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-slate-500 font-medium">
            Avg. session / package value ($)
          </label>
          <input
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(Math.max(0, +e.target.value || 0))}
            data-testid="coach-roi-input-value"
            className="mt-1 w-full h-12 px-4 rounded-lg border border-slate-200 text-lg font-semibold tabular-nums text-slate-900 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none"
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Bookings lost / mo" value={`${lostBookings}`} tone="rose" sub="bad flow → drop-off" />
        <Stat label="Revenue at risk" value={fmt(lostRevenue)} tone="rose" sub="every month" />
        <Stat label="Annual leak" value={fmt(annualLost)} tone="rose" />
        <Stat
          label="System payback"
          value={payback ? `${payback} mo` : "—"}
          tone="emerald"
          sub={`Starter $${STARTER_COST.toLocaleString()}`}
        />
      </div>

      <p className="text-xs text-slate-500 mt-4 leading-relaxed">
        We assume a professional one-click booking flow lifts your lead-to-booking
        rate from ~40% to ~60% (mid of 20-30% improvement). Many coaches do better.
      </p>
    </div>
  );
}

export function DetailedCoachROICalculator() {
  const [leads, setLeads] = useState(20);
  const [bookRate, setBookRate] = useState(40); // %
  const [value, setValue] = useState(500);
  const newRate = useMemo(() => Math.min(95, bookRate + 25), [bookRate]);
  const currBookings = Math.round(leads * (bookRate / 100));
  const newBookings = Math.round(leads * (newRate / 100));
  const extra = newBookings - currBookings;
  const monthlyGain = extra * value;
  const annualGain = monthlyGain * 12;
  const payback = monthlyGain > 0 ? Math.ceil(STARTER_COST / monthlyGain) : null;
  const year1Net = annualGain - STARTER_COST;
  const year2Net = annualGain;

  return (
    <div
      className="rounded-2xl border-2 border-teal-100 bg-gradient-to-br from-white to-teal-50/30 p-6 md:p-10 shadow-md"
      data-testid="coach-roi-calc-detailed"
    >
      <div className="flex items-start gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-teal-100 grid place-items-center">
          <TrendingUp className="h-5 w-5 text-teal-700" />
        </div>
        <div>
          <h3 className="font-semibold text-xl text-slate-900">The math, dialed in for your practice</h3>
          <p className="text-sm text-slate-500">
            Adjust three numbers. We'll show you what's actually on the table.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NumberField
          label="Leads / month"
          value={leads}
          onChange={setLeads}
          testid="coach-roi-detailed-leads"
        />
        <div>
          <label className="text-xs uppercase tracking-wider text-slate-500 font-medium">
            Current booking rate
          </label>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="range"
              min="20"
              max="60"
              value={bookRate}
              onChange={(e) => setBookRate(+e.target.value)}
              data-testid="coach-roi-detailed-rate"
              className="flex-1 accent-teal-600"
            />
            <span className="font-semibold text-slate-900 tabular-nums w-12 text-right">
              {bookRate}%
            </span>
          </div>
          <div className="text-[10px] text-teal-700 font-semibold mt-1">
            → With system: {newRate}%
          </div>
        </div>
        <NumberField
          label="Avg. revenue / client ($)"
          value={value}
          onChange={setValue}
          testid="coach-roi-detailed-value"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Insight
          label="You currently book"
          big={`${currBookings} / mo`}
          sub={fmt(currBookings * value) + " current MRR"}
          tone="slate"
        />
        <Insight
          label="With easier booking"
          big={`${newBookings} / mo`}
          sub={`+${extra} extra bookings`}
          tone="emerald"
        />
        <Insight
          label="Additional monthly revenue"
          big={fmt(monthlyGain)}
          sub="recurring, compounding"
          tone="emerald"
        />
        <Insight
          label="Annual upside"
          big={fmt(annualGain)}
          sub="year 1 + every year after"
          tone="blue"
        />
        <Insight
          label="System cost"
          big={fmt(STARTER_COST)}
          sub="Starter · or Premium $8,995"
          tone="slate"
        />
        <Insight
          label="Payback"
          big={payback ? `${payback} weeks` : "—"}
          sub="then it's pure margin"
          tone="amber"
        />
      </div>

      <div className="mt-6 rounded-xl bg-slate-900 text-white p-5 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm leading-relaxed">
          <strong className="text-white">Net year 1:</strong>{" "}
          <span className="tabular-nums">{fmt(year1Net)}</span>
          {" "}— then{" "}
          <strong className="text-amber-300 tabular-nums">{fmt(year2Net)}+</strong>{" "}
          every year after. One extra booking pays for the entire investment.
        </p>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, testid }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-slate-500 font-medium">
        {label}
      </label>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(Math.max(0, +e.target.value || 0))}
        data-testid={testid}
        className="mt-1 w-full h-12 px-4 rounded-lg border border-slate-200 text-lg font-semibold tabular-nums text-slate-900 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none"
      />
    </div>
  );
}

function Stat({ label, value, sub, tone = "blue" }) {
  const tones = {
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
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
    rose: "border-rose-200 bg-rose-50/40",
    emerald: "border-emerald-200 bg-emerald-50/50",
    blue: "border-blue-200 bg-blue-50/40",
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

export default SimpleCoachROICalculator;
