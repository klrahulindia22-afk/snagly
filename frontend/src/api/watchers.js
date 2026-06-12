import client from "./client";

export const watchCard = (cardId) =>
  client.post(`/cards/${cardId}/watch`).then((r) => r.data);

export const unwatchCard = (cardId) =>
  client.delete(`/cards/${cardId}/watch`).then((r) => r.data);

export const getCardWatchers = (cardId) =>
  client.get(`/cards/${cardId}/watchers`).then((r) => r.data);
