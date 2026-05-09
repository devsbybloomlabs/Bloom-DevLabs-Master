import { useEffect, useMemo, useState } from "react";
import { authClient, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
  Sparkles,
  Clipboard,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const BLOCK_BG = {
  OUTREACH: "border-[#3B82F6]/30",
  CONTENT: "border-emerald-200",
  CALLS: "border-amber-200",
  CLIENT_MGMT: "border-purple-200",
  LUNCH: "border-border",
  CUSTOM: "border-border",
};

export default function RoutinePage() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [routine, setRoutine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [openBlocks, setOpenBlocks] = useState({});

  const load = async () => {
    try {
      setLoading(true);
      const r = await api.get("/routine/today", { timeout: 180000 });
      setRoutine(r.data);
    } catch {
      toast.error("Failed to load routine");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const r = await api.post("/routine/generate", { force: true }, { timeout: 180000 });
      setRoutine(r.data);
      toast.success("Fresh routine generated");
    } catch {
      toast.error("Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  };

  const toggleItem = async (block, item) => {
    try {
      await api.post("/routine/checklist/toggle", {
        block_id: block.id,
        item_id: item.id,
        done: !item.done,
      });
      setRoutine((r) => {
        if (!r) return r;
        const copy = JSON.parse(JSON.stringify(r));
        for (const b of copy.blocks) {
          if (b.id === block.id) {
            for (const c of b.checklist) if (c.id === item.id) c.done = !item.done;
            b.completed = b.checklist.length > 0 && b.checklist.every((c) => c.done);
          }
        }
        return copy;
      });
    } catch {
      toast.error("Failed to update task");
    }
  };

  const completedBlocks = (routine?.blocks || []).filter((b) => b.completed).length;
  const total = (routine?.blocks || []).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="routine-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Today&apos;s routine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {routine?.notes || "AI-generated 1-hour blocks alternating outreach and content."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {completedBlocks}/{total} blocks done
          </Badge>
          <Button
            onClick={regenerate}
            variant="outline"
            size="sm"
            disabled={regenerating}
            data-testid="routine-regenerate-button"
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Regenerate
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {(routine?.blocks || []).map((b) => {
          const isOpen = openBlocks[b.id] ?? true;
          return (
            <Card
              key={b.id}
              data-testid={`routine-block-${b.id}`}
              className={`border-l-4 ${BLOCK_BG[b.type] || BLOCK_BG.CUSTOM}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      <span className="tabular-nums">{b.start}–{b.end}</span>
                      <span className="mx-2">·</span>
                      {b.type.replace("_", " ")}
                      {b.estimate_minutes && (
                        <span className="ml-2">· ~{b.estimate_minutes} min</span>
                      )}
                    </div>
                    <CardTitle className="font-display text-lg mt-1">
                      {b.title}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.completed && (
                      <Badge className="bg-[#16A34A] text-white border-0">Done</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setOpenBlocks((p) => ({ ...p, [b.id]: !isOpen }))}
                      aria-label={isOpen ? "Collapse" : "Expand"}
                    >
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {isOpen && (
                <CardContent className="pt-1 space-y-4">
                  {b.description && (
                    <p className="text-sm text-muted-foreground">{b.description}</p>
                  )}
                  {b.checklist?.length > 0 && (
                    <ul className="space-y-2">
                      {b.checklist.map((c) => (
                        <li key={c.id} className="flex items-start gap-3 text-sm">
                          <button
                            type="button"
                            onClick={() => toggleItem(b, c)}
                            data-testid={`routine-block-${b.id}-item-${c.id}-toggle`}
                            className="flex-shrink-0 mt-0.5"
                            aria-label={c.done ? "Mark incomplete" : "Mark complete"}
                          >
                            {c.done ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground/60" />
                            )}
                          </button>
                          <span className={c.done ? "line-through opacity-60" : ""}>
                            {c.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {b.ai_prompt && (
                    <div className="rounded-lg bg-secondary/50 border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            AI prompt to copy
                          </div>
                          <div className="text-sm font-mono text-foreground/85 break-words">
                            {b.ai_prompt}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            navigator.clipboard.writeText(b.ai_prompt);
                            toast.success("Prompt copied");
                          }}
                          aria-label="Copy prompt"
                          data-testid={`routine-block-${b.id}-copy-prompt`}
                        >
                          <Clipboard className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
