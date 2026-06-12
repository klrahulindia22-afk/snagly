import { useState, useEffect, useRef } from "react";
import { getBoardMembers } from "../../api/boards";
import { getLabels } from "../../api/labels";

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

function FilterGroup({ label, children }) {
  return (
    <div>
      <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wide mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, color, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
        active
          ? "border-[#0f9e8e] ring-1 ring-[#0f9e8e] text-white"
          : "border-white/15 text-white/55 hover:border-white/30 hover:text-white/80"
      }`}
      style={color ? { borderColor: active ? color : undefined, backgroundColor: active ? color + "33" : undefined } : undefined}
    >
      {children}
    </button>
  );
}

function MemberChip({ active, onClick, member }) {
  const initials = member.full_name
    ? member.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";
  return (
    <button
      onClick={onClick}
      title={member.full_name}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all border ${
        active ? "border-[#0f9e8e] bg-[#0f9e8e]/20 text-white" : "border-white/15 text-white/55 hover:border-white/30"
      }`}
    >
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
        style={{ backgroundColor: member.initials_color || "#0f9e8e" }}
      >
        {initials}
      </span>
      <span className="max-w-[80px] truncate">{member.full_name}</span>
    </button>
  );
}

export default function FilterPanel({ boardId, lists, filters, setFilters, onClose }) {
  const panelRef = useRef(null);
  const [members, setMembers] = useState([]);
  const [labels, setLabels] = useState([]);

  useEffect(() => {
    getBoardMembers(boardId).then((r) => setMembers(r.data || [])).catch(() => {});
    getLabels(boardId).then((r) => setLabels(r.data || [])).catch(() => {});
  }, [boardId]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const toggle = (group, value) => {
    setFilters((prev) => {
      const arr = prev[group];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...prev, [group]: next };
    });
  };

  const clearAll = () =>
    setFilters({
      priority: [],
      severity: [],
      source: [],
      assignees: [],
      labels: [],
      dueDate: [],
      lists: [],
    });

  const activeCount = Object.values(filters).reduce((n, arr) => n + arr.length, 0);

  return (
    <div
      ref={panelRef}
      className="absolute top-full left-0 mt-1 z-50 w-72 bg-[#1e2435] border border-white/15 rounded-xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
        <h3 className="text-white text-xs font-semibold">Filter cards</h3>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              onClick={clearAll}
              className="text-[10px] text-[#0f9e8e] hover:text-white transition-colors"
            >
              Clear all ({activeCount})
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close filter panel"
            className="text-white/30 hover:text-white text-sm leading-none"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Groups */}
      <div className="p-3 space-y-4 max-h-[420px] overflow-y-auto">
        {/* Priority */}
        <FilterGroup label="Priority">
          {["urgent", "high", "normal", "low"].map((p) => (
            <Chip
              key={p}
              active={filters.priority.includes(p)}
              onClick={() => toggle("priority", p)}
              color={PRIORITY_COLORS[p]}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Chip>
          ))}
        </FilterGroup>

        {/* Severity */}
        <FilterGroup label="Severity">
          {["critical", "high", "medium", "low"].map((s) => (
            <Chip
              key={s}
              active={filters.severity.includes(s)}
              onClick={() => toggle("severity", s)}
              color={SEVERITY_COLORS[s]}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Chip>
          ))}
        </FilterGroup>

        {/* Source */}
        <FilterGroup label="Source">
          {["internal", "client"].map((src) => (
            <Chip
              key={src}
              active={filters.source.includes(src)}
              onClick={() => toggle("source", src)}
            >
              {src.charAt(0).toUpperCase() + src.slice(1)}
            </Chip>
          ))}
        </FilterGroup>

        {/* Assignees */}
        {members.length > 0 && (
          <FilterGroup label="Assignee">
            {members.map((m) => (
              <MemberChip
                key={m.user_id}
                active={filters.assignees.includes(m.user_id)}
                onClick={() => toggle("assignees", m.user_id)}
                member={m}
              />
            ))}
          </FilterGroup>
        )}

        {/* Labels */}
        {labels.length > 0 && (
          <FilterGroup label="Labels">
            {labels.map((l) => (
              <Chip
                key={l.id}
                active={filters.labels.includes(l.id)}
                onClick={() => toggle("labels", l.id)}
                color={l.color}
              >
                {l.name}
              </Chip>
            ))}
          </FilterGroup>
        )}

        {/* Due date */}
        <FilterGroup label="Due Date">
          {[
            ["overdue", "Overdue"],
            ["this_week", "Due this week"],
            ["no_date", "No due date"],
          ].map(([val, label]) => (
            <Chip
              key={val}
              active={filters.dueDate.includes(val)}
              onClick={() => toggle("dueDate", val)}
            >
              {label}
            </Chip>
          ))}
        </FilterGroup>

        {/* Column / List */}
        {lists.length > 0 && (
          <FilterGroup label="Column">
            {lists.map((l) => (
              <Chip
                key={l.id}
                active={filters.lists.includes(l.id)}
                onClick={() => toggle("lists", l.id)}
              >
                {l.name}
              </Chip>
            ))}
          </FilterGroup>
        )}
      </div>
    </div>
  );
}
