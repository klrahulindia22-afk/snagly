import client from "./client";

const base = (boardId) => `/boards/${boardId}/lists`;

export const getLists = (boardId, includeArchived = false) =>
  client
    .get(base(boardId), { params: { include_archived: includeArchived } })
    .then((r) => r.data);

export const createList = (boardId, data) =>
  client.post(base(boardId), data).then((r) => r.data);

export const updateList = (boardId, listId, data) =>
  client.patch(`${base(boardId)}/${listId}`, data).then((r) => r.data);

export const deleteList = (boardId, listId) =>
  client.delete(`${base(boardId)}/${listId}`).then((r) => r.data);

export const archiveList = (boardId, listId) =>
  client.post(`${base(boardId)}/${listId}/archive`).then((r) => r.data);

export const restoreList = (boardId, listId) =>
  client.post(`${base(boardId)}/${listId}/restore`).then((r) => r.data);

export const reorderLists = (boardId, lists) =>
  client.patch(`${base(boardId)}/reorder`, { lists }).then((r) => r.data);

export const getAutomationRules = (boardId, listId) =>
  client.get(`${base(boardId)}/${listId}/automation-rules`).then((r) => r.data);

export const createAutomationRule = (boardId, listId, data) =>
  client
    .post(`${base(boardId)}/${listId}/automation-rules`, data)
    .then((r) => r.data);

export const toggleAutomationRule = (boardId, listId, ruleId, is_active) =>
  client
    .patch(`${base(boardId)}/${listId}/automation-rules/${ruleId}`, { is_active })
    .then((r) => r.data);
