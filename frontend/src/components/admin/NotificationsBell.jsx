import { useEffect, useMemo, useState, useCallback } from "react";
import { authClient, useAuth } from "@/lib/auth";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function NotificationsBell() {
  const { token } = useAuth();
  const api = useMemo(() => authClient(token), [token]);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await api.get("/notifications?limit=20");
      setItems(r.data.items || []);
      setUnread(r.data.unread || 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [api, token]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const markRead = async (n) => {
    try {
      await api.post(`/notifications/${n.id}/read`);
      setItems((arr) => arr.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      if (n.link) navigate(n.link);
    } catch {
      toast.error("Failed");
    }
  };

  const clearAll = async () => {
    try {
      await api.post("/notifications/clear");
      setItems((arr) => arr.map((x) => ({ ...x, read: true })));
      setUnread(0);
    } catch {
      // ignore
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          data-testid="notifications-bell"
          className="relative"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span
              data-testid="notifications-unread-count"
              className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center text-[10px] tabular-nums bg-red-500 text-white rounded-full w-4 h-4"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0"
        data-testid="notifications-popover"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="text-sm font-medium">Notifications</div>
          <button
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-foreground"
            data-testid="notifications-clear-button"
          >
            Mark all read
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-xs text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li
                  key={n.id}
                  data-testid={`notification-${n.id}`}
                  className={`px-4 py-3 hover:bg-secondary/40 cursor-pointer transition-colors ${
                    n.read ? "opacity-70" : ""
                  }`}
                  onClick={() => markRead(n)}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#3B82F6] flex-shrink-0" />
                    )}
                    {n.read && (
                      <Check className="h-3.5 w-3.5 mt-0.5 text-emerald-600 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{n.title}</div>
                      {n.body && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.body}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {new Date(n.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
