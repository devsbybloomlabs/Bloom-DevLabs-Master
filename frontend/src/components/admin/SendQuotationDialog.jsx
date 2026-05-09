import { useState, useMemo } from "react";
import { authClient, useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, ExternalLink, FileSignature } from "lucide-react";
import { toast } from "sonner";

/**
 * Lightweight prospect-to-quotation handoff.
 *
 * Rather than recreate Agency Handy's complex quotation form in our app, we:
 *  1. Update the prospect's status to 'proposal' (so Pipeline reflects it).
 *  2. Set next_action to 'Quotation pending in Agency Handy'.
 *  3. Open the AH catalog/portal in a new tab so the founder can finalize
 *     the quotation in the AH UI.
 *
 * Once the quotation is sent in AH, the PROPOSAL.SENT webhook will keep our
 * dashboard in sync (and PROPOSAL.ACCEPTED → status: won automatically).
 */
export default function SendQuotationDialog({ prospect, ahPortalUrl, onDone, open, onOpenChange }) {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState(
    `Quotation pending in Agency Handy${prospect?.name ? ` for ${prospect.name}` : ""}`
  );

  const submit = async () => {
    if (!prospect?.id) return;
    setSubmitting(true);
    try {
      await api.put(`/pipeline/prospects/${prospect.id}`, {
        status: "proposal",
        next_action: confirmMessage,
      });
      toast.success("Pipeline updated. Opening Agency Handy in a new tab\u2026");
      // Open AH portal in a new tab
      const url = ahPortalUrl || "https://portal.bybloomlabs.com/catalog";
      window.open(url, "_blank", "noopener,noreferrer");
      onDone?.();
      onOpenChange?.(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to update prospect");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="send-quotation-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-[#3B82F6]" />
            Send quotation in Agency Handy
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            We'll mark this prospect as <b>proposal</b> stage and open the
            Agency Handy catalog in a new tab so you can finalize the quotation.
            Once the proposal is sent in AH, the Pipeline page will sync
            automatically via webhook.
          </p>
          <div>
            <Label htmlFor="sq-msg" className="text-sm">
              Next action note
            </Label>
            <input
              id="sq-msg"
              data-testid="send-quotation-note"
              value={confirmMessage}
              onChange={(e) => setConfirmMessage(e.target.value)}
              className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </div>
          {prospect && (
            <div className="rounded-md border border-border p-3 bg-secondary/40">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Prospect
              </div>
              <div className="font-medium">{prospect.name}</div>
              {prospect.email && (
                <div className="text-xs text-muted-foreground">{prospect.email}</div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !prospect?.id}
            className="bg-[#1E3A8A] hover:bg-[#1A3278] text-white"
            data-testid="send-quotation-submit"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Mark + open Agency Handy
            <ExternalLink className="h-3.5 w-3.5 ml-2" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
