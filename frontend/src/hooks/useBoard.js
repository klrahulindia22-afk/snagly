import { useState, useEffect, useCallback } from "react";
import {
  getMyBoards,
  createBoard,
  getBoard,
  getBoardMembers,
  getBoardInvites,
  getShareLink,
  listJoinRequests,
} from "../api/boards";

export function useMyBoards() {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyBoards();
      setBoards(res.data || []);
    } catch (e) {
      setError(e.response?.data?.error?.message || "Failed to load boards");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { boards, loading, error, reload: load };
}

export function useBoardDetail(boardId) {
  const [board, setBoard] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [shareLink, setShareLink] = useState(null);
  const [joinRequests, setJoinRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    try {
      const [b, m, inv, sl, jr] = await Promise.all([
        getBoard(boardId),
        getBoardMembers(boardId),
        getBoardInvites(boardId).catch(() => ({ data: [] })),
        getShareLink(boardId).catch(() => ({ data: null })),
        listJoinRequests(boardId).catch(() => ({ data: [] })),
      ]);
      setBoard(b.data);
      setMembers(m.data || []);
      setInvites(inv.data || []);
      setShareLink(sl.data);
      setJoinRequests(jr.data || []);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    load();
  }, [load]);

  return { board, members, invites, shareLink, joinRequests, loading, reload: load };
}
