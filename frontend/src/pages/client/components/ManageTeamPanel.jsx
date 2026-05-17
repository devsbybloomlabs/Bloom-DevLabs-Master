/**
 * ManageTeamPanel — embedded inside the portal's "Profile" tab.
 *
 * - Admins (incl. owner): can invite new members, promote/demote, see all.
 * - Viewers: see the team list, read-only.
 */
import { useEffect, useState } from "react";
import { clientApi } from "@/lib/clientAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, ShieldCheck, ShieldX, Plus, Trash2, Mail, ArrowRight, Crown, Eye } from "lucide-react";
import useCompanyContext from "@/lib/useCompanyContext";

export default function ManageTeamPanel() {
  const ctx = useCompanyContext();
  const { company, role, isOwner, members, canWrite, loading, refresh } = ctx;
  const [emails, setEmails] = useState([""]);
  const [sending, setSending] = useState(false);

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">Loading team…</div>;
  }
  if (!company) {
    return (
      <Card className="border-dashed border-slate-300" data-testid="team-empty-state">
        <CardContent className="p-6 text-center">
          <Users className="h-8 w-8 mx-auto text-slate-400 mb-3" />
          <p className="text-sm text-slate-600">No team set up yet.</p>
        </CardContent>
      </Card>
    );
  }

  const sendInvites = async () => {
    const cleaned = emails.map((e) => e.trim()).filter((e) => /.+@.+\..+/.test(e));
    if (!cleaned.length) { toast.error("Add at least one valid email"); return; }
    setSending(true);
    try {
      const { data } = await clientApi.post("/company-setup/invites", { emails: cleaned });
      const okN = (data.sent || []).length;
      const skipN = (data.skipped || []).length;
      if (okN) toast.success(`Invited ${okN} teammate${okN === 1 ? "" : "s"}`);
      if (skipN) toast.message(`Skipped ${skipN} (${data.skipped.map(s => s.reason).join(", ")})`);
      setEmails([""]);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to send invites");
    } finally { setSending(false); }
  };

  const updateRole = async (memberId, newRole) => {
    try {
      await clientApi.post(`/companies/me/members/${memberId}/role`, { role: newRole });
      toast.success(`Role updated to ${newRole}`);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update role");
    }
  };

  return (
    <div className="space-y-6" data-testid="manage-team-panel">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-display text-lg font-semibold">{company.name}</h3>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
            You · {role}
          </Badge>
          {isOwner && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] uppercase tracking-wider">
              <Crown className="h-2.5 w-2.5 mr-0.5" />Owner
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {canWrite
            ? "As an admin you can invite teammates and change their access level."
            : "You have view-only access. Ask your company admin to promote you to make changes."}
        </p>
      </div>

      {/* Members list */}
      <Card data-testid="team-members-card">
        <CardContent className="p-0">
          <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 font-semibold flex items-center justify-between">
            <span>Team members ({members.length})</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.id} className="px-5 py-3.5 flex flex-wrap items-center gap-3 justify-between" data-testid={`team-member-${m.id}`}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`h-9 w-9 rounded-full grid place-items-center flex-shrink-0 ${
                    m.role === "admin" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {m.role === "admin" ? <ShieldCheck className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium font-mono truncate">{m.client_email}</span>
                      {m.is_owner && (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                          <Crown className="h-2.5 w-2.5 mr-0.5" />Owner
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {m.role === "admin" ? "Full access" : "View-only"}
                      {m.accepted_at && ` · joined ${m.accepted_at.slice(0, 10)}`}
                    </span>
                  </div>
                </div>
                {canWrite && !m.is_owner && (
                  <div className="flex gap-1.5">
                    {m.role === "viewer" ? (
                      <Button size="sm" variant="outline" onClick={() => updateRole(m.id, "admin")} data-testid={`team-promote-${m.id}`}>
                        <ShieldCheck className="h-3.5 w-3.5 mr-1" />Promote to admin
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => updateRole(m.id, "viewer")} data-testid={`team-demote-${m.id}`}>
                        <ShieldX className="h-3.5 w-3.5 mr-1" />Demote to viewer
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Invite form (admin only) */}
      {canWrite && (
        <Card data-testid="team-invite-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
              <Mail className="h-3.5 w-3.5" />Invite teammates
            </div>
            <p className="text-xs text-slate-600 mb-4">
              They'll receive a 14-day magic link and start with view-only access.
            </p>
            <div className="space-y-2">
              {emails.map((em, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={em}
                    onChange={(e) => { const next = [...emails]; next[i] = e.target.value; setEmails(next); }}
                    placeholder={`teammate${i + 1}@yourcompany.com`}
                    data-testid={`team-invite-email-${i}`}
                    className="h-10"
                  />
                  {emails.length > 1 && (
                    <button type="button" onClick={() => setEmails(emails.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500 p-2" data-testid={`team-invite-remove-${i}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setEmails([...emails, ""])} className="text-xs font-medium text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1" data-testid="team-invite-add-row">
                <Plus className="h-3.5 w-3.5" />Add another
              </button>
            </div>
            <div className="mt-4">
              <Button onClick={sendInvites} disabled={sending} className="bg-indigo-700 hover:bg-indigo-800 text-white" data-testid="team-invite-send">
                {sending ? "Sending…" : <>Send invites<ArrowRight className="h-4 w-4 ml-1.5" /></>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
