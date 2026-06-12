import client from "./client";

export const getTimeEntries = (cardId) =>
  client.get(`/cards/${cardId}/time-entries`).then((r) => r.data);

export const createTimeEntry = (cardId, data) =>
  client.post(`/cards/${cardId}/time-entries`, data).then((r) => r.data);

export const deleteTimeEntry = (entryId) =>
  client.delete(`/time-entries/${entryId}`).then((r) => r.data);

export const exportBoard = (boardId, format = "csv") =>
  client.get(`/boards/${boardId}/export`, { params: { format }, responseType: "blob" });

export const importBoard = (boardId, file) => {
  const form = new FormData();
  form.append("file", file);
  return client.post(`/boards/${boardId}/import`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then((r) => r.data);
};

export const setRecurrence = (cardId, pattern, endDate = null) =>
  client.put(`/cards/${cardId}/recurrence`, { pattern, end_date: endDate }).then((r) => r.data);

export const clearRecurrence = (cardId) =>
  client.delete(`/cards/${cardId}/recurrence`).then((r) => r.data);
