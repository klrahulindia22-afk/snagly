import client from "./client";

export const getComments = (cardId) =>
  client.get(`/cards/${cardId}/comments`).then((r) => r.data);

export const createComment = (cardId, data) =>
  client.post(`/cards/${cardId}/comments`, data).then((r) => r.data);

export const updateComment = (commentId, data) =>
  client.patch(`/comments/${commentId}`, data).then((r) => r.data);

export const deleteComment = (commentId) =>
  client.delete(`/comments/${commentId}`).then((r) => r.data);

export const createReply = (commentId, data) =>
  client.post(`/comments/${commentId}/replies`, data).then((r) => r.data);

export const updateReply = (replyId, data) =>
  client.patch(`/comment-replies/${replyId}`, data).then((r) => r.data);

export const deleteReply = (replyId) =>
  client.delete(`/comment-replies/${replyId}`).then((r) => r.data);
