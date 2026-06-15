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

const ACTION_LABELS = {
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
    } catch { /* ignore */ }
    finally { setLoading(false); }
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
      style={{ position:"fixed", inset:0, zIndex:100, display:"flex", justifyContent:"flex-end" }}
      onClick={onClose}
    >
      <div
        style={{
          width: 320, height:"100%",
          background:"var(--modal-bg)",
          borderLeft:"1px solid var(--border)",
          display:"flex", flexDirection:"column",
          boxShadow:"-8px 0 32px rgba(0,0,0,.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)", margin:0 }}>Board activity</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:18, lineHeight:1, padding:4, borderRadius:4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            ✕
          </button>
        </div>

        {/* Member filter */}
        {members.length > 0 && (
          <div style={{ padding:"8px 12px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
            <select
              value={filterUserId}
              onChange={(e) => handleFilterChange(e.target.value)}
              style={{
                width:"100%", background:"var(--input-bg)", border:"1px solid var(--border)",
                color:"var(--text-secondary)", fontSize:12, borderRadius:8,
                padding:"6px 10px", outline:"none", fontFamily:"inherit",
              }}
              onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
            >
              <option value="">All members</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Feed */}
        <div style={{ flex:1, overflowY:"auto" }}>
          {loading && entries.length === 0 ? (
            <div style={{ padding:"48px 0", textAlign:"center", color:"var(--text-muted)", fontSize:13 }}>Loading…</div>
          ) : entries.length === 0 ? (
            <div style={{ padding:"48px 0", textAlign:"center" }}>
              <p style={{ fontSize:28, marginBottom:8 }}>📋</p>
              <p style={{ color:"var(--text-muted)", fontSize:13 }}>No activity yet</p>
            </div>
          ) : (
            <div>
              {entries.map((entry, i) => (
                <div
                  key={entry.id}
                  style={{
                    padding:"10px 16px", display:"flex", gap:10,
                    borderBottom:"1px solid var(--border)",
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width:24, height:24, borderRadius:"50%", flexShrink:0,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:9, fontWeight:700, color:"#fff", marginTop:2,
                      backgroundColor: entry.user?.initials_color || "#6c63ff",
                    }}
                    title={entry.user?.full_name}
                  >
                    {(entry.user?.full_name || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:12, color:"var(--text-secondary)", lineHeight:1.4, margin:0 }}>
                      <span style={{ fontWeight:600, color:"var(--text-primary)" }}>{entry.user?.full_name || "Someone"}</span>{" "}
                      <span style={{ color:"var(--text-muted)" }}>{ACTION_LABELS[entry.action] || entry.action}</span>
                      {entry.card && (
                        <> <span style={{ color:"var(--text-muted)" }}>"{entry.card.title}"</span></>
                      )}
                    </p>
                    <p style={{ fontSize:10, color:"var(--text-muted)", marginTop:3 }}>{timeAgo(entry.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {hasMore && !loading && (
            <div style={{ padding:"12px 16px" }}>
              <button
                onClick={loadMore}
                style={{
                  width:"100%", padding:"8px 0", fontSize:12,
                  color:"var(--text-muted)", background:"none",
                  border:"1px solid var(--border)", borderRadius:8,
                  cursor:"pointer", fontFamily:"inherit", transition:"border-color .12s, color .12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--text-secondary)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                Load more
              </button>
            </div>
          )}

          {loading && entries.length > 0 && (
            <p style={{ textAlign:"center", color:"var(--text-muted)", fontSize:11, padding:"10px 0" }}>Loading…</p>
          )}
        </div>
      </div>
    </div>
  );
}
