/**
 * Inline banner shown in the Client Portal home view when the
 * post-purchase company setup has not been completed yet.
 *
 * Behaviour:
 *   - Fetches /api/company-setup/status on mount.
 *   - Renders only when setup_status is "pending" or "partial".
 *   - Clicking the CTA takes the user to /portal/welcome (the wizard).
 *   - Auto-hidden once status === "complete".
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users } from "lucide-react";
import { useClientAuth, clientApi } from "@/lib/clientAuth";

export default function CompanySetupBanner() {
  const { token } = useClientAuth();
  const [status, setStatus] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    if (!token) return undefined;
    (async () => {
      try {
        const { data } = await clientApi(token).get("/company-setup/status");
        if (alive) setStatus(data);
      } catch (err) {
        // Non-blocking — log so dev catches regressions
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.error("CompanySetupBanner: status fetch failed", err);
        }
      }
    })();
    return () => { alive = false; };
  }, [token]);

  if (!status?.company || status.setup_status === "complete") return null;

  return (
    <Card
      className="mb-6 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50/60"
      data-testid="portal-company-setup-banner"
    >
      <CardContent className="p-4 sm:p-5 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-10 w-10 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-display font-medium text-slate-900">
              Finish setting up your team
            </p>
            <p className="text-sm text-muted-foreground">
              Add your company details and invite teammates so everyone has the
              same view of your project.
            </p>
          </div>
        </div>
        <Button
          onClick={() => navigate("/portal/welcome")}
          className="bg-amber-500 hover:bg-amber-600 text-white"
          data-testid="portal-company-setup-resume-button"
        >
          {status.setup_status === "partial" ? "Resume" : "Set up team"}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}
