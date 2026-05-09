import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, AlertCircle } from "lucide-react";

function parseHM(hm, base) {
  if (!hm) return null;
  const [h, m] = hm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function formatRemaining(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function BlockTimer({ blocks }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { current, next } = useMemo(() => {
    let current = null;
    let next = null;
    for (const b of blocks) {
      const s = parseHM(b.start, now);
      const e = parseHM(b.end, now);
      if (!s || !e) continue;
      if (now >= s && now < e) current = { ...b, _s: s, _e: e };
      else if (now < s && (!next || s < next._s)) next = { ...b, _s: s, _e: e };
    }
    return { current, next };
  }, [blocks, now]);

  if (!current && !next) {
    return (
      <Card className="border-border" data-testid="block-timer">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#3B82F6]" />
            Block timer
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">
          No active block right now. Take a break!
        </CardContent>
      </Card>
    );
  }

  if (!current && next) {
    const ms = next._s - now;
    return (
      <Card className="border-border" data-testid="block-timer">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#3B82F6]" />
            Up next
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {next.type.replace("_", " ")} · starts in
          </div>
          <div className="font-display text-3xl font-semibold tabular-nums mt-1">
            {formatRemaining(ms)}
          </div>
          <div className="text-sm font-medium mt-2">{next.title}</div>
          <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
            {next.start}–{next.end}
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = current._e - current._s;
  const elapsed = now - current._s;
  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
  const remaining = current._e - now;
  const warning = remaining < 5 * 60 * 1000;

  return (
    <Card
      className={`border ${warning ? "border-amber-300" : "border-border"}`}
      data-testid="block-timer"
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display flex items-center gap-2">
          {warning ? (
            <AlertCircle className="h-4 w-4 text-amber-600" />
          ) : (
            <Clock className="h-4 w-4 text-[#3B82F6]" />
          )}
          Current block
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {current.type.replace("_", " ")}
        </div>
        <div className="font-display text-3xl font-semibold tabular-nums mt-1">
          {formatRemaining(remaining)}
        </div>
        <div className="text-sm font-medium mt-2 line-clamp-2">{current.title}</div>
        <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
          {current.start}–{current.end}
        </div>
        <div className="mt-4 h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full ${warning ? "bg-amber-500" : "bg-[#1E3A8A]"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {warning && (
          <div className="mt-2 text-xs text-amber-700">
            Less than 5 minutes left in this block.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
