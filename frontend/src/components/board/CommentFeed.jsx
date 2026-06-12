import { useState, useEffect, useCallback, useRef } from "react";
import { getComments, createComment, updateComment, deleteComment, createReply, updateReply, deleteReply } from "../../api/comments";
import { getCardActivity } from "../../api/activity";
import { relativeTime } from "../../utils/dates";
import useAuthStore from "../../stores/authStore";

function Avatar({ name, color, size = "sm" }) {
  const dim = size === "sm" ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs";
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}
      style={{ backgroundColor: color || "#0f9e8e" }}
    >
      {(name || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

function MentionTextarea({ value, onChange, placeholder, rows = 3, className = "" }) {
  const textareaRef = useRef(null);

  const handleKey = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.target.form?.requestSubmit?.();
    }
  };

  return (
    <textarea
      ref={textareaRef}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKey}
      placeholder={placeholder}
      className={`w-full bg-white/8 border border-white/15 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-[#0f9e8e] placeholder-white/25 ${className}`}
    />
  );
}

function ReplyItem({ reply, currentUserId, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.body || "");
  const [saving, setSaving] = useState(false);

  if (reply.is_deleted) {
    return (
      <div className="flex items-start gap-2 ml-8 mt-1">
        <Avatar name={reply.user?.full_name} color={reply.user?.initials_color} />
        <p className="text-white/20 text-xs italic mt-0.5">This reply was deleted.</p>
      </div>
    );
  }

  const save = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const res = await onUpdate(reply.id, draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-2 ml-8 mt-2 group">
      <Avatar name={reply.user?.full_name} color={reply.user?.initials_color} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-white/80 text-xs font-medium">{reply.user?.full_name}</span>
          <span className="text-white/25 text-[10px]">{relativeTime(reply.created_at)}</span>
        </div>
        {editing ? (
          <div className="mt-1 space-y-1.5">
            <MentionTextarea value={draft} onChange={setDraft} rows={2} />
            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="px-3 py-1 bg-[#0f9e8e] text-white rounded text-xs hover:bg-[#0b8b7f] disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditing(false)} className="text-white/40 hover:text-white text-xs">Cancel</button>
            </div>
          </div>
        ) : (
          <p className="text-white/70 text-xs mt-0.5 leading-relaxed whitespace-pre-wrap">{reply.body}</p>
        )}
        {currentUserId === reply.user_id && !editing && (
          <div className="flex gap-2 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => { setDraft(reply.body); setEditing(true); }} className="text-white/30 hover:text-white text-[10px]">Edit</button>
            <button onClick={() => onDelete(reply.id)} className="text-white/30 hover:text-red-400 text-[10px]">Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentItem({ comment, currentUserId, onDelete, onUpdate, onReply, onUpdateReply, onDeleteReply }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body || "");
  const [saving, setSaving] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [postingReply, setPostingReply] = useState(false);

  const save = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await onUpdate(comment.id, draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const submitReply = async (e) => {
    e.preventDefault();
    if (!replyDraft.trim()) return;
    setPostingReply(true);
    try {
      await onReply(comment.id, replyDraft.trim());
      setReplyDraft("");
      setShowReply(false);
    } finally {
      setPostingReply(false);
    }
  };

  if (comment.is_deleted) {
    return (
      <div className="flex items-start gap-2.5">
        <Avatar name={comment.user?.full_name} color={comment.user?.initials_color} size="md" />
        <div className="flex-1">
          <p className="text-white/20 text-xs italic mt-1">This comment was deleted.</p>
          {comment.replies?.length > 0 && (
            <div className="mt-2 space-y-1 border-l border-white/10 pl-3">
              {comment.replies.map((r) => (
                <ReplyItem
                  key={r.id} reply={r} currentUserId={currentUserId}
                  onDelete={onDeleteReply} onUpdate={onUpdateReply}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 group">
      <Avatar name={comment.user?.full_name} color={comment.user?.initials_color} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-white/90 text-xs font-semibold">{comment.user?.full_name}</span>
          <span className="text-white/25 text-[10px]">{relativeTime(comment.created_at)}</span>
          {comment.updated_at !== comment.created_at && (
            <span className="text-white/20 text-[10px]">(edited)</span>
          )}
        </div>

        {editing ? (
          <div className="mt-1.5 space-y-1.5">
            <MentionTextarea value={draft} onChange={setDraft} rows={3} />
            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="px-3 py-1 bg-[#0f9e8e] text-white rounded text-xs hover:bg-[#0b8b7f] disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditing(false)} className="text-white/40 hover:text-white text-xs">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="mt-0.5 bg-white/5 rounded-lg px-3 py-2">
            <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{comment.body}</p>
          </div>
        )}

        {!editing && (
          <div className="flex items-center gap-3 mt-1">
            <button onClick={() => setShowReply((v) => !v)} className="text-white/30 hover:text-white text-[10px] transition-colors">
              Reply
            </button>
            {currentUserId === comment.user_id && (
              <>
                <button onClick={() => { setDraft(comment.body); setEditing(true); }} className="text-white/30 hover:text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
                  Edit
                </button>
                <button onClick={() => onDelete(comment.id)} className="text-white/30 hover:text-red-400 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
                  Delete
                </button>
              </>
            )}
          </div>
        )}

        {/* Replies */}
        {comment.replies?.length > 0 && (
          <div className="mt-2 space-y-1 border-l border-white/10 pl-3">
            {comment.replies.map((r) => (
              <ReplyItem
                key={r.id} reply={r} currentUserId={currentUserId}
                onDelete={onDeleteReply} onUpdate={onUpdateReply}
              />
            ))}
          </div>
        )}

        {/* Reply input */}
        {showReply && (
          <form onSubmit={submitReply} className="mt-2 ml-8 space-y-1.5">
            <MentionTextarea
              value={replyDraft}
              onChange={setReplyDraft}
              rows={2}
              placeholder="Write a reply… (Ctrl+Enter to submit)"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={postingReply || !replyDraft.trim()} className="px-3 py-1 bg-[#0f9e8e] text-white rounded text-xs hover:bg-[#0b8b7f] disabled:opacity-50">
                {postingReply ? "Posting…" : "Reply"}
              </button>
              <button type="button" onClick={() => { setShowReply(false); setReplyDraft(""); }} className="text-white/40 hover:text-white text-xs">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ActivityLine({ log }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Avatar name={log.user_full_name} color={log.user_initials_color} />
      <p className="text-white/35 text-xs">
        <span className="text-white/55 font-medium">{log.user_full_name}</span>
        {" "}{log.action.replace(/\./g, " ")}
      </p>
      <span className="text-white/20 text-[10px] ml-auto shrink-0">{relativeTime(log.created_at)}</span>
    </div>
  );
}

export default function CommentFeed({ cardId, boardId }) {
  const { user } = useAuthStore();
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [newBody, setNewBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [commRes, actRes] = await Promise.all([
      getComments(cardId),
      getCardActivity(cardId),
    ]);
    setComments(commRes.data || []);
    setActivity(actRes.data || []);
    setLoading(false);
  }, [cardId]);

  useEffect(() => { load(); }, [load]);

  // Build interleaved feed sorted ascending by created_at
  const feed = [
    ...(comments || []).map((c) => ({ ...c, _type: "comment" })),
    ...(activity || []).map((a) => ({ ...a, _type: "activity" })),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const post = async (e) => {
    e.preventDefault();
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

  const handleUpdateComment = async (commentId, body) => {
    await updateComment(commentId, { body });
    load();
  };

  const handleDeleteComment = async (commentId) => {
    if (!confirm("Delete this comment?")) return;
    await deleteComment(commentId);
    load();
  };

  const handleReply = async (commentId, body) => {
    await createReply(commentId, { body });
    load();
  };

  const handleUpdateReply = async (replyId, body) => {
    await updateReply(replyId, { body });
    load();
  };

  const handleDeleteReply = async (replyId) => {
    if (!confirm("Delete this reply?")) return;
    await deleteReply(replyId);
    load();
  };

  return (
    <div>
      <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wide mb-3">Activity</p>

      {/* Feed */}
      {loading ? (
        <p className="text-white/20 text-xs">Loading…</p>
      ) : (
        <div className="space-y-4 mb-4">
          {feed.length === 0 && (
            <p className="text-white/20 text-xs italic">No activity yet.</p>
          )}
          {feed.map((item) =>
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
              />
            ) : (
              <ActivityLine key={`a-${item.id}`} log={item} />
            )
          )}
        </div>
      )}

      {/* New comment input */}
      <form onSubmit={post} className="flex items-start gap-2.5">
        <Avatar name={user?.full_name} color={user?.initials_color} size="md" />
        <div className="flex-1 space-y-2">
          <MentionTextarea
            value={newBody}
            onChange={setNewBody}
            rows={3}
            placeholder="Write a comment… Use @name to mention someone. (Ctrl+Enter to submit)"
          />
          {newBody.trim() && (
            <button
              type="submit"
              disabled={posting}
              className="px-4 py-1.5 bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {posting ? "Posting…" : "Save"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
