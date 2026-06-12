import client from "./client";

export const getBoardIntegrations = (boardId) =>
  client.get(`/boards/${boardId}/integrations`).then((r) => r.data);

export const createIntegration = (boardId, data) =>
  client.post(`/boards/${boardId}/integrations`, data).then((r) => r.data);

export const updateIntegration = (boardId, integrationId, data) =>
  client.patch(`/boards/${boardId}/integrations/${integrationId}`, data).then((r) => r.data);

export const deleteIntegration = (boardId, integrationId) =>
  client.delete(`/boards/${boardId}/integrations/${integrationId}`).then((r) => r.data);

export const getCardPushStatus = (cardId) =>
  client.get(`/cards/${cardId}/push-status`).then((r) => r.data);

export const pushCard = (cardId, integrationId) =>
  client.post(`/cards/${cardId}/push/${integrationId}`).then((r) => r.data);
