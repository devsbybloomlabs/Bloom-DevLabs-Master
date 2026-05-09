import { useEffect, useMemo, useState } from "react";
import { authClient, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  Award,
  Mic,
  BookOpen,
  CheckCircle2,
  Circle,
  ArrowRight,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const MILESTONE_LABELS = {
  linkedin_followers_100: "100+ LinkedIn followers",
  case_studies_3: "3+ case studies published",
  testimonials_5: "5+ testimonials collected",
  thought_leadership_10: "10+ thought-leadership posts",
  speaking_2: "2+ speaking engagements",
  guest_post_1: "1+ guest post published",
};

export default function CredibilityPage() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [score, setScore] = useState(null);
  const [positioning, setPositioning] = useState(null);
  const [themes, setThemes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, p, t] = await Promise.all([
        api.get("/authority/score"),
        api.get("/authority/positioning-check"),
        api.get("/content/themes/performance"),
      ]);
      setScore(s.data);
      setPositioning(p.data);
      setThemes(t.data);
    } catch {
      toast.error("Failed to load credibility data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const milestones = score?.milestones || {};
  const milestoneEntries = Object.entries(milestones);
  const milestonesDone = milestoneEntries.filter(([, v]) => v).length;

  return (
    <div className="space-y-6" data-testid="credibility-page">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
          Credibility Hub
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track and grow authority for Bloom Labs across all channels.
        </p>
      </div>

      {/* Authority Score */}
      <Card className="border-[#3B82F6]/30 bg-[#3B82F6]/5">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#1E3A8A]" />
                <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Authority score
                </span>
              </div>
              <div className="font-display text-5xl font-semibold tabular-nums mt-2 text-[#1E3A8A]">
                {score?.score || 0}
                <span className="text-2xl text-muted-foreground">/100</span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {milestonesDone}/{milestoneEntries.length} milestones reached
              </div>
            </div>
            <div className="flex-1 max-w-md w-full">
              <Progress value={score?.score || 0} className="h-3" data-testid="authority-progress" />
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <Stat label="Case studies" value={score?.breakdown?.case_studies || 0} />
                <Stat label="Testimonials" value={score?.breakdown?.testimonials || 0} />
                <Stat label="Posts" value={score?.breakdown?.thought_leadership || 0} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="grid gap-4 md:grid-cols-3">
        <QuickLink to="/admin/case-studies" icon={Award} label="Case Studies" sub={`${score?.breakdown?.case_studies || 0} published`} />
        <QuickLink to="/admin/testimonials" icon={Mic} label="Testimonials" sub={`${score?.breakdown?.testimonials || 0} collected`} />
        <QuickLink to="/admin/thought-leadership" icon={BookOpen} label="Thought Leadership" sub={`${score?.breakdown?.thought_leadership || 0} pieces tracked`} />
      </div>

      {/* Milestones */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Authority milestones</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {milestoneEntries.map(([k, v]) => (
              <li
                key={k}
                data-testid={`milestone-${k}`}
                className={`flex items-center gap-3 text-sm border rounded-lg px-3 py-2.5 ${
                  v ? "border-emerald-200 bg-emerald-50" : "border-border"
                }`}
              >
                {v ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className={v ? "text-emerald-900" : "text-foreground"}>
                  {MILESTONE_LABELS[k] || k}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Positioning Consistency */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#3B82F6]" />
            "AI-Native" positioning consistency
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {positioning?.checklist && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {Object.entries(positioning.checklist).map(([k, v]) => (
                <li
                  key={k}
                  data-testid={`positioning-${k}`}
                  className={`flex items-center gap-3 text-sm border rounded-lg px-3 py-2.5 ${
                    v ? "border-emerald-200 bg-emerald-50" : "border-border"
                  }`}
                >
                  {v ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span>{k.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          )}
          {positioning?.recommendation && (
            <div className="text-xs text-muted-foreground rounded-lg border border-border bg-secondary/40 px-3 py-2">
              <b>Recommendation:</b> {positioning.recommendation}
            </div>
          )}
          {positioning?.counts && (
            <div className="text-xs text-muted-foreground tabular-nums">
              Case studies: {positioning.counts.case_studies_with_ai_native}/{positioning.counts.case_studies_total} mention AI-native ·
              Posts: {positioning.counts.posts_with_ai_native}/{positioning.counts.posts_total} mention AI-native
            </div>
          )}
        </CardContent>
      </Card>

      {/* Content theme performance */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#3B82F6]" />
            Content themes performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {themes.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Save some content drafts to see theme performance here.
            </div>
          ) : (
            <ul className="space-y-2">
              {themes.map((t) => (
                <li
                  key={t.type}
                  data-testid={`theme-row-${t.type}`}
                  className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2.5"
                >
                  <div>
                    <div className="font-medium">{t.type.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground">{t.count} pieces</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Avg engagement</div>
                    <div className="font-display text-base font-semibold tabular-nums">
                      {t.avg_engagement || 0}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-white border border-border p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label, sub }) {
  return (
    <Link
      to={to}
      data-testid={`credibility-quicklink-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className="group rounded-[var(--radius)] border border-border bg-card p-5 hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-shadow"
    >
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-[#3B82F6]" />
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
      <div className="font-display text-lg font-semibold mt-3">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </Link>
  );
}
