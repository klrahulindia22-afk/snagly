import client from "./client";

export const getAttachments = (cardId) =>
  client.get(`/cards/${cardId}/attachments`).then((r) => r.data);

export const uploadAttachment = (cardId, formData) =>
  client
    .post(`/cards/${cardId}/attachments`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);

export const addLinkAttachment = (cardId, data) =>
  client.post(`/cards/${cardId}/attachments/link`, data).then((r) => r.data);

export const deleteAttachment = (attachmentId) =>
  client.delete(`/attachments/${attachmentId}`).then((r) => r.data);

export const setCover = (attachmentId) =>
  client.patch(`/attachments/${attachmentId}/cover`).then((r) => r.data);
