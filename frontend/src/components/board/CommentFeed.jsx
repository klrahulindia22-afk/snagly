import { useState, useEffect, useCallback, useRef } from "react";
import { getComments, createComment, updateComment, deleteComment, createReply, updateReply, deleteReply } from "../../api/comments";
import { getCardActivity } from "../../api/activity";
import { getBoardMembers } from "../../api/boards";
import { relativeTime } from "../../utils/dates";
import useAuthStore from "../../stores/authStore";

function Avatar({ name, color, size = "sm" }) {
  const dim = size === "sm" ? 24 : 32;
  return (
    <div
      style={{
        width: dim, height: dim, borderRadius: "50%",
        backgroundColor: color || "#6c63ff",
        color: "#fff", fontSize: dim <= 24 ? 10 : 12,
        fontWeight: 700, display: "flex", alignItems: "center",
        justifyContent: "center", flexShrink: 0, userSelect: "none",
      }}
    >
      {(name || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

function renderBody(body, members) {
  if (!body) return null;
  const firstNameMap = {};
  (members || []).forEach((m) => {
    const first = m.full_name?.split(" ")[0]?.toLowerCase();
    if (first) firstNameMap[first] = m.initials_color || "#6c63ff";
  });
  const parts = body.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (/^@\w+$/.test(part)) {
      const token = part.slice(1).toLowerCase();
      if (token === "board" || token === "card" || firstNameMap[token]) {
        return (
          <span key={i} style={{ background:"#ede9fe", color:"#5b52e0", borderRadius:3, padding:"0 3px", fontWeight:600 }}>
            {part}
          </span>
        );
      }
    }
    return part;
  });
}

function MentionInput({ value, onChange, placeholder, rows = 3, members = [], onSubmit }) {
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const wrapRef     = useRef(null);
  const [focused,   setFocused]   = useState(false);
  const [dropdown,  setDropdown]  = useState(null);
  const [dropPos,   setDropPos]   = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const DROPDOWN_W  = 290;
  const ITEM_H      = 54;   // approx height per row
  const GAP         = 6;

  const CARD_OPTION  = { id: "__card__",  full_name: "All members on the card",  handle: "card",  isCard: true  };
  const BOARD_OPTION = { id: "__board__", full_name: "All members on the board", handle: "board", isBoard: true };

  const getHandle = (m) => {
    if (m.isCard)  return "card";
    if (m.isBoard) return "board";
    return m.email?.split("@")[0] || m.full_name?.split(" ")[0]?.toLowerCase() || "user";
  };

  const getFiltered = (query) => {
    const q = query.toLowerCase();
    const memberMatches = members.filter((m) => {
      const name   = m.full_name?.toLowerCase() || "";
      const handle = getHandle(m);
      return name.includes(q) || handle.startsWith(q);
    });
    const cardMatch  = q === "" || "card".startsWith(q)  || "all members on the card".includes(q);
    const boardMatch = q === "" || "board".startsWith(q) || "all members on the board".includes(q);
    return [
      ...memberMatches,
      ...(cardMatch  ? [CARD_OPTION]  : []),
      ...(boardMatch ? [BOARD_OPTION] : []),
    ];
  };

  const filteredMembers = dropdown ? getFiltered(dropdown.query) : [];

  /* Recalculate fixed position whenever dropdown opens */
  useEffect(() => {
    if (!dropdown || !textareaRef.current) { setDropPos(null); return; }
    const rect     = textareaRef.current.getBoundingClientRect();
    const vh       = window.innerHeight;
    const vw       = window.innerWidth;
    const listH    = Math.min(filteredMembers.length * ITEM_H + 12, 320);
    const spaceBelow = vh - rect.bottom - GAP - 8;
    const spaceAbove = rect.top - GAP - 8;

    let top = null, bottom = null;
    let maxHeight;

    if (spaceBelow >= listH || spaceBelow >= spaceAbove) {
      /* open downward */
      top       = rect.bottom + GAP;
      maxHeight = Math.max(120, spaceBelow);
    } else {
      /* open upward */
      bottom    = vh - rect.top + GAP;
      maxHeight = Math.max(120, spaceAbove);
    }

    let left = rect.left;
    if (left + DROPDOWN_W > vw - 8) left = vw - DROPDOWN_W - 8;
    if (left < 8) left = 8;

    setDropPos({ top, bottom, left, maxHeight });
  }, [dropdown, filteredMembers.length]);

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/@(\w*)$/);
    if (match) {
      setDropdown({ query: match[1], atIdx: cursor - match[0].length });
      setActiveIdx(0);
    } else {
      setDropdown(null);
    }
  };

  const insertMention = (member) => {
    if (!dropdown) return;
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const before  = value.slice(0, dropdown.atIdx);
    const after   = value.slice(cursor);
    const tag     = `@${getHandle(member)}`;
    const newVal  = `${before}${tag} ${after}`;
    onChange(newVal);
    setDropdown(null);
    setDropPos(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + tag.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmit?.(); return; }
    if (!dropdown || filteredMembers.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filteredMembers.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); if (filteredMembers[activeIdx]) insertMention(filteredMembers[activeIdx]); }
    else if (e.key === "Escape") { setDropdown(null); setDropPos(null); }
  };

  useEffect(() => {
    if (!dropdownRef.current) return;
    dropdownRef.current.children[activeIdx]?.scrollIntoView?.({ block: "nearest" });
  }, [activeIdx]);

  /* ── group-icon SVG for @card / @board ── */
  const GroupIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );

  return (
    <div ref={wrapRef} style={{ position:"relative" }}>
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setTimeout(() => { setDropdown(null); setDropPos(null); }, 150); }}
        placeholder={placeholder}
        style={{
          width:"100%", resize:"none", outline:"none",
          background: focused ? "var(--input-bg-focus)" : "var(--input-bg)",
          border:`1px solid ${focused ? "#6c63ff" : "var(--input-border)"}`,
          borderRadius:6, padding:"8px 12px", fontSize:13,
          color:"var(--text-primary)", fontFamily:"inherit", boxSizing:"border-box",
        }}
      />

      {dropdown && filteredMembers.length > 0 && dropPos && (
        <div
          ref={dropdownRef}
          style={{
            position:"fixed",
            top:    dropPos.top    != null ? dropPos.top    : "auto",
            bottom: dropPos.bottom != null ? dropPos.bottom : "auto",
            left:   dropPos.left,
            zIndex: 9999,
            background:"var(--modal-bg, #fff)",
            border:"1px solid var(--border, #e0e0e0)",
            borderRadius:10,
            boxShadow:"0 8px 32px rgba(9,30,66,.22)",
            width: DROPDOWN_W,
            maxHeight: dropPos.maxHeight,
            overflowY:"auto",
            padding:"6px 0",
          }}
        >
          {filteredMembers.map((m, i) => {
            const isSpecial = m.isCard || m.isBoard;
            const handle    = getHandle(m);
            const isActive  = i === activeIdx;

            return (
              <div
                key={m.id}
                onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  display:"flex", alignItems:"center", gap:12,
                  padding:"8px 14px", cursor:"pointer",
                  background: isActive ? "var(--input-bg, #f4f5f7)" : "transparent",
                  transition:"background .1s",
                }}
              >
                {/* Avatar */}
                {isSpecial ? (
                  <div style={{
                    width:36, height:36, borderRadius:"50%", flexShrink:0,
                    background:"var(--input-bg, #f0f0f0)",
                    border:"1px solid var(--border)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    color:"var(--text-secondary, #6b7280)",
                  }}>
                    <GroupIcon />
                  </div>
                ) : (
                  <div style={{
                    width:36, height:36, borderRadius:"50%", flexShrink:0,
                    background: m.initials_color || "#6c63ff",
                    color:"#fff", fontSize:13, fontWeight:700,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    letterSpacing:"0.5px",
                  }}>
                    {(m.full_name || "?").slice(0, 2).toUpperCase()}
                  </div>
                )}

                {/* Name + handle */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", lineHeight:1.3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {m.full_name}
                  </div>
                  <div style={{ fontSize:12, color:"var(--text-muted, #8993a4)", marginTop:2 }}>
                    @{handle}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReplyItem({ reply, currentUserId, onDelete, onUpdate, members }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.body || "");
  const [saving, setSaving] = useState(false);

  if (reply.is_deleted) {
    return (
      <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginLeft:32, marginTop:6 }}>
        <Avatar name={reply.user?.full_name} color={reply.user?.initials_color} />
        <p style={{ color:"var(--text-muted)", fontSize:12, fontStyle:"italic", marginTop:4 }}>This reply was deleted.</p>
      </div>
    );
  }

  const save = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try { await onUpdate(reply.id, draft.trim()); setEditing(false); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginLeft:32, marginTop:8 }} className="group">
      <Avatar name={reply.user?.full_name} color={reply.user?.initials_color} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
          <span style={{ fontSize:12, fontWeight:600, color:"var(--text-primary)" }}>{reply.user?.full_name}</span>
          <span style={{ fontSize:10, color:"var(--text-muted)" }}>{relativeTime(reply.created_at)}</span>
        </div>
        {editing ? (
          <div style={{ marginTop:4, display:"flex", flexDirection:"column", gap:6 }}>
            <MentionInput value={draft} onChange={setDraft} rows={2} members={members} onSubmit={save} />
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={save} disabled={saving} style={{ padding:"3px 12px", background:"#6c63ff", color:"#fff", border:"none", borderRadius:4, fontSize:12, cursor:"pointer", fontFamily:"inherit", opacity:saving?0.6:1 }}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditing(false)} style={{ background:"none", border:"none", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize:12, color:"var(--text-primary)", marginTop:2, lineHeight:1.5, whiteSpace:"pre-wrap" }}>
            {renderBody(reply.body, members)}
          </p>
        )}
        {currentUserId === reply.user_id && !editing && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ display:"flex", gap:10, marginTop:2 }}>
            <button onClick={() => { setDraft(reply.body); setEditing(true); }} style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}
              onMouseEnter={(e) => e.currentTarget.style.color="var(--text-primary)"}
              onMouseLeave={(e) => e.currentTarget.style.color="var(--text-muted)"}
            >Edit</button>
            <button onClick={() => onDelete(reply.id)} style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}
              onMouseEnter={(e) => e.currentTarget.style.color="#dc2626"}
              onMouseLeave={(e) => e.currentTarget.style.color="var(--text-muted)"}
            >Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentItem({ comment, currentUserId, onDelete, onUpdate, onReply, onUpdateReply, onDeleteReply, members }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body || "");
  const [saving, setSaving] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [postingReply, setPostingReply] = useState(false);

  const save = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try { await onUpdate(comment.id, draft.trim()); setEditing(false); }
    finally { setSaving(false); }
  };

  const submitReply = async (e) => {
    e?.preventDefault();
    if (!replyDraft.trim()) return;
    setPostingReply(true);
    try { await onReply(comment.id, replyDraft.trim()); setReplyDraft(""); setShowReply(false); }
    finally { setPostingReply(false); }
  };

  if (comment.is_deleted) {
    return (
      <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
        <Avatar name={comment.user?.full_name} color={comment.user?.initials_color} size="md" />
        <div style={{ flex:1 }}>
          <p style={{ color:"var(--text-muted)", fontSize:12, fontStyle:"italic", marginTop:6 }}>This comment was deleted.</p>
          {comment.replies?.length > 0 && (
            <div style={{ marginTop:8, paddingLeft:12, borderLeft:"2px solid var(--border)" }}>
              {comment.replies.map((r) => (
                <ReplyItem key={r.id} reply={r} currentUserId={currentUserId} onDelete={onDeleteReply} onUpdate={onUpdateReply} members={members} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", alignItems:"flex-start", gap:10 }} className="group">
      <Avatar name={comment.user?.full_name} color={comment.user?.initials_color} size="md" />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:4 }}>
          <span style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)" }}>{comment.user?.full_name}</span>
          <span style={{ fontSize:10, color:"var(--text-muted)" }}>{relativeTime(comment.created_at)}</span>
          {comment.updated_at !== comment.created_at && (
            <span style={{ fontSize:10, color:"var(--text-muted)" }}>(edited)</span>
          )}
        </div>

        {editing ? (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <MentionInput value={draft} onChange={setDraft} rows={3} members={members} onSubmit={save} />
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={save} disabled={saving} style={{ padding:"4px 14px", background:"#6c63ff", color:"#fff", border:"none", borderRadius:4, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", opacity:saving?0.6:1 }}
                onMouseEnter={(e) => e.currentTarget.style.background="#5b52e0"}
                onMouseLeave={(e) => e.currentTarget.style.background="#6c63ff"}
              >{saving ? "Saving…" : "Save"}</button>
              <button onClick={() => setEditing(false)} style={{ background:"none", border:"none", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ background:"var(--comment-bubble,var(--input-bg))", borderRadius:6, padding:"8px 12px" }}>
            <p style={{ fontSize:13, lineHeight:1.55, whiteSpace:"pre-wrap", color:"var(--text-primary)", margin:0 }}>
              {renderBody(comment.body, members)}
            </p>
          </div>
        )}

        {!editing && (
          <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:4 }}>
            <button
              onClick={() => setShowReply((v) => !v)}
              style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}
              onMouseEnter={(e) => e.currentTarget.style.color="var(--text-primary)"}
              onMouseLeave={(e) => e.currentTarget.style.color="var(--text-muted)"}
            >
              Reply
            </button>
            {currentUserId === comment.user_id && (
              <>
                <button
                  onClick={() => { setDraft(comment.body); setEditing(true); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}
                  onMouseEnter={(e) => e.currentTarget.style.color="var(--text-primary)"}
                  onMouseLeave={(e) => e.currentTarget.style.color="var(--text-muted)"}
                >Edit</button>
                <button
                  onClick={() => onDelete(comment.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}
                  onMouseEnter={(e) => e.currentTarget.style.color="#dc2626"}
                  onMouseLeave={(e) => e.currentTarget.style.color="var(--text-muted)"}
                >Delete</button>
              </>
            )}
          </div>
        )}

        {/* Replies */}
        {comment.replies?.length > 0 && (
          <div style={{ marginTop:8, paddingLeft:12, borderLeft:"2px solid var(--border)", display:"flex", flexDirection:"column", gap:4 }}>
            {comment.replies.map((r) => (
              <ReplyItem key={r.id} reply={r} currentUserId={currentUserId} onDelete={onDeleteReply} onUpdate={onUpdateReply} members={members} />
            ))}
          </div>
        )}

        {/* Reply input */}
        {showReply && (
          <form onSubmit={submitReply} style={{ marginTop:8, marginLeft:32, display:"flex", flexDirection:"column", gap:6 }}>
            <MentionInput
              value={replyDraft}
              onChange={setReplyDraft}
              rows={2}
              placeholder="Write a reply… (Ctrl+Enter)"
              members={members}
              onSubmit={submitReply}
            />
            <div style={{ display:"flex", gap:6 }}>
              <button type="submit" disabled={postingReply || !replyDraft.trim()} style={{ padding:"4px 12px", background:"#6c63ff", color:"#fff", border:"none", borderRadius:4, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", opacity:postingReply||!replyDraft.trim()?0.5:1 }}>
                {postingReply ? "Posting…" : "Reply"}
              </button>
              <button type="button" onClick={() => { setShowReply(false); setReplyDraft(""); }} style={{ background:"none", border:"none", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const ACTION_ICONS = {
  "card.created": "✦",
  "archived": "📦",
  "moved card": "↗",
  "assigned": "👤",
  "removed": "✕",
  "added label": "🏷",
  "removed label": "🏷",
  "renamed": "✏️",
  "updated description": "📝",
  "changed priority": "⚡",
  "changed severity": "🔴",
  "set due date": "📅",
  "marked card complete": "✅",
  "marked card incomplete": "○",
  "set start date": "📅",
};

function getActionIcon(action) {
  for (const [key, icon] of Object.entries(ACTION_ICONS)) {
    if (action?.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return "•";
}

function ActivityLine({ log }) {
  const icon = getActionIcon(log.action);
  return (
    <div style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"4px 0" }}>
      <div style={{
        width:24, height:24, borderRadius:"50%",
        background: log.user_initials_color || "#6c63ff",
        color:"#fff", fontSize:10, fontWeight:700,
        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
      }}>
        {(log.user_full_name || "?").slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex:1, minWidth:0, paddingTop:2 }}>
        <span style={{ fontSize:12, fontWeight:600, color:"var(--text-primary)" }}>{log.user_full_name}</span>
        {" "}
        <span style={{ fontSize:12, color:"var(--text-secondary)" }}>{log.action}</span>
      </div>
      <span style={{ fontSize:10, color:"var(--text-muted)", flexShrink:0, paddingTop:3 }}>{relativeTime(log.created_at)}</span>
    </div>
  );
}

export default function CommentFeed({ cardId, boardId }) {
  const { user } = useAuthStore();
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [members, setMembers] = useState([]);
  const [newBody, setNewBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    const [commRes, actRes] = await Promise.all([
      getComments(cardId),
      getCardActivity(cardId, 1, 100),
    ]);
    setComments(commRes.data || []);
    setActivity(actRes.data || []);
    setLoading(false);
  }, [cardId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!boardId) return;
    getBoardMembers(boardId).then((res) => setMembers(res.data || [])).catch(() => {});
  }, [boardId]);

  // Merge comments + activity, sorted newest first
  const feed = [
    ...(comments || []).map((c) => ({ ...c, _type: "comment" })),
    ...(activity || []).map((a) => ({ ...a, _type: "activity" })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const COLLAPSE_THRESHOLD = 8;
  const visibleFeed = expanded ? feed : feed.slice(0, COLLAPSE_THRESHOLD);

  const post = async (e) => {
    e?.preventDefault();
    if (!newBody.trim()) return;
    setPosting(true);
    try {
      await createComment(cardId, { body: newBody.trim() });
      setNewBody("");
      load();
    } finally {
      setPosting(false);
    }
  };

  const handleUpdateComment = async (commentId, body) => { await updateComment(commentId, { body }); load(); };
  const handleDeleteComment = async (commentId) => { if (!confirm("Delete this comment?")) return; await deleteComment(commentId); load(); };
  const handleReply        = async (commentId, body) => { await createReply(commentId, { body }); load(); };
  const handleUpdateReply  = async (replyId, body) => { await updateReply(replyId, { body }); load(); };
  const handleDeleteReply  = async (replyId) => { if (!confirm("Delete this reply?")) return; await deleteReply(replyId); load(); };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* ── Comment composer — always at top ── */}
      <form onSubmit={post} style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
        <Avatar name={user?.full_name} color={user?.initials_color} size="md" />
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:8 }}>
          <MentionInput
            value={newBody}
            onChange={setNewBody}
            rows={3}
            placeholder="Write a comment… Use @name or @board to mention. (Ctrl+Enter to submit)"
            members={members}
            onSubmit={post}
          />
          {newBody.trim() && (
            <button
              type="submit"
              disabled={posting}
              style={{
                alignSelf:"flex-start", padding:"6px 18px", background:"#6c63ff", color:"#fff",
                border:"none", borderRadius:6, fontSize:13, fontWeight:600,
                cursor: posting ? "not-allowed" : "pointer", fontFamily:"inherit", opacity:posting?0.6:1,
              }}
              onMouseEnter={(e) => { if (!posting) e.currentTarget.style.background="#5b52e0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background="#6c63ff"; }}
            >
              {posting ? "Posting…" : "Save"}
            </button>
          )}
        </div>
      </form>

      {/* ── Divider ── */}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ flex:1, height:1, background:"var(--border)" }} />
        <span style={{ fontSize:10, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.5px", whiteSpace:"nowrap" }}>
          Activity · {feed.length}
        </span>
        <div style={{ flex:1, height:1, background:"var(--border)" }} />
      </div>

      {/* ── Feed (newest first) ── */}
      {loading ? (
        <p style={{ color:"var(--text-muted)", fontSize:12, textAlign:"center" }}>Loading…</p>
      ) : feed.length === 0 ? (
        <p style={{ color:"var(--text-muted)", fontSize:12, fontStyle:"italic", textAlign:"center" }}>No activity yet.</p>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {visibleFeed.map((item) =>
            item._type === "comment" ? (
              <CommentItem
                key={`c-${item.id}`}
                comment={item}
                currentUserId={user?.id}
                onUpdate={handleUpdateComment}
                onDelete={handleDeleteComment}
                onReply={handleReply}
                onUpdateReply={handleUpdateReply}
                onDeleteReply={handleDeleteReply}
                members={members}
              />
            ) : (
              <ActivityLine key={`a-${item.id}`} log={item} />
            )
          )}

          {feed.length > COLLAPSE_THRESHOLD && (
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{
                background:"none", border:"none", color:"var(--text-secondary)", fontSize:12,
                cursor:"pointer", fontFamily:"inherit", textAlign:"center", padding:"4px 0",
              }}
              onMouseEnter={(e) => e.currentTarget.style.color="var(--text-primary)"}
              onMouseLeave={(e) => e.currentTarget.style.color="var(--text-secondary)"}
            >
              {expanded ? "Show less" : `Show ${feed.length - COLLAPSE_THRESHOLD} more…`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
