import client from "./client";

export const getLabels = (boardId) =>
  client.get(`/boards/${boardId}/labels`).then((r) => r.data);

export const createLabel = (boardId, data) =>
  client.post(`/boards/${boardId}/labels`, data).then((r) => r.data);

export const updateLabel = (boardId, labelId, data) =>
  client.patch(`/boards/${boardId}/labels/${labelId}`, data).then((r) => r.data);

export const deleteLabel = (boardId, labelId) =>
  client.delete(`/boards/${boardId}/labels/${labelId}`).then((r) => r.data);
