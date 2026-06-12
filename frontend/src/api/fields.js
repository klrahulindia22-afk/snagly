import client from "./client";

export const getFieldDefinitions = (boardId) =>
  client.get(`/boards/${boardId}/field-definitions`).then((r) => r.data);

export const createFieldDefinition = (boardId, data) =>
  client.post(`/boards/${boardId}/field-definitions`, data).then((r) => r.data);

export const updateFieldDefinition = (boardId, fieldId, data) =>
  client.patch(`/boards/${boardId}/field-definitions/${fieldId}`, data).then((r) => r.data);

export const deleteFieldDefinition = (boardId, fieldId) =>
  client.delete(`/boards/${boardId}/field-definitions/${fieldId}`).then((r) => r.data);

export const getCardFields = (cardId) =>
  client.get(`/cards/${cardId}/fields`).then((r) => r.data);

export const setCardFields = (cardId, fields) =>
  client.put(`/cards/${cardId}/fields`, fields).then((r) => r.data);
