/**
 * Mounts exactly once in GlobalNav to dispatch browser desktop notifications
 * when a WebSocket notification arrives and the browser tab is not focused.
 *
 * This is separate from useNotifications so the browser-push logic is never
 * duplicated (useNotifications is consumed in both NotifBell and NotifPage).
 */
import { useEffect } from "react";
import wsService from "../services/wsService";
import useAuthStore from "../stores/authStore";
import useBrowserNotifications, { notifTypeText } from "./useBrowserNotifications";

export default function useBrowserNotifHandler() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { notify } = useBrowserNotifications();

  useEffect(() => {
    if (!accessToken) return;

    const handler = (msg) => {
      if (msg.type !== "notification") return;

      const data = msg.data || {};
      const body = notifTypeText(data.notif_type);
      notify("Snagly", body, {
        tag: `notif-${data.notif_type}`,
        onClick: () => {
          const { board_id, card_id } = data.payload || {};
          if (data.notif_type === "board_restored" && board_id) {
            window.location.href = `/board/${board_id}`;
          } else if (data.notif_type === "board_archived") {
            window.location.href = "/boards";
          } else if (board_id && card_id) {
            window.location.href = `/board/${board_id}?openCard=${card_id}`;
          } else {
            window.location.href = "/notifications";
          }
        },
      });
    };

    wsService.subscribe("notification", handler);
    return () => wsService.unsubscribe("notification", handler);
  }, [accessToken, notify]);
}
