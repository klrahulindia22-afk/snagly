import client from "./client";

export const getBoardDashboard = (boardId, params = {}) =>
  client.get(`/boards/${boardId}/dashboard`, { params }).then((r) => r.data);

export const getGlobalDashboard = (params = {}) =>
  client.get("/dashboard/global", { params }).then((r) => r.data);
