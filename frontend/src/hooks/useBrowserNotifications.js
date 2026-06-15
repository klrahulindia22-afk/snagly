/**
 * Browser Notification API — reactive wrapper.
 *
 * Exports:
 *   useBrowserNotifications() → { permission, requestPermission, notify }
 *   notifTypeText(type)       → human-readable string for a notification type
 *
 * permission is a live React state value that re-syncs whenever:
 *   - the user grants / denies via requestPermission()
 *   - the tab regains visibility (catches changes made in browser settings)
 *   - the window regains focus
 */
import { useState, useEffect, useCallback } from "react";

const DISMISS_KEY = "snagly_notif_banner_dismissed";

export function getPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

export function wasBannerDismissed() {
  return localStorage.getItem(DISMISS_KEY) === "1";
}

export function dismissBanner() {
  localStorage.setItem(DISMISS_KEY, "1");
}

const TYPE_TEXTS = {
  mention:               "You were mentioned in a comment",
  reply:                 "Someone replied to your comment",
  comment:               "Someone commented on your card",
  card_assigned:         "You were assigned to a card",
  join_request_received: "Someone requested to join your board",
  join_request_approved: "Your join request was approved",
  join_request_declined: "Your join request was declined",
  card_overdue:          "A card assigned to you is overdue",
  push_failed:           "An integration push failed",
  board_archived:        "A board you're on has been archived",
  board_restored:        "A board you're on has been restored",
};

export function notifTypeText(type) {
  return TYPE_TEXTS[type] || "You have a new notification";
}

export default function useBrowserNotifications() {
  const [permission, setPermission] = useState(getPermission);

  // Re-check whenever the tab becomes visible or the window gains focus —
  // this catches changes the user made in browser settings.
  useEffect(() => {
    const sync = () => setPermission(getPermission());
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission !== "default") {
      setPermission(Notification.permission);
      return Notification.permission;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch {
      setPermission("denied");
      return "denied";
    }
  }, []);

  const notify = useCallback((title, body, { tag, onClick } = {}) => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const n = new Notification(title, {
      body,
      icon: "/logo-on-teal.svg",
      badge: "/logo-on-teal.svg",
      tag: tag || "snagly-notif",
      renotify: true,
    });

    n.onclick = () => {
      window.focus();
      n.close();
      onClick?.();
    };

    setTimeout(() => n.close(), 8_000);
  }, []);

  return { permission, requestPermission, notify };
}
