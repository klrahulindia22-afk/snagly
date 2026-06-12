import { useState, useEffect, useCallback } from "react";
import { getBoardActivity } from "../../api/cards";
import { getBoardMembers } from "../../api/boards";

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ActionLabel({ action }) {
  const labels = {
    "card.created": "created card",
    "card.updated": "updated card",
    "card.moved": "moved card",
    "card.archived": "archived card",
    "card.restored": "restored card",
    "card.assigned": "assigned",
    "card.label_added": "added label",
    "card.label_removed": "removed label",
    "card.comment": "commented on",
    "card.pushed": "pushed card to integration",
    "member.joined": "joined board",
    "member.left": "left board",
    "join_request.approved": "approved join request",
    "board.created": "created board",
  };
  return <span className="text-white/55">{labels[action] || action}</span>;
}

export default function BoardActivityPanel({ boardId, onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [members, setMembers] = useState([]);
  const [filterUserId, setFilterUserId] = useState("");
  const PER_PAGE = 30;

  useEffect(() => {
    getBoardMembers(boardId).then((r) => setMembers(r.data || [])).catch(() => {});
  }, [boardId]);

  const load = useCallback(async (p = 1, uid = filterUserId) => {
    setLoading(true);
    try {
      const params = { page: p, per_page: PER_PAGE };
      if (uid) params.user_id = Number(uid);
      const res = await getBoardActivity(boardId, params);
      const items = res.data || [];
      setEntries((prev) => (p === 1 ? items : [...prev, ...items]));
      setHasMore(items.length === PER_PAGE);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [boardId, filterUserId]);

  useEffect(() => { load(1); }, [load]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    load(next);
  };

  const handleFilterChange = (uid) => {
    setFilterUserId(uid);
    setPage(1);
    load(1, uid);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-80 h-full bg-[#1e2435] border-l border-white/10 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <h3 className="text-white font-semibold text-sm">Board activity</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-white/30 hover:text-white transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Member filter */}
        {members.length > 0 && (
          <div className="px-4 py-2 border-b border-white/5 shrink-0">
            <select
              value={filterUserId}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="w-full bg-white/8 border border-white/15 text-white/70 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#0f9e8e]"
            >
              <option value="">All members</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Feed */}
        <div className="flex-1 overflow-y-auto">
          {loading && entries.length === 0 ? (
            <div className="py-12 text-center text-white/25 text-sm">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-white/35 text-sm">No activity yet</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {entries.map((entry) => (
                <div key={entry.id} className="px-4 py-3 flex gap-2.5">
                  {/* Avatar */}
                  <div
                    className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold text-white mt-0.5"
                    style={{ backgroundColor: entry.user?.initials_color || "#0f9e8e" }}
                    title={entry.user?.full_name}
                  >
                    {(entry.user?.full_name || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/75 text-xs leading-snug">
                      <span className="font-medium text-white">{entry.user?.full_name || "Someone"}</span>{" "}
                      <ActionLabel action={entry.action} />
                      {entry.card && (
                        <>
                          {" "}
                          <span className="text-white/40">"{entry.card.title}"</span>
                        </>
                      )}
                    </p>
                    <p className="text-white/25 text-[10px] mt-0.5">{timeAgo(entry.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {hasMore && !loading && (
            <div className="px-4 py-3">
              <button
                onClick={loadMore}
                className="w-full py-2 text-xs text-white/40 hover:text-white transition-colors border border-white/10 rounded-lg hover:border-white/25"
              >
                Load more
              </button>
            </div>
          )}

          {loading && entries.length > 0 && (
            <p className="text-center text-white/25 text-xs py-3">Loading…</p>
          )}
        </div>
      </div>
    </div>
  );
}
