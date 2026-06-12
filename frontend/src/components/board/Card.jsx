import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { isOverdue, formatDueDate } from "../../utils/dates";
import useAuthStore from "../../stores/authStore";

const PRIORITY_COLORS = {
  urgent: "#de350b",
  high: "#ff991f",
  normal: "#0079bf",
  low: "#8993a4",
};

const SEVERITY_COLORS = {
  critical: "#de350b",
  high: "#ff991f",
  medium: "#f2d600",
  low: "#61bd4f",
};

function PriorityFlag({ priority }) {
  if (!priority || priority === "normal") return null;
  return (
    <div
      className="w-2.5 h-2.5 rounded-full shrink-0"
      style={{ backgroundColor: PRIORITY_COLORS[priority] }}
      title={`Priority: ${priority}`}
    />
  );
}

function SeverityBadge({ severity }) {
  if (!severity) return null;
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-semibold text-[#0d1f1d]"
      style={{ backgroundColor: SEVERITY_COLORS[severity] }}
    >
      {severity}
    </span>
  );
}

function AssigneeAvatars({ assignees }) {
  if (!assignees?.length) return null;
  const shown = assignees.slice(0, 3);
  const rest = assignees.length - shown.length;
  return (
    <div className="flex -space-x-1.5">
      {shown.map((a) => (
        <div
          key={a.user_id}
          className="w-5 h-5 rounded-full border border-[#1e2435] flex items-center justify-center text-[9px] font-semibold text-white shrink-0"
          style={{ backgroundColor: a.initials_color || "#0f9e8e" }}
          title={a.full_name}
        >
          {a.full_name.slice(0, 2).toUpperCase()}
        </div>
      ))}
      {rest > 0 && (
        <div className="w-5 h-5 rounded-full border border-[#1e2435] bg-white/20 flex items-center justify-center text-[9px] text-white">
          +{rest}
        </div>
      )}
    </div>
  );
}

function LabelStrips({ labels }) {
  if (!labels?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mb-1.5">
      {labels.map((l) => (
        <div
          key={l.id}
          className="h-2 rounded-full min-w-[32px] flex-shrink-0"
          style={{ backgroundColor: l.color, width: l.name ? "auto" : "32px" }}
          title={l.name || ""}
        />
      ))}
    </div>
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
  if (elapsed >= total) return 'breached';
  const remaining = (total - elapsed) / total;
  if (remaining <= 0.2) return 'warning';
  return null;
}

export default function Card({ card, listId, onClick, isDragOverlay = false, isSelected = false, onToggleSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: card.id,
      data: { type: "card", card, listId },
      disabled: isDragOverlay,
    });

  const { user } = useAuthStore();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const overdue = isOverdue(card.due_date);
  const dueLabel = formatDueDate(card.due_date);
  const slaStatus = getSLAStatus(card);

  // @mention detection — check if current user's name appears after '@' in description
  const isMentioned = user?.full_name && card.description
    ? card.description.toLowerCase().includes(`@${user.full_name.split(" ")[0].toLowerCase()}`)
    : false;

  const handleClick = (e) => {
    if (e.shiftKey) {
      e.stopPropagation();
      onToggleSelect?.(card.id);
      return;
    }
    onClick?.(card);
  };

  return (
    <div
      ref={!isDragOverlay ? setNodeRef : undefined}
      style={!isDragOverlay ? style : undefined}
      {...(!isDragOverlay ? attributes : {})}
      className={`group relative rounded-lg bg-[#252b3b] border select-none cursor-pointer
        ${overdue ? "border-l-4 border-l-red-500 border-t-white/10 border-r-white/10 border-b-white/10" : "border-white/10"}
        ${isSelected ? "ring-2 ring-[#0f9e8e]" : ""}
        ${isDragOverlay ? "shadow-2xl ring-2 ring-[#0f9e8e] rotate-1" : "hover:border-white/25 hover:bg-[#2a3147]"}
        transition-colors`}
      onClick={handleClick}
    >
      {/* Cover image */}
      {card.cover_image_url && (
        <img
          src={card.cover_image_url}
          alt=""
          className="w-full h-20 object-cover rounded-t-lg"
          draggable={false}
        />
      )}

      <div className="p-2.5">
        {/* Label strips */}
        <LabelStrips labels={card.labels} />

        {/* Title row */}
        <div className="flex items-start gap-1.5 mb-2">
          <p className="text-white text-xs leading-snug flex-1 min-w-0">{card.title}</p>
          <PriorityFlag priority={card.priority} />
        </div>

        {/* Bottom row: severity, due date, assignees */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <SeverityBadge severity={card.severity} />

          {card.source === "client" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">
              client
            </span>
          )}

          {dueLabel && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 ${
                overdue
                  ? "bg-red-500/20 text-red-400"
                  : "bg-white/10 text-white/50"
              }`}
            >
              📅 {dueLabel}
            </span>
          )}

          {slaStatus && (
            <span
              title={slaStatus === 'breached' ? 'SLA breached' : 'SLA deadline approaching'}
              style={{ color: slaStatus === 'breached' ? '#de350b' : '#ff991f' }}
              className="text-xs leading-none"
            >
              ⏱
            </span>
          )}

          {isMentioned && (
            <span
              className="text-[10px] px-1 py-0.5 rounded bg-[#0f9e8e]/25 text-[#a09be8] font-semibold"
              title="You are mentioned in this card"
            >
              @
            </span>
          )}

          <div className="flex-1" />

          {card.is_recurring && (
            <span className="text-[10px] text-white/30 leading-none" title="Recurring card">🔄</span>
          )}

          {card.watcher_count > 0 && (
            <span
              className={`flex items-center gap-0.5 text-[10px] leading-none ${card.is_watching ? "text-[#0f9e8e]" : "text-white/30"}`}
              title={`${card.watcher_count} watcher${card.watcher_count !== 1 ? "s" : ""}`}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              {card.watcher_count}
            </span>
          )}

          <AssigneeAvatars assignees={card.assignees} />
        </div>
      </div>

      {/* Select checkbox — visible on hover or when selected */}
      {!isDragOverlay && onToggleSelect && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(card.id); }}
          aria-label="Select card"
          className={`absolute top-1.5 left-1.5 w-4 h-4 rounded border flex items-center justify-center transition-all ${
            isSelected
              ? "opacity-100 bg-[#0f9e8e] border-[#0f9e8e]"
              : "opacity-0 group-hover:opacity-60 bg-transparent border-white/40"
          }`}
        >
          {isSelected && (
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2">
              <polyline points="2 6 5 9 10 3" />
            </svg>
          )}
        </button>
      )}

      {/* Drag handle — visible on hover */}
      {!isDragOverlay && (
        <button
          {...listeners}
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-white/30 hover:text-white/70 transition-opacity p-0.5 rounded cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag card"
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="3" cy="2" r="1.2" /><circle cx="9" cy="2" r="1.2" />
            <circle cx="3" cy="6" r="1.2" /><circle cx="9" cy="6" r="1.2" />
            <circle cx="3" cy="10" r="1.2" /><circle cx="9" cy="10" r="1.2" />
          </svg>
        </button>
      )}
    </div>
  );
}
