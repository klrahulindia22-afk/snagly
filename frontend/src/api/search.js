import client from "./client";

export const searchCards = (q, boardId = null) =>
  client
    .get("/search", { params: { q, ...(boardId ? { board_id: boardId } : {}) } })
    .then((r) => r.data);
