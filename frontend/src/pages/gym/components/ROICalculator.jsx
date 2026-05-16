/**
 * Interactive ROI calculator used on the Hero and Results pages.
 *
 * Two modes:
 *  - `simple` (Hero) — 2 inputs: members lost / month + average member value
 *  - `detailed` (Results) — 3 inputs: new members/mo + churn % + value
 *
 * The math is intentionally transparent so gym owners can verify it
 * in their head:
 *   monthlyLoss   = lostMembers × value
 *   recovered     = lostMembers × 0.275  (mid-point of 25-30% recovery)
 *   monthlyGain   = recovered × value
 *   payback       = systemCost / monthlyGain (in months, ceil)
 */
import { useMemo, useState } from "react";
import { Calculator, Sparkles, TrendingUp } from "lucide-react";

const SYSTEM_COST = 8995;

function fmt(n) {
  if (!isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

export function SimpleROICalculator() {
  const [lost, setLost] = useState(8);
  const [value, setValue] = useState(120);
  const monthlyLoss = lost * value;
  const recovered = lost * 0.275;
  const monthlyGain = recovered * value;
  const annualGain = monthlyGain * 12;
  const payback = monthlyGain > 0 ? Math.ceil(SYSTEM_COST / monthlyGain) : null;

  return (
    <div
      className="rounded-2xl border-2 border-blue-100 bg-white p-6 md:p-8 shadow-sm"
      data-testid="roi-calc-simple"
    >
      <div className="flex items-start gap-3 mb-5">
        <div className="h-10 w-10 rounded-lg bg-blue-50 grid place-items-center">
          <Calculator className="h-5 w-5 text-blue-700" />
        </div>
        <div>
          <h3 className="font-semibold text-lg text-slate-900">
            What does churn really cost you?
          </h3>
          <p className="text-sm text-slate-500">
            Tap the numbers below to match your gym.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-slate-500 font-medium">
            Members lost / month
          </label>
          <input
            type="number"
            min="0"
            value={lost}
            onChange={(e) => setLost(Math.max(0, +e.target.value || 0))}
            data-testid="roi-input-lost"
            className="mt-1 w-full h-12 px-4 rounded-lg border border-slate-200 text-lg font-semibold tabular-nums text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-slate-500 font-medium">
            Avg. member value ($/mo)
          </label>
          <input
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(Math.max(0, +e.target.value || 0))}
            data-testid="roi-input-value"
            className="mt-1 w-full h-12 px-4 rounded-lg border border-slate-200 text-lg font-semibold tabular-nums text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none"
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Monthly loss" value={fmt(monthlyLoss)} tone="rose" />
        <Stat label="Annual loss" value={fmt(monthlyLoss * 12)} tone="rose" />
        <Stat label="Recovered / mo" value={fmt(monthlyGain)} tone="emerald" sub="≈27.5% recovery" />
        <Stat
          label="System payback"
          value={payback ? `${payback} mo` : "—"}
          tone="blue"
          sub={`on $${SYSTEM_COST.toLocaleString()}`}
        />
      </div>

      <p className="text-xs text-slate-500 mt-4 leading-relaxed">
        We assume our system recovers 25-30% of those at-risk members through
        automated follow-up. That's the realistic mid-band — many gyms
        outperform it.
      </p>
    </div>
  );
}

export function DetailedROICalculator() {
  const [newMembers, setNewMembers] = useState(20);
  const [churnPct, setChurnPct] = useState(40);
  const [value, setValue] = useState(100);
  const lost = useMemo(() => Math.round(newMembers * (churnPct / 100)), [newMembers, churnPct]);
  const monthlyLoss = lost * value;
  const recovered = lost * 0.275;
  const monthlyGain = recovered * value;
  const annualGain = monthlyGain * 12;
  const payback = monthlyGain > 0 ? Math.ceil(SYSTEM_COST / monthlyGain) : null;
  const year1Net = annualGain - SYSTEM_COST;
  const year2Net = annualGain;

  return (
    <div
      className="rounded-2xl border-2 border-emerald-100 bg-gradient-to-br from-white to-emerald-50/30 p-6 md:p-10 shadow-md"
      data-testid="roi-calc-detailed"
    >
      <div className="flex items-start gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-emerald-100 grid place-items-center">
          <TrendingUp className="h-5 w-5 text-emerald-700" />
        </div>
        <div>
          <h3 className="font-semibold text-xl text-slate-900">The math, dialed in for your gym</h3>
          <p className="text-sm text-slate-500">
            Adjust three numbers. We'll show you what's actually on the table.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NumberField
          label="New members / month"
          value={newMembers}
          onChange={setNewMembers}
          testid="roi-detailed-new"
        />
        <div>
          <label className="text-xs uppercase tracking-wider text-slate-500 font-medium">
            Current churn rate
          </label>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="range"
              min="10"
              max="60"
              value={churnPct}
              onChange={(e) => setChurnPct(+e.target.value)}
              data-testid="roi-detailed-churn"
              className="flex-1 accent-emerald-600"
            />
            <span className="font-semibold text-slate-900 tabular-nums w-12 text-right">
              {churnPct}%
            </span>
          </div>
        </div>
        <NumberField
          label="Member value ($/mo)"
          value={value}
          onChange={setValue}
          testid="roi-detailed-value"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Insight
          label="You're losing"
          big={`${lost} members / mo`}
          sub={`${fmt(monthlyLoss)} every month`}
          tone="rose"
        />
        <Insight
          label="Realistic recovery (27.5%)"
          big={`+${Math.round(recovered)} members / mo`}
          sub={`${fmt(monthlyGain)} extra MRR`}
          tone="emerald"
        />
        <Insight
          label="Annual upside"
          big={fmt(annualGain)}
          sub="recurring, compounding"
          tone="blue"
        />
        <Insight
          label="System cost"
          big={fmt(SYSTEM_COST)}
          sub="one-time, Custom Build tier"
          tone="slate"
        />
        <Insight
          label="Payback"
          big={payback ? `${payback} months` : "—"}
          sub="then it's pure margin"
          tone="emerald"
        />
        <Insight
          label="Net year 2+"
          big={`${fmt(year2Net)}+`}
          sub="no additional cost"
          tone="blue"
        />
      </div>

      <div className="mt-6 rounded-xl bg-slate-900 text-white p-5 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm leading-relaxed">
          <strong className="text-white">Net year 1:</strong>{" "}
          <span className="tabular-nums">{fmt(year1Net)}</span>
          {" "}— then{" "}
          <strong className="text-emerald-300 tabular-nums">{fmt(year2Net)}+</strong>{" "}
          every year after. The system keeps compounding while you sleep.
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
        className="mt-1 w-full h-12 px-4 rounded-lg border border-slate-200 text-lg font-semibold tabular-nums text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none"
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

export default SimpleROICalculator;
