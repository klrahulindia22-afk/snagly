import { useState, useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { isOverdue, formatCardDate } from "../../utils/dates";
import useAuthStore from "../../stores/authStore";
import { mediaUrl } from "../../api/client";
import { archiveCard, duplicateCard, moveCard } from "../../api/cards";

const PRIORITY_COLORS = {
  urgent: "#de350b",
  high:   "#ff991f",
  normal: "#0079bf",
  low:    "#8993a4",
};

function LabelPills({ labels }) {
  if (!labels?.length) return null;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:8 }}>
      {labels.map((l) =>
        l.name ? (
          <span
            key={l.id}
            style={{
              display:"inline-flex", alignItems:"center",
              height:22, borderRadius:11, padding:"0 10px",
              fontSize:11, fontWeight:700, color:"#fff",
              background: l.color || "#8993a4",
              whiteSpace:"nowrap", lineHeight:1,
            }}
            title={l.name}
          >
            {l.name}
          </span>
        ) : (
          <div
            key={l.id}
            style={{ height:8, borderRadius:4, minWidth:40, background:l.color, flexShrink:0 }}
          />
        )
      )}
    </div>
  );
}

function CompletionDot({ done }) {
  if (!done) return null;
  return (
    <span
      style={{
        display:"inline-flex", alignItems:"center", justifyContent:"center",
        width:18, height:18, borderRadius:"50%",
        background:"#36b37e", flexShrink:0, marginRight:6,
      }}
      title="Completed"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5">
        <polyline points="2 6 5 9 10 3" />
      </svg>
    </span>
  );
}

function DateRangeBadge({ startDate, dueDate, overdue }) {
  const start = formatCardDate(startDate);
  const end   = formatCardDate(dueDate);
  if (!start && !end) return null;

  const label = start && end ? `${start} - ${end}` : start || end;

  return (
    <span
      style={{
        display:"inline-flex", alignItems:"center", gap:4,
        padding:"3px 8px", borderRadius:20,
        background: overdue ? "#ffebe6" : "var(--input-bg, #f4f5f7)",
        fontSize:11, fontWeight:500,
        color: overdue ? "#de350b" : "var(--text-secondary, #5e6c84)",
        whiteSpace:"nowrap", maxWidth:160,
        overflow:"hidden", textOverflow:"ellipsis",
      }}
      title={label}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      {label}
    </span>
  );
}

function getSLAStatus(card) {
  if (!card.due_date || !card.created_at || !card.severity) return null;
  const now = Date.now();
  const created = new Date(card.created_at).getTime();
  const due = new Date(card.due_date).getTime();
  const total = due - created;
  if (total <= 0) return null;
  const elapsed = now - created;
  if (elapsed >= total) return "breached";
  if ((total - elapsed) / total <= 0.2) return "warning";
  return null;
}

const CHIP = {
  display:"inline-flex", alignItems:"center", gap:3,
  fontSize:11, color:"var(--text-secondary)",
  padding:"2px 6px", borderRadius:10,
  background:"var(--input-bg, #f4f5f7)",
};

/* ── Context menu ─────────────────────────────────────────────────────── */

function MenuItem({ icon, label, onClick, danger, disabled }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "7px 12px", border: "none", cursor: disabled ? "not-allowed" : "pointer",
        background: hovered && !disabled ? (danger ? "rgba(222,53,11,.08)" : "var(--input-bg)") : "none",
        color: disabled ? "var(--text-muted)" : danger ? "#de350b" : "var(--text-primary)",
        fontSize: 13, fontFamily: "inherit", textAlign: "left", borderRadius: 4,
        opacity: disabled ? 0.5 : 1,
        transition: "background .1s",
      }}
    >
      <span style={{ width: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: .75 }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />;
}

function CardContextMenu({ card, x, y, lists, boardId, onClose, onOpenCard, onRefreshCard, onArchived, onDuplicated }) {
  const menuRef = useRef(null);
  const [movingOpen, setMovingOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Clamp position so menu never goes off screen
  const menuW = 220;
  const menuH = 340;
  const clampedX = Math.min(x, window.innerWidth - menuW - 8);
  const clampedY = Math.min(y, window.innerHeight - menuH - 8);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const keyHandler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  const handleOpenCard = () => { onClose(); onOpenCard(card); };

  const handleOpenPanel = (panel) => {
    onClose();
    onOpenCard(card, panel);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?openCard=${card.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(onClose, 900);
    });
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await archiveCard(card.id);
      onClose();
      onArchived(card.id, card.title);
    } catch { setArchiving(false); }
  };

  const handleDuplicate = async () => {
    setCopying(true);
    try {
      const res = await duplicateCard(card.id);
      onClose();
      onDuplicated(res.data);
    } catch { setCopying(false); }
  };

  const handleMove = async (targetListId) => {
    if (targetListId === card.list_id) { onClose(); return; }
    setMoving(true);
    try {
      await moveCard(card.id, targetListId, 1);
      onClose();
      onArchived(card.id, null); // remove from current list (reuse archived handler = remove from board)
      onRefreshCard?.();
    } catch { setMoving(false); }
  };

  const otherLists = lists.filter((l) => l.id !== card.list_id);

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: clampedY,
        left: clampedX,
        zIndex: 9000,
        width: menuW,
        background: "var(--modal-bg)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,.28)",
        padding: "4px",
        userSelect: "none",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Card title hint */}
      <div style={{ padding: "6px 12px 4px", fontSize: 11, color: "var(--text-muted)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {card.title}
      </div>
      <Divider />

      <MenuItem
        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>}
        label="Open card"
        onClick={handleOpenCard}
      />
      <MenuItem
        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>}
        label="Edit labels"
        onClick={() => handleOpenPanel("labels")}
      />
      <MenuItem
        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>}
        label="Change members"
        onClick={() => handleOpenPanel("members")}
      />
      <MenuItem
        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>}
        label="Change cover"
        onClick={() => handleOpenPanel("attach")}
      />
      <MenuItem
        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
        label="Edit dates"
        onClick={() => handleOpenPanel("dates")}
      />

      <Divider />

      {/* Move */}
      <div style={{ position: "relative" }}>
        <MenuItem
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>}
          label={moving ? "Moving…" : "Move"}
          disabled={moving}
          onClick={() => setMovingOpen((v) => !v)}
        />
        {movingOpen && otherLists.length > 0 && (
          <div style={{
            position: "absolute", left: "100%", top: 0, marginLeft: 4,
            width: 200, background: "var(--modal-bg)", border: "1px solid var(--border)",
            borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.22)",
            padding: "4px", maxHeight: 220, overflowY: "auto",
          }}>
            <div style={{ padding: "4px 8px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>Move to list</div>
            {otherLists.map((l) => (
              <button
                key={l.id}
                onClick={() => handleMove(l.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", border: "none", cursor: "pointer",
                  background: "none", color: "var(--text-primary)", fontSize: 12,
                  fontFamily: "inherit", textAlign: "left", borderRadius: 4,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
              >
                {l.color && <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, flexShrink: 0 }} />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <MenuItem
        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>}
        label={copying ? "Copying…" : "Copy card"}
        disabled={copying}
        onClick={handleDuplicate}
      />
      <MenuItem
        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>}
        label={copied ? "Copied!" : "Copy link"}
        onClick={handleCopyLink}
      />

      <Divider />

      <MenuItem
        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>}
        label={archiving ? "Archiving…" : "Archive"}
        disabled={archiving}
        danger
        onClick={handleArchive}
      />
    </div>
  );
}

/* ── Card ─────────────────────────────────────────────────────────────── */

export default function Card({
  card, listId, onClick, isDragOverlay = false,
  isSelected = false, onToggleSelect,
  lists = [], boardId,
  onCardArchived, onCardDuplicated, onCardMoved,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: card.id,
      data: { type: "card", card, listId },
      disabled: isDragOverlay,
    });

  const { user } = useAuthStore();

  const [ctxMenu, setCtxMenu] = useState(null); // { x, y }

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const overdue   = isOverdue(card.due_date);
  const slaStatus = getSLAStatus(card);

  const isMentioned =
    user?.full_name && card.description
      ? card.description.toLowerCase().includes(`@${user.full_name.split(" ")[0].toLowerCase()}`)
      : false;

  const hasDate = card.start_date || card.due_date;
  const hasFooterItems =
    (card.priority && card.priority !== "normal") ||
    hasDate ||
    (card.checklist_total ?? 0) > 0 ||
    (card.attachment_count ?? 0) > 0 ||
    (card.comment_count ?? 0) > 0 ||
    slaStatus ||
    isMentioned ||
    card.source === "client" ||
    (card.watcher_count ?? 0) > 0 ||
    card.is_recurring ||
    card.assignees?.length > 0;

  const handleClick = (e) => {
    if (e.shiftKey) { e.stopPropagation(); onToggleSelect?.(card.id); return; }
    onClick?.(card);
  };

  const handleContextMenu = (e) => {
    if (isDragOverlay) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        ref={!isDragOverlay ? setNodeRef : undefined}
        {...(!isDragOverlay ? attributes : {})}
        {...(!isDragOverlay ? listeners : {})}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`group card-item relative overflow-hidden cursor-grab active:cursor-grabbing select-none transition-all touch-none
          ${isDragOverlay ? "shadow-2xl ring-2 ring-[#6c63ff] rotate-1" : "hover:-translate-y-px"}
          ${isSelected ? "ring-2 ring-[#6c63ff]" : ""}
          ${isDragging ? "opacity-0" : ""}`}
        style={{
          ...(!isDragOverlay ? dndStyle : {}),
          borderRadius: 8,
          background: "var(--card-bg)",
          boxShadow: isDragOverlay
            ? undefined
            : "0 1px 3px rgba(9,30,66,.12), 0 0 0 1px rgba(9,30,66,.06)",
          marginBottom: isDragOverlay ? 0 : 8,
        }}
      >
        {/* Cover image */}
        {card.cover_image_url && (
          <img
            src={mediaUrl(card.cover_image_url)}
            alt=""
            style={{ width:"100%", height:80, objectFit:"cover", display:"block", borderRadius:"8px 8px 0 0" }}
            draggable={false}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        )}

        <div style={{ padding:"10px 12px 12px", paddingLeft: (!isDragOverlay && onToggleSelect) ? 28 : 12, paddingRight: !isDragOverlay ? 26 : 12 }}>

          {/* Labels */}
          <LabelPills labels={card.labels} />

          {/* Title row */}
          <div style={{ display:"flex", alignItems:"flex-start", marginBottom: hasFooterItems ? 10 : 0 }}>
            <CompletionDot done={card.is_complete} />
            <p
              style={{
                fontSize:13, fontWeight:500, color:"var(--text-primary)",
                lineHeight:1.45, wordBreak:"break-word", flex:1,
                textDecoration: card.is_complete ? "line-through" : "none",
                opacity: card.is_complete ? 0.65 : 1,
              }}
            >
              {card.title}
            </p>
          </div>

          {/* Footer */}
          {hasFooterItems && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>

              {/* Left: chips (wrapping) */}
              <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", flex:1, minWidth:0 }}>

                {/* Priority flag */}
                {card.priority && card.priority !== "normal" && (
                  <span
                    style={{
                      display:"inline-flex", alignItems:"center", gap:3,
                      padding:"2px 8px", borderRadius:10, fontSize:11, fontWeight:600,
                      background: PRIORITY_COLORS[card.priority] + "22",
                      color: PRIORITY_COLORS[card.priority],
                    }}
                    title={`Priority: ${card.priority}`}
                  >
                    <svg width="7" height="10" viewBox="0 0 7 10" fill="currentColor">
                      <polygon points="0,0 7,0 7,7 3.5,5 0,7" />
                    </svg>
                    {card.priority}
                  </span>
                )}

                {/* Date range */}
                {hasDate && (
                  <DateRangeBadge
                    startDate={card.start_date}
                    dueDate={card.due_date}
                    overdue={overdue}
                  />
                )}

                {/* Checklist */}
                {(card.checklist_total ?? 0) > 0 && (
                  <span style={CHIP}>
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="1" y="1" width="10" height="10" rx="2"/>
                      <polyline points="3 6 5 8 9 4"/>
                    </svg>
                    {card.checklist_done ?? 0}/{card.checklist_total}
                  </span>
                )}

                {/* Attachments */}
                {(card.attachment_count ?? 0) > 0 && (
                  <span style={CHIP}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                    </svg>
                    {card.attachment_count}
                  </span>
                )}

                {/* Comments */}
                {(card.comment_count ?? 0) > 0 && (
                  <span style={CHIP}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                    {card.comment_count}
                  </span>
                )}

                {/* SLA */}
                {slaStatus && (
                  <span
                    title={slaStatus === "breached" ? "SLA breached" : "SLA approaching"}
                    style={{ ...CHIP, color: slaStatus === "breached" ? "#de350b" : "#ff991f", background: slaStatus === "breached" ? "#ffebe6" : "#fffae6" }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    SLA
                  </span>
                )}

                {/* @mention */}
                {isMentioned && (
                  <span style={{ ...CHIP, background:"#e4f0fc", color:"#0052cc", fontWeight:700 }} title="You are mentioned">@</span>
                )}

                {/* Client source */}
                {card.source === "client" && (
                  <span style={{ ...CHIP, background:"#f3e8ff", color:"#7c3aed", fontWeight:600 }}>client</span>
                )}

                {/* Watchers */}
                {(card.watcher_count ?? 0) > 0 && (
                  <span
                    style={{ ...CHIP, color: card.is_watching ? "#6c63ff" : "var(--text-muted)" }}
                    title={`${card.watcher_count} watcher${card.watcher_count !== 1 ? "s" : ""}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    {card.watcher_count}
                  </span>
                )}

                {/* Recurring */}
                {card.is_recurring && (
                  <span style={CHIP} title="Recurring">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="17 1 21 5 17 9"/>
                      <path d="M3 11V9a4 4 0 014-4h14"/>
                      <polyline points="7 23 3 19 7 15"/>
                      <path d="M21 13v2a4 4 0 01-4 4H3"/>
                    </svg>
                  </span>
                )}
              </div>

              {/* Right: assignee avatars — always pinned to the right */}
              {card.assignees?.length > 0 && (
                <div style={{ display:"flex", alignItems:"center", flexShrink:0 }}>
                  {card.assignees.slice(0, 3).map((a, i) => (
                    <div
                      key={a.user_id}
                      style={{
                        width:22, height:22, borderRadius:"50%",
                        background: a.initials_color || "#6c63ff",
                        color:"#fff", fontSize:9, fontWeight:700,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        marginLeft: i === 0 ? 0 : -7,
                        border:"2px solid var(--card-bg)", flexShrink:0,
                        boxShadow:"0 0 0 1px rgba(9,30,66,.08)",
                      }}
                      title={a.full_name}
                    >
                      {a.full_name.slice(0, 2).toUpperCase()}
                    </div>
                  ))}
                  {card.assignees.length > 3 && (
                    <div
                      style={{
                        width:22, height:22, borderRadius:"50%",
                        background:"var(--input-bg)", color:"var(--text-secondary)", fontSize:9, fontWeight:700,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        marginLeft:-7, border:"2px solid var(--card-bg)", flexShrink:0,
                      }}
                    >
                      +{card.assignees.length - 3}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Select checkbox */}
        {!isDragOverlay && onToggleSelect && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect(card.id); }}
            aria-label="Select card"
            className={`absolute top-2 left-2 w-4 h-4 flex items-center justify-center transition-all ${
              isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-70"
            }`}
            style={{
              borderRadius: 4,
              border: isSelected ? "none" : "2px solid var(--border)",
              background: isSelected ? "#6c63ff" : "var(--card-bg)",
              padding:0, cursor:"pointer",
            }}
          >
            {isSelected && (
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2">
                <polyline points="2 6 5 9 10 3" />
              </svg>
            )}
          </button>
        )}

        {/* Drag handle indicator */}
        {!isDragOverlay && (
          <div
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color:"#c1c7d0", pointerEvents:"none" }}
            aria-hidden="true"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
              <circle cx="3" cy="2" r="1.2"/><circle cx="9" cy="2" r="1.2"/>
              <circle cx="3" cy="6" r="1.2"/><circle cx="9" cy="6" r="1.2"/>
              <circle cx="3" cy="10" r="1.2"/><circle cx="9" cy="10" r="1.2"/>
            </svg>
          </div>
        )}
      </div>

      {/* Context menu — rendered outside card div so it's not clipped */}
      {ctxMenu && (
        <CardContextMenu
          card={{ ...card, list_id: listId }}
          x={ctxMenu.x}
          y={ctxMenu.y}
          lists={lists}
          boardId={boardId}
          onClose={() => setCtxMenu(null)}
          onOpenCard={(c, panel) => { onClick?.(c, panel); }}
          onRefreshCard={() => {}}
          onArchived={(cardId, cardTitle) => { onCardArchived?.(cardId, cardTitle); }}
          onDuplicated={(newCard) => { onCardDuplicated?.(newCard); }}
        />
      )}
    </>
  );
}
