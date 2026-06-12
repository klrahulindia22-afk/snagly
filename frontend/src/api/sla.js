import client from "./client";

export const getSLARules = (boardId) =>
  client.get(`/boards/${boardId}/sla-rules`).then((r) => r.data);

export const createSLARule = (boardId, data) =>
  client.post(`/boards/${boardId}/sla-rules`, data).then((r) => r.data);

export const updateSLARule = (boardId, ruleId, data) =>
  client.patch(`/boards/${boardId}/sla-rules/${ruleId}`, data).then((r) => r.data);

export const deleteSLARule = (boardId, ruleId) =>
  client.delete(`/boards/${boardId}/sla-rules/${ruleId}`).then((r) => r.data);
