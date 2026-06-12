import client from "./client";

export const getTemplates = (boardId) =>
  client.get(`/boards/${boardId}/templates`).then((r) => r.data);

export const createTemplate = (boardId, data) =>
  client.post(`/boards/${boardId}/templates`, data).then((r) => r.data);

export const updateTemplate = (boardId, templateId, data) =>
  client.patch(`/boards/${boardId}/templates/${templateId}`, data).then((r) => r.data);

export const deleteTemplate = (boardId, templateId) =>
  client.delete(`/boards/${boardId}/templates/${templateId}`).then((r) => r.data);
