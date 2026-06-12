import client from "./client";

export const getMyBoards = () => client.get("/boards").then((r) => r.data);
export const getBoards = getMyBoards;

export const createBoard = (data) =>
  client.post("/boards", data).then((r) => r.data);

export const getBoard = (id) =>
  client.get(`/boards/${id}`).then((r) => r.data);

export const updateBoard = (id, data) =>
  client.patch(`/boards/${id}`, data).then((r) => r.data);

export const archiveBoard = (id) =>
  client.post(`/boards/${id}/archive`).then((r) => r.data);

// Members
export const getBoardMembers = (boardId) =>
  client.get(`/boards/${boardId}/members`).then((r) => r.data);

export const updateMemberRole = (boardId, userId, role) =>
  client
    .patch(`/boards/${boardId}/members/${userId}`, { role })
    .then((r) => r.data);

export const removeMember = (boardId, userId) =>
  client.delete(`/boards/${boardId}/members/${userId}`).then((r) => r.data);

// Invites
export const inviteUser = (boardId, email, role) =>
  client.post(`/boards/${boardId}/invite`, { email, role }).then((r) => r.data);

export const getBoardInvites = (boardId) =>
  client.get(`/boards/${boardId}/invites`).then((r) => r.data);

// Invite accept (no auth required — handled by server)
export const acceptInvite = (token, full_name, password) =>
  client
    .post("/invite/accept", { token, full_name, password })
    .then((r) => r.data);

// Share link
export const createShareLink = (boardId) =>
  client.post(`/boards/${boardId}/share-link`).then((r) => r.data);

export const getShareLink = (boardId) =>
  client.get(`/boards/${boardId}/share-link`).then((r) => r.data);

export const deactivateShareLink = (boardId) =>
  client.delete(`/boards/${boardId}/share-link`).then((r) => r.data);

// Join via share link (public)
export const getJoinPageInfo = (token) =>
  client.get(`/boards/join/${token}`).then((r) => r.data);

// Join requests
export const createJoinRequest = (boardId, message) =>
  client
    .post(`/boards/${boardId}/join-requests`, { message })
    .then((r) => r.data);

export const listJoinRequests = (boardId) =>
  client.get(`/boards/${boardId}/join-requests`).then((r) => r.data);

export const reviewJoinRequest = (boardId, reqId, status) =>
  client
    .patch(`/boards/${boardId}/join-requests/${reqId}`, { status })
    .then((r) => r.data);

export const getBoardArchive = (boardId) =>
  client.get(`/boards/${boardId}/archive`).then((r) => r.data);
