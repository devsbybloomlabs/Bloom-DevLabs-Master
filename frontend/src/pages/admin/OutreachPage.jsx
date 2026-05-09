import { useMemo, useState } from "react";
import { authClient, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Clipboard, MessageSquare, Mail } from "lucide-react";
import { toast } from "sonner";

export default function OutreachPage() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [niche, setNiche] = useState("SaaS founders Philippines/Singapore");
  const [pain, setPain] = useState("slow expensive dev agencies, 6-month timelines");
  const [angle, setAngle] = useState("4-week builds at 40% lower cost, AI-native");
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await api.post(
        "/ai/outreach",
        { niche, pain_point: pain, angle, count: Number(count) || 10 },
        { timeout: 120000 }
      );
      setData(r.data);
      toast.success(`${r.data?.openers?.length || 0} openers generated`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "AI generation failed");
    } finally {
      setLoading(false);
    }
  };

  const copyOpener = (o) => {
    const txt = [o.hook, o.pain_reference, o.solution_tease, o.cta]
      .filter(Boolean)
      .join("\n\n");
    navigator.clipboard.writeText(txt);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-6" data-testid="outreach-page">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
          Outreach AI
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate personalized openers for LinkedIn / email in seconds.
        </p>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Configure</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="text-sm" htmlFor="niche">Niche / persona</Label>
            <Input
              id="niche"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              data-testid="outreach-niche-input"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-sm" htmlFor="angle">Our angle</Label>
            <Input
              id="angle"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              data-testid="outreach-angle-input"
              className="mt-1.5"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-sm" htmlFor="pain">Pain point</Label>
            <Textarea
              id="pain"
              value={pain}
              onChange={(e) => setPain(e.target.value)}
              data-testid="outreach-pain-input"
              rows={2}
              className="mt-1.5"
            />
          </div>
          <div className="flex items-end gap-3">
            <div>
              <Label className="text-sm" htmlFor="count">Count</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                data-testid="outreach-count-input"
                className="mt-1.5 w-24"
              />
            </div>
            <Button
              onClick={generate}
              disabled={loading}
              className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white h-11"
              data-testid="outreach-generate-button"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {data && (
        <div className="space-y-4" data-testid="outreach-results">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {data.best_time_to_send && (
              <Badge variant="outline">Best time: {data.best_time_to_send}</Badge>
            )}
            {data.estimated_response_rate && (
              <Badge variant="outline">Est. response: {data.estimated_response_rate}</Badge>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {(data.openers || []).map((o, i) => (
              <Card
                key={i}
                data-testid={`outreach-opener-${i}`}
                className="border-border"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className={
                        o.channel === "email"
                          ? "bg-amber-100 text-amber-900 border-amber-200"
                          : "bg-blue-100 text-blue-900 border-blue-200"
                      }
                    >
                      {o.channel === "email" ? <Mail className="h-3 w-3 mr-1" /> : <MessageSquare className="h-3 w-3 mr-1" />}
                      {(o.channel || "linkedin").toUpperCase()}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyOpener(o)}
                      aria-label="Copy opener"
                      data-testid={`outreach-opener-${i}-copy"`}
                    >
                      <Clipboard className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2 text-sm">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Hook
                    </div>
                    <div className="font-medium">{o.hook}</div>
                  </div>
                  {o.pain_reference && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Pain reference
                      </div>
                      <div className="text-muted-foreground">{o.pain_reference}</div>
                    </div>
                  )}
                  {o.solution_tease && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Solution tease
                      </div>
                      <div>{o.solution_tease}</div>
                    </div>
                  )}
                  {o.cta && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        CTA
                      </div>
                      <div className="text-[#1E3A8A] font-medium">{o.cta}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          {data.tip && (
            <Card className="border-[#3B82F6]/30 bg-[#3B82F6]/5">
              <CardContent className="p-4 text-sm">
                <span className="font-medium text-[#1E3A8A]">Tip:</span> {data.tip}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
