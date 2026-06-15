import { useState, useEffect } from "react";
import { getBoardMembers } from "../../api/boards";
import { addAssignee, removeAssignee } from "../../api/cards";

function MemberAvatar({ name, color, size = 28 }) {
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color || "#6c63ff",
        color: "#fff",
        fontSize: size <= 28 ? 11 : 13,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {initials}
    </div>
  );
}

export default function MembersPanel({ boardId, cardId, cardAssignees = [], onClose, onCardUpdated }) {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState({});

  useEffect(() => {
    getBoardMembers(boardId).then((r) => setMembers(r.data || []));
  }, [boardId]);

  // Build a map of assigned members by user_id for quick lookup
  const assignedMap = {};
  (cardAssignees || []).forEach((a) => {
    assignedMap[a.user_id] = a;
  });
  const assignedIds = new Set(Object.keys(assignedMap).map(Number));

  const matchesSearch = (m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.full_name?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q)
    );
  };

  // Card members = board members who are also card assignees, filtered by search
  const cardMembers = members.filter(
    (m) => assignedIds.has(m.user_id) && matchesSearch(m)
  );

  // Board members = those NOT yet assigned, filtered by search
  const boardMembers = members.filter(
    (m) => !assignedIds.has(m.user_id) && matchesSearch(m)
  );

  const toggle = async (member, isAssigned) => {
    setLoading((p) => ({ ...p, [member.user_id]: true }));
    try {
      if (isAssigned) {
        await removeAssignee(cardId, member.user_id);
      } else {
        await addAssignee(cardId, member.user_id);
      }
      onCardUpdated?.();
    } finally {
      setLoading((p) => ({ ...p, [member.user_id]: false }));
    }
  };

  const sectionLabel = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    padding: "6px 4px 4px",
  };

  return (
    <div
      style={{
        width: 264,
        background: "var(--modal-bg)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,.18)",
        padding: "12px 10px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Members</h3>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >✕</button>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search members"
        autoFocus
        style={{
          width: "100%",
          background: "var(--input-bg)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "7px 10px",
          color: "var(--text-primary)",
          fontSize: 13,
          outline: "none",
          boxSizing: "border-box",
          marginBottom: 8,
          fontFamily: "inherit",
        }}
        onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
      />

      <div style={{ maxHeight: 300, overflowY: "auto" }}>

        {/* Card members section */}
        {cardMembers.length > 0 && (
          <>
            <p style={sectionLabel}>Card members</p>
            {cardMembers.map((member) => (
              <div
                key={member.user_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "5px 6px",
                  borderRadius: 6,
                  background: "var(--input-bg-hover, #f4f5f7)",
                  marginBottom: 2,
                }}
              >
                <MemberAvatar name={member.full_name} color={member.initials_color} />
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {member.full_name}
                </span>
                <button
                  onClick={() => toggle(member, true)}
                  disabled={loading[member.user_id]}
                  title="Remove from card"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: loading[member.user_id] ? "not-allowed" : "pointer",
                    color: "var(--text-muted)",
                    fontSize: 15,
                    lineHeight: 1,
                    padding: "0 2px",
                    flexShrink: 0,
                    opacity: loading[member.user_id] ? 0.4 : 1,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#dc2626"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                >✕</button>
              </div>
            ))}
          </>
        )}

        {/* Board members section */}
        {boardMembers.length > 0 && (
          <>
            <p style={{ ...sectionLabel, marginTop: cardMembers.length > 0 ? 6 : 0 }}>Board members</p>
            {boardMembers.map((member) => (
              <button
                key={member.user_id}
                onClick={() => toggle(member, false)}
                disabled={loading[member.user_id]}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "5px 6px",
                  borderRadius: 6,
                  border: "none",
                  cursor: loading[member.user_id] ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  background: "none",
                  marginBottom: 2,
                  opacity: loading[member.user_id] ? 0.5 : 1,
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (!loading[member.user_id]) e.currentTarget.style.background = "var(--input-bg, #f4f5f7)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
              >
                <MemberAvatar name={member.full_name} color={member.initials_color} />
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {member.full_name}
                </span>
              </button>
            ))}
          </>
        )}

        {cardMembers.length === 0 && boardMembers.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 4px" }}>
            {search ? "No members found" : "No board members"}
          </p>
        )}
      </div>
    </div>
  );
}
