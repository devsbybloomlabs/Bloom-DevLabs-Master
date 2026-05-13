/**
 * MilestoneTimeline — Phase E animated vertical timeline.
 *
 * Renders a beautiful, alive timeline of project milestones with:
 *  • A vertical "progress rail" whose filled-height grows as phases complete
 *  • A "fun status" banner that rotates on each visit so the portal never
 *    feels stale (e.g. "Team's brewing your designs 🔮")
 *  • Per-milestone status: pending / in_progress (pulsing) / completed
 *    (solid + ✓) / blocked (rose w/ reason)
 *  • Confetti burst on the most-recently-completed milestone (one-shot per
 *    completion timestamp via localStorage key)
 *  • Live ETA estimator based on velocity
 *  • Click any milestone → expand notes + history
 *  • Stacks vertically on mobile, no horizontal scroll
 */
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Circle, AlertCircle, Sparkles, Calendar } from "lucide-react";

const FUN_MESSAGES = [
  "Team's brewing your designs 🔮",
  "Code's compiling, beats are bumping 🎧",
  "Almost there — sneak peek incoming 👀",
  "The team ain't chillin', we're getting this done reaaaaal soon!",
  "Fresh pixels coming straight outta the oven 🍞",
  "Every line of code is a tiny love letter to your project 💌",
  "Crafting magic, one commit at a time ✨",
  "Building, testing, polishing — repeat 🔁",
  "Behind the scenes is buzzing right now 🐝",
  "Quality > speed > coffee. We have all three ☕",
  "Reviewing the latest pass — looking sharp! 📐",
  "Your project is getting the white-glove treatment 🤍",
];

function fmtDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

function calcEta(milestones) {
  const completed = milestones.filter((m) => m.status === "completed");
  const total = milestones.length;
  const remaining = total - completed.length;
  if (remaining === 0 || completed.length === 0) return null;

  // Average days per completed milestone (between created_at and completion_date)
  const durations = completed
    .map((m) => {
      if (!m.created_at || !m.completion_date) return null;
      const d = (new Date(m.completion_date) - new Date(m.created_at)) / 86_400_000;
      return d > 0 ? d : null;
    })
    .filter(Boolean);
  if (durations.length === 0) return null;
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const daysAhead = Math.ceil(avg * remaining);
  const eta = new Date(Date.now() + daysAhead * 86_400_000);
  return {
    days: daysAhead,
    date: eta.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  };
}

const STATUS_META = {
  completed: {
    Icon: CheckCircle2,
    nodeCls: "bg-emerald-500 border-emerald-500 text-white",
    label: "Done",
    pillCls: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  in_progress: {
    Icon: Loader2,
    nodeCls: "bg-white border-blue-500 text-blue-600 animate-pulse",
    label: "In progress",
    pillCls: "bg-blue-100 text-blue-900 border-blue-300",
    spin: true,
  },
  blocked: {
    Icon: AlertCircle,
    nodeCls: "bg-rose-500 border-rose-500 text-white",
    label: "Blocked",
    pillCls: "bg-rose-100 text-rose-900 border-rose-300",
  },
  pending: {
    Icon: Circle,
    nodeCls: "bg-white border-slate-300 text-slate-400",
    label: "Pending",
    pillCls: "bg-secondary text-foreground border-border",
  },
};

export default function MilestoneTimeline({ milestones = [] }) {
  // Pick ONE fun message per session — pinned via state so it doesn't
  // shuffle on every render (only on mount/visit).
  const [funMessage] = useState(
    () => FUN_MESSAGES[Math.floor(Math.random() * FUN_MESSAGES.length)]
  );

  // Sort by created_at (oldest first = top of timeline)
  const sorted = useMemo(
    () => [...milestones].sort((a, b) => {
      const ad = new Date(a.created_at || 0).getTime();
      const bd = new Date(b.created_at || 0).getTime();
      return ad - bd;
    }),
    [milestones]
  );

  const completedCount = sorted.filter((m) => m.status === "completed").length;
  const total = sorted.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const eta = calcEta(sorted);

  // One-shot confetti for the most-recently-completed milestone
  const [confettiId, setConfettiId] = useState(null);
  useEffect(() => {
    const lastCompleted = [...sorted]
      .reverse()
      .find((m) => m.status === "completed" && m.completion_date);
    if (!lastCompleted) return;
    const key = `bloom_confetti_${lastCompleted.id}_${lastCompleted.completion_date}`;
    if (!localStorage.getItem(key)) {
      setConfettiId(lastCompleted.id);
      localStorage.setItem(key, "1");
      const t = setTimeout(() => setConfettiId(null), 4000);
      return () => clearTimeout(t);
    }
  }, [sorted]);

  if (total === 0) {
    return (
      <div className="text-center py-12 px-6 bg-secondary/30 rounded-xl border border-border" data-testid="milestone-timeline-empty">
        <Sparkles className="w-10 h-10 mx-auto text-muted-foreground" />
        <p className="font-medium mt-3">Your timeline is being prepped</p>
        <p className="text-sm text-muted-foreground mt-1">
          As phases unlock, you'll see them animate in right here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="milestone-timeline">
      {/* Fun status banner */}
      <div
        className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-white to-blue-50 p-5"
        data-testid="milestone-timeline-fun-banner"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Live from the team
            </p>
            <p className="font-display text-lg font-medium animate-fade-in">{funMessage}</p>
          </div>
        </div>
      </div>

      {/* Progress summary */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Project progress
            </p>
            <p className="font-display text-2xl font-semibold mt-1">
              {completedCount} of {total} milestones
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Complete</p>
            <p className="font-display text-2xl font-semibold tabular-nums">{pct}%</p>
          </div>
        </div>
        {/* Animated progress bar */}
        <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-primary to-emerald-500 transition-all duration-1000 ease-out"
            style={{ width: `${pct}%` }}
            data-testid="milestone-timeline-progress-bar"
          />
        </div>
        {eta && (
          <p className="text-xs text-muted-foreground mt-3 inline-flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            <span>
              Based on current velocity, ETA is <strong>~{eta.date}</strong>{" "}
              ({eta.days} {eta.days === 1 ? "day" : "days"} out).
            </span>
          </p>
        )}
      </div>

      {/* The timeline itself */}
      <div className="relative" data-testid="milestone-timeline-list">
        {/* Vertical rail */}
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-secondary rounded-full" aria-hidden="true" />
        {/* Filled portion of the rail */}
        <div
          className="absolute left-5 top-0 w-0.5 rounded-full bg-gradient-to-b from-emerald-500 via-blue-500 to-primary transition-all duration-1000"
          style={{ height: `${pct}%` }}
          aria-hidden="true"
        />

        <ul className="space-y-4">
          {sorted.map((m, idx) => (
            <MilestoneNode
              key={m.id || idx}
              milestone={m}
              isLast={idx === sorted.length - 1}
              showConfetti={confettiId === m.id}
            />
          ))}
        </ul>
      </div>

      {/* Confetti CSS — keyframes scoped via class names below.
          Kept inline so the component is fully drop-in (no Tailwind config edits needed). */}
      <style>{`
        @keyframes bloom-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: bloom-fade-in 600ms ease-out;
        }
        @keyframes bloom-confetti-rise {
          0%   { transform: translate(var(--x), 30px) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--x), -120px) rotate(360deg); opacity: 0; }
        }
        .bloom-confetti span {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 8px;
          height: 8px;
          border-radius: 1px;
          animation: bloom-confetti-rise 2.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

function MilestoneNode({ milestone, showConfetti }) {
  const meta = STATUS_META[milestone.status] || STATUS_META.pending;
  const Icon = meta.Icon;
  const [open, setOpen] = useState(false);

  return (
    <li
      className={`relative pl-14 group ${milestone.placeholder ? "opacity-50" : ""}`}
      data-testid={`milestone-node-${milestone.id}`}
      data-status={milestone.status}
      data-placeholder={milestone.placeholder ? "true" : "false"}
    >
      {/* "Up next" pill on placeholder rows */}
      {milestone.placeholder && (
        <span className="absolute -top-1 right-2 text-[9px] uppercase tracking-wider font-semibold text-muted-foreground bg-secondary/60 rounded-full px-2 py-0.5">
          Up next
        </span>
      )}
      {/* Node circle on the rail */}
      <div
        className={`absolute left-0 top-0 h-10 w-10 rounded-full border-2 flex items-center justify-center transition-all ${meta.nodeCls} ${
          milestone.status === "completed" ? "shadow-md" : ""
        } ${milestone.placeholder ? "grayscale" : ""}`}
      >
        <Icon className={`h-5 w-5 ${meta.spin ? "animate-spin" : ""}`} />
        {showConfetti && (
          <div className="bloom-confetti pointer-events-none">
            {/* 16 confetti pieces, randomized via CSS vars */}
            {Array.from({ length: 16 }).map((_, i) => (
              <span
                key={i}
                style={{
                  background: ["#1E3A8A", "#10B981", "#F59E0B", "#EC4899", "#3B82F6"][i % 5],
                  "--x": `${(Math.random() - 0.5) * 120}px`,
                  animationDelay: `${i * 80}ms`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Card */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`text-left w-full bg-card border rounded-xl p-4 transition-all hover:shadow-sm hover:border-primary/30 ${
          open ? "border-primary/40 shadow-sm" : "border-border"
        }`}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.08em] border ${meta.pillCls}`}
              >
                {meta.label}
              </span>
              {milestone.due_date && (
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Due {fmtDate(milestone.due_date)}
                </span>
              )}
              {milestone.completion_date && milestone.status === "completed" && (
                <span className="text-[11px] text-emerald-700">
                  ✓ {fmtDate(milestone.completion_date)}
                </span>
              )}
            </div>
            <p className="font-display text-base font-medium">{milestone.title}</p>
            {milestone.description && (
              <p className={`text-sm text-muted-foreground mt-0.5 ${open ? "" : "line-clamp-2"}`}>
                {milestone.description}
              </p>
            )}
            {milestone.status === "blocked" && milestone.blocked_reason && (
              <div className="mt-2 bg-rose-50 border border-rose-200 rounded-md p-2 text-xs text-rose-900">
                <strong>Blocked:</strong> {milestone.blocked_reason}
                {milestone.blocked_eta && (
                  <span className="ml-1">· ETA {fmtDate(milestone.blocked_eta)}</span>
                )}
              </div>
            )}
            {open && Array.isArray(milestone.notes) && milestone.notes.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Updates
                </p>
                {milestone.notes.slice().reverse().slice(0, 5).map((n, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-muted-foreground">
                      {fmtDate(n.at)} ·{" "}
                    </span>
                    <span>{n.text || n.message || ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}
