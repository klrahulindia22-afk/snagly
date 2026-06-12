import client from "./client";

export const getChecklists = (cardId) =>
  client.get(`/cards/${cardId}/checklists`).then((r) => r.data);

export const createChecklist = (cardId, data) =>
  client.post(`/cards/${cardId}/checklists`, data).then((r) => r.data);

export const updateChecklist = (checklistId, data) =>
  client.patch(`/checklists/${checklistId}`, data).then((r) => r.data);

export const deleteChecklist = (checklistId) =>
  client.delete(`/checklists/${checklistId}`).then((r) => r.data);

export const createChecklistItem = (checklistId, data) =>
  client.post(`/checklists/${checklistId}/items`, data).then((r) => r.data);

export const updateChecklistItem = (itemId, data) =>
  client.patch(`/checklist-items/${itemId}`, data).then((r) => r.data);

export const deleteChecklistItem = (itemId) =>
  client.delete(`/checklist-items/${itemId}`).then((r) => r.data);
