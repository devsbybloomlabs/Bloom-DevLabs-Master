/**
 * useCompanyContext — fetches the current client's company + their role
 * (owner / admin / viewer) and exposes a convenience flag `canWrite` for
 * gating write actions in the portal UI.
 *
 * Usage:
 *   const { company, role, isOwner, canWrite, members, refresh } = useCompanyContext();
 *   <Button disabled={!canWrite} ... />
 */
import { useEffect, useState, useCallback } from "react";
import { clientApi } from "@/lib/clientAuth";

export default function useCompanyContext() {
  const [state, setState] = useState({ company: null, role: null, members: [], isOwner: false, loading: true });

  const refresh = useCallback(async () => {
    try {
      const { data } = await clientApi.get("/companies/me");
      setState({
        company: data.company,
        role: data.role,
        isOwner: Boolean(data.is_owner),
        members: data.members || [],
        loading: false,
      });
    } catch {
      setState({ company: null, role: null, isOwner: false, members: [], loading: false });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Anyone with role "admin" can write. Viewers are read-only.
  const canWrite = state.role === "admin";

  return { ...state, canWrite, refresh };
}
