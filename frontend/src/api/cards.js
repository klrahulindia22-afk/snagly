import client from "./client";

export const getCards = (boardId, params = {}) =>
  client.get(`/boards/${boardId}/cards`, { params }).then((r) => r.data);

export const createCard = (boardId, data) =>
  client.post(`/boards/${boardId}/cards`, data).then((r) => r.data);

export const getCard = (cardId) =>
  client.get(`/cards/${cardId}`).then((r) => r.data);

export const updateCard = (cardId, data) =>
  client.patch(`/cards/${cardId}`, data).then((r) => r.data);

export const deleteCard = (cardId) =>
  client.delete(`/cards/${cardId}`).then((r) => r.data);

export const archiveCard = (cardId) =>
  client.post(`/cards/${cardId}/archive`).then((r) => r.data);

export const restoreCard = (cardId) =>
  client.post(`/cards/${cardId}/restore`).then((r) => r.data);

export const moveCard = (cardId, listId, position) =>
  client.patch(`/cards/${cardId}/move`, { list_id: listId, position }).then((r) => r.data);

export const addLabel = (cardId, labelId) =>
  client.post(`/cards/${cardId}/labels/${labelId}`).then((r) => r.data);

export const removeLabel = (cardId, labelId) =>
  client.delete(`/cards/${cardId}/labels/${labelId}`).then((r) => r.data);

export const addAssignee = (cardId, userId) =>
  client.post(`/cards/${cardId}/assignees/${userId}`).then((r) => r.data);

export const removeAssignee = (cardId, userId) =>
  client.delete(`/cards/${cardId}/assignees/${userId}`).then((r) => r.data);

export const permanentDeleteCard = (cardId) =>
  client.delete(`/cards/${cardId}/permanent`).then((r) => r.data);

export const duplicateCard = (cardId) =>
  client.post(`/cards/${cardId}/duplicate`).then((r) => r.data);

export const bulkCardAction = (boardId, data) =>
  client.post(`/boards/${boardId}/cards/bulk`, data).then((r) => r.data);

export const getBoardActivity = (boardId, params = {}) =>
  client.get(`/boards/${boardId}/activity`, { params }).then((r) => r.data);

export const searchCards = (q, perPage = 8) =>
  client.get('/search', { params: { q, per_page: perPage } }).then((r) => r.data);
