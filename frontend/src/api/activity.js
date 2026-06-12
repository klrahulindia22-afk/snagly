import client from "./client";

export const getCardActivity = (cardId, page = 1, perPage = 50) =>
  client
    .get(`/cards/${cardId}/activity`, { params: { page, per_page: perPage } })
    .then((r) => r.data);
