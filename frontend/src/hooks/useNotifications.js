import { useState, useEffect, useCallback } from "react";
import { pollNotifications } from "../api/notifications";
import useAuthStore from "../stores/authStore";
import wsService from "../services/wsService";

export default function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [latest, setLatest] = useState([]);
  const accessToken = useAuthStore((s) => s.accessToken);

  const poll = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await pollNotifications();
      setUnreadCount(res.data.unread_count);
      setLatest(res.data.notifications || []);
    } catch {
      // Silently ignore poll failures
    }
  }, [accessToken]);

  // Real-time notification via WebSocket; polling is fallback at 60s
  useEffect(() => {
    const handler = (msg) => {
      if (msg.type === "notification") {
        // Optimistic increment so badge updates instantly
        setUnreadCount((c) => c + 1);
        // Sync accurate count from DB after the backend commit completes (≥150ms)
        setTimeout(() => poll(), 300);
      }
    };
    wsService.subscribe("notification", handler);
    return () => wsService.unsubscribe("notification", handler);
  }, [poll]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 60_000);
    return () => clearInterval(id);
  }, [poll]);

  return { unreadCount, latest, refresh: poll };
}
