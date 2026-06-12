import client from "./client";

export const pollNotifications = () =>
  client.get("/notifications/poll").then((r) => r.data);

export const getNotifications = (page = 1, perPage = 20) =>
  client
    .get("/notifications", { params: { page, per_page: perPage } })
    .then((r) => r.data);

export const markRead = (notifId) =>
  client.patch(`/notifications/${notifId}/read`).then((r) => r.data);

export const markAllRead = () =>
  client.patch("/notifications/read-all").then((r) => r.data);

export const getNotifPrefs = () =>
  client.get("/users/me/notification-prefs").then((r) => r.data);

export const updateNotifPrefs = (data) =>
  client.patch("/users/me/notification-prefs", data).then((r) => r.data);
