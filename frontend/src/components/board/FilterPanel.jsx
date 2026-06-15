import { useState, useEffect, useRef } from "react";
import { getBoardMembers } from "../../api/boards";
import { getLabels } from "../../api/labels";

const PRIORITY_COLORS = {
  urgent: "#de350b",
  high:   "#ff991f",
  normal: "#0079bf",
  low:    "#8993a4",
};

const SEVERITY_COLORS = {
  critical: "#de350b",
  high:     "#ff991f",
  medium:   "#f2d600",
  low:      "#61bd4f",
};

function SectionLabel({ children }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.6px", color: "var(--text-muted)",
      marginBottom: 8, marginTop: 0,
    }}>
      {children}
    </p>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
    </div>
  );
}

function Chip({ active, onClick, color, children }) {
  const base = {
    display: "inline-flex", alignItems: "center",
    padding: "4px 12px", borderRadius: 20,
    fontSize: 12, fontWeight: 500,
    cursor: "pointer", border: "1.5px solid",
    transition: "all .15s", fontFamily: "inherit",
    lineHeight: 1.4,
  };

  const inactive = {
    ...base,
    borderColor: "var(--border)",
    background: "transparent",
    color: "var(--text-secondary)",
  };

  const activeStyle = color
    ? { ...base, borderColor: color, background: color + "18", color: color }
    : { ...base, borderColor: "#6c63ff", background: "#6c63ff18", color: "#6c63ff" };

  return (
    <button
      onClick={onClick}
      style={active ? activeStyle : inactive}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = color || "#6c63ff";
          e.currentTarget.style.color = color || "#6c63ff";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.color = "var(--text-secondary)";
        }
      }}
    >
      {children}
    </button>
  );
}

function MemberChip({ active, onClick, member }) {
  const initials = member.full_name
    ? member.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const base = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "4px 10px 4px 4px", borderRadius: 20,
    fontSize: 12, fontWeight: 500,
    cursor: "pointer", border: "1.5px solid",
    transition: "all .15s", fontFamily: "inherit",
  };

  return (
    <button
      onClick={onClick}
      title={member.full_name}
      style={active
        ? { ...base, borderColor: "#6c63ff", background: "#6c63ff18", color: "#6c63ff" }
        : { ...base, borderColor: "var(--border)", background: "transparent", color: "var(--text-secondary)" }
      }
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = "#6c63ff";
          e.currentTarget.style.color = "#6c63ff";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.color = "var(--text-secondary)";
        }
      }}
    >
      <span style={{
        width: 20, height: 20, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0,
        backgroundColor: member.initials_color || "#6c63ff",
      }}>
        {initials}
      </span>
      <span style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {member.full_name}
      </span>
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
    setFilters({ priority: [], severity: [], source: [], assignees: [], labels: [], dueDate: [], lists: [] });

  const activeCount = Object.values(filters).reduce((n, arr) => n + arr.length, 0);

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute", top: "calc(100% + 6px)", left: 0,
        zIndex: 1200, width: 288,
        background: "var(--modal-bg, #fff)",
        border: "1px solid var(--border, #dfe1e6)",
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(9,30,66,.16)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
      }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Filter cards
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {activeCount > 0 && (
            <button
              onClick={clearAll}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 11, fontWeight: 600, color: "#6c63ff",
                fontFamily: "inherit", padding: 0,
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = "#5b52e0"}
              onMouseLeave={(e) => e.currentTarget.style.color = "#6c63ff"}
            >
              Clear all ({activeCount})
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 16, lineHeight: 1, color: "var(--text-muted)",
              fontFamily: "inherit", padding: 0,
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--text-primary)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
          >
            ×
          </button>
        </div>
      </div>

      {/* Filter groups */}
      <div style={{ padding: "14px 14px 16px", display: "flex", flexDirection: "column", gap: 16, maxHeight: 420, overflowY: "auto" }}>

        {/* Priority */}
        <FilterGroup label="Priority">
          {["urgent", "high", "normal", "low"].map((p) => (
            <Chip key={p} active={filters.priority.includes(p)} onClick={() => toggle("priority", p)} color={PRIORITY_COLORS[p]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Chip>
          ))}
        </FilterGroup>

        {/* Severity */}
        <FilterGroup label="Severity">
          {["critical", "high", "medium", "low"].map((s) => (
            <Chip key={s} active={filters.severity.includes(s)} onClick={() => toggle("severity", s)} color={SEVERITY_COLORS[s]}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Chip>
          ))}
        </FilterGroup>

        {/* Source */}
        <FilterGroup label="Source">
          {["internal", "client"].map((src) => (
            <Chip key={src} active={filters.source.includes(src)} onClick={() => toggle("source", src)}>
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
              <Chip key={l.id} active={filters.labels.includes(l.id)} onClick={() => toggle("labels", l.id)} color={l.color}>
                {l.name}
              </Chip>
            ))}
          </FilterGroup>
        )}

        {/* Due date */}
        <FilterGroup label="Due Date">
          {[
            ["overdue",   "Overdue"],
            ["this_week", "Due this week"],
            ["no_date",   "No due date"],
          ].map(([val, label]) => (
            <Chip key={val} active={filters.dueDate.includes(val)} onClick={() => toggle("dueDate", val)}>
              {label}
            </Chip>
          ))}
        </FilterGroup>

        {/* Column / List */}
        {lists.length > 0 && (
          <FilterGroup label="Column">
            {lists.map((l) => (
              <Chip key={l.id} active={filters.lists.includes(l.id)} onClick={() => toggle("lists", l.id)}>
                {l.name}
              </Chip>
            ))}
          </FilterGroup>
        )}
      </div>
    </div>
  );
}
