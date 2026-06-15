import { useState, useEffect, useRef } from "react";
import { mediaUrl } from "../../api/client";

const ROLE_ORDER = { owner: 0, team: 1, client: 2 };
const ROLE_LABEL = { owner: "Owners", team: "Members", client: "Guests" };

function MemberAvatar({ member, size = 36 }) {
  const initials = (member.full_name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      title={`${member.full_name}${member.email ? ` — ${member.email}` : ""}`}
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: member.initials_color || "#6c63ff",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", border: "2px solid var(--modal-bg)",
      }}
    >
      {member.avatar_url ? (
        <img
          src={mediaUrl(member.avatar_url)}
          alt={initials}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      ) : (
        <span style={{ fontSize: size * 0.33, fontWeight: 700, color: "#fff", userSelect: "none" }}>
          {initials}
        </span>
      )}
    </div>
  );
}

export default function BoardMembersPanel({ members = [], anchorEl, onClose, onInvite }) {
  const [search, setSearch] = useState("");
  const panelRef = useRef(null);
  const inputRef = useRef(null);

  // Position below the anchor element
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const panelW = 320;
    let left = rect.left;
    if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;
    if (left < 8) left = 8;
    setPos({ top: rect.bottom + 6, left });
  }, [anchorEl]);

  // Close on outside click / Escape
  useEffect(() => {
    const down = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [onClose]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const q = search.toLowerCase().trim();
  const filtered = members.filter((m) =>
    !q || m.full_name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
  );

  // Group by role
  const groups = filtered.reduce((acc, m) => {
    const role = m.role || "team";
    if (!acc[role]) acc[role] = [];
    acc[role].push(m);
    return acc;
  }, {});
  const sortedRoles = Object.keys(groups).sort(
    (a, b) => (ROLE_ORDER[a] ?? 9) - (ROLE_ORDER[b] ?? 9)
  );

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 200,
        width: 320,
        background: "var(--modal-bg)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(9,30,66,.22), 0 0 0 1px rgba(9,30,66,.06)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px 10px",
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
          Board members
        </span>
        <button
          onClick={onClose}
          style={{
            width: 26, height: 26, borderRadius: "50%", display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-muted)", fontSize: 16, lineHeight: 1,
            transition: "background .12s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          ✕
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: "0 12px 10px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--input-bg)", border: "1.5px solid var(--border)",
          borderRadius: 8, padding: "0 10px", height: 36,
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "#6c63ff"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members"
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              fontSize: 13, color: "var(--text-primary)", fontFamily: "inherit",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1, padding: 0 }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Member list */}
      <div style={{ maxHeight: 320, overflowY: "auto", padding: "0 12px" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No members found
          </div>
        ) : (
          sortedRoles.map((role) => (
            <div key={role}>
              <div style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.7px", color: "var(--text-muted)",
                padding: "6px 0 8px",
              }}>
                {ROLE_LABEL[role] || role}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingBottom: 12 }}>
                {groups[role].map((m) => (
                  <div
                    key={m.user_id}
                    title={m.full_name}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 52 }}
                  >
                    <MemberAvatar member={m} size={40} />
                    <span style={{
                      fontSize: 10, color: "var(--text-secondary)", textAlign: "center",
                      width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      lineHeight: 1.2,
                    }}>
                      {m.full_name.split(" ")[0]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer — invite action */}
      {onInvite && (
        <div style={{ padding: "8px 12px 12px", borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => { onClose(); onInvite(); }}
            style={{
              width: "100%", height: 34, borderRadius: 7,
              background: "#6c63ff", color: "#fff", border: "none",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 6, transition: "background .12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Invite members
          </button>
        </div>
      )}
    </div>
  );
}
