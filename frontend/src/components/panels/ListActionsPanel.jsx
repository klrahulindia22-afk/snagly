import { useState } from "react";
import {
  archiveList,
  updateList,
  toggleAutomationRule,
  createAutomationRule,
} from "../../api/lists";

const AUTOMATION_RULE_TYPES = [
  { type: "wip_limit_notify",    label: "Notify when WIP limit reached",  description: "Send a notification when this list reaches its card limit" },
  { type: "auto_archive_on_move", label: "Archive card when moved away",   description: "Automatically archive cards when they leave this list" },
  { type: "auto_assign_on_move",  label: "Keep assignee when moved here",  description: "Preserve card assignees when cards are moved to this list" },
  { type: "notify_on_new_card",   label: "Notify members on new card",     description: "Alert all board members when a card is added to this list" },
];

const sectionStyle = {
  padding:12, background:"var(--input-bg)", borderRadius:6, marginBottom:4,
};

const inputStyle = {
  width:"100%", background:"var(--input-bg-focus)", border:"1px solid var(--border)",
  borderRadius:4, padding:"6px 10px", color:"var(--text-primary)", fontSize:13,
  outline:"none", boxSizing:"border-box", fontFamily:"inherit",
};

function RenameSection({ list, boardId, onUpdated, onClose }) {
  const [name, setName] = useState(list.name);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || name === list.name) { onClose(); return; }
    setSaving(true);
    try {
      const res = await updateList(boardId, list.id, { name: name.trim() });
      onUpdated(res.data);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={sectionStyle} className="space-y-2">
      <p style={{ fontSize:12, color:"var(--text-secondary)" }}>Rename list</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onClose(); }}
        style={inputStyle}
        onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
      />
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={save} disabled={saving} style={{ padding:"4px 12px", background:"#6c63ff", color:"#fff", borderRadius:4, border:"none", fontSize:12, cursor:"pointer", fontFamily:"inherit", opacity:saving?0.5:1 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
        >Save</button>
        <button onClick={onClose} style={{ padding:"4px 10px", background:"none", border:"none", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
        >Cancel</button>
      </div>
    </div>
  );
}

function WipSection({ list, boardId, onUpdated, onClose }) {
  const [limit, setLimit] = useState(list.wip_limit ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const val = limit === "" ? null : parseInt(limit, 10);
      const res = await updateList(boardId, list.id, { wip_limit: val });
      onUpdated(res.data);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={sectionStyle} className="space-y-2">
      <p style={{ fontSize:12, color:"var(--text-secondary)" }}>WIP limit (blank = disabled)</p>
      <input
        type="number"
        min="1"
        value={limit}
        onChange={(e) => setLimit(e.target.value)}
        placeholder="e.g. 5"
        style={inputStyle}
        onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
      />
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={save} disabled={saving} style={{ padding:"4px 12px", background:"#6c63ff", color:"#fff", borderRadius:4, border:"none", fontSize:12, cursor:"pointer", fontFamily:"inherit", opacity:saving?0.5:1 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
        >Save</button>
        <button onClick={onClose} style={{ padding:"4px 10px", background:"none", border:"none", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
        >Cancel</button>
      </div>
    </div>
  );
}

function ColorSection({ list, boardId, onUpdated, onClose }) {
  const colors = ["#6c63ff","#0079bf","#de350b","#ff991f","#61bd4f","#00c2e0","#c377e0","#8993a4","#f2d600",null];
  const [selected, setSelected] = useState(list.color);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await updateList(boardId, list.id, { color: selected });
      onUpdated(res.data);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={sectionStyle} className="space-y-2">
      <p style={{ fontSize:12, color:"var(--text-secondary)" }}>List colour</p>
      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
        {colors.map((c, i) => (
          <button
            key={i}
            onClick={() => setSelected(c)}
            title={c || "None"}
            style={{
              width:24, height:24, borderRadius:"50%", border:"none", cursor:"pointer",
              backgroundColor: c || "transparent",
              boxShadow: selected === c
                ? `0 0 0 2px var(--modal-bg), 0 0 0 4px ${c || "var(--text-primary)"}`
                : !c ? "inset 0 0 0 1px var(--border)" : "none",
              transform: selected === c ? "scale(1.15)" : "scale(1)",
              transition:"transform .1s, box-shadow .1s",
            }}
          >
            {!c && <span style={{ fontSize:10, color:"var(--text-muted)" }}>✕</span>}
          </button>
        ))}
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={save} disabled={saving} style={{ padding:"4px 12px", background:"#6c63ff", color:"#fff", borderRadius:4, border:"none", fontSize:12, cursor:"pointer", fontFamily:"inherit", opacity:saving?0.5:1 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
        >Save</button>
        <button onClick={onClose} style={{ padding:"4px 10px", background:"none", border:"none", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
        >Cancel</button>
      </div>
    </div>
  );
}

function AutomationSection({ list, boardId, onUpdated }) {
  const rules = list.automation_rules || [];
  const [toggling, setToggling] = useState(null);

  const getRule = (type) => rules.find((r) => r.rule_type === type);

  const toggle = async (type) => {
    setToggling(type);
    try {
      const existing = getRule(type);
      if (existing) {
        await toggleAutomationRule(boardId, list.id, existing.id, !existing.is_active);
      } else {
        await createAutomationRule(boardId, list.id, { rule_type: type });
      }
      const { getLists } = await import("../../api/lists");
      const res = await getLists(boardId);
      const updated = res.data?.find((l) => l.id === list.id);
      if (updated) onUpdated(updated);
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="space-y-1">
      {AUTOMATION_RULE_TYPES.map(({ type, label, description }) => {
        const rule = getRule(type);
        const isActive = rule?.is_active ?? false;
        return (
          <div key={type}
            style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"6px 8px", borderRadius:6 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          >
            <button
              onClick={() => toggle(type)}
              disabled={toggling === type}
              style={{
                marginTop:2, width:34, height:18, borderRadius:9, border:"none", cursor:"pointer",
                background: isActive ? "#6c63ff" : "var(--border)",
                position:"relative", flexShrink:0, transition:"background .2s",
              }}
              aria-label={label}
            >
              <span style={{
                position:"absolute", top:2, width:14, height:14, borderRadius:"50%",
                background:"#fff", transition:"left .2s",
                left: isActive ? 18 : 2,
              }} />
            </button>
            <div>
              <p style={{ fontSize:12, fontWeight:500, color:"var(--text-primary)", margin:0 }}>{label}</p>
              <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>{description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ListActionsPanel({ list, boardId, myRole, onUpdated, onArchive, onClose, maxHeight }) {
  const [activeSection, setActiveSection] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const canEdit = myRole !== "client";

  const doArchive = async () => {
    if (!window.confirm(`Archive "${list.name}"? Cards will remain and can be restored.`)) return;
    setArchiving(true);
    try {
      await archiveList(boardId, list.id);
      onArchive(list.id);
      onClose();
    } finally {
      setArchiving(false);
    }
  };

  const actions = [
    { id: "rename",        label: "Rename list",       icon: "✏️", editorOnly: true },
    { id: "color",         label: "Change colour",     icon: "🎨", editorOnly: true },
    { id: "sort_name",     label: "Sort by name",      icon: "🔤", editorOnly: false },
    { id: "sort_date",     label: "Sort by date",      icon: "📅", editorOnly: false },
    { id: "archive_cards", label: "Archive all cards", icon: "📦", editorOnly: true },
    { id: "move_cards",    label: "Move all cards…",   icon: "↔️", editorOnly: true },
    { id: "archive_list",  label: "Archive this list", icon: "🗄️", editorOnly: true, danger: true },
  ];

  const bodyMaxH = maxHeight ? Math.max(200, maxHeight - 48) : undefined;

  return (
    <div style={{
      width:256, background:"var(--modal-bg)", border:"1px solid var(--border)",
      borderRadius:8, boxShadow:"0 8px 32px rgba(0,0,0,.18)",
      display:"flex", flexDirection:"column",
      maxHeight: maxHeight ? Math.max(240, maxHeight) : "calc(100vh - 80px)",
    }}>
      {/* Header — never scrolls away */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
        <p style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{list.name}</p>
        <button
          onClick={onClose}
          style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:18, lineHeight:1, marginLeft:8, flexShrink:0 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          aria-label="Close panel"
        >×</button>
      </div>

      {/* Scrollable body */}
      <div style={{ overflowY:"auto", flex:1, maxHeight: bodyMaxH }}>
        {/* Action list */}
        <div style={{ padding:8 }} className="space-y-0.5">
          {actions.map((action) => {
            if (action.editorOnly && !canEdit) return null;
            if (action.id === "archive_list") {
              return (
                <button
                  key={action.id}
                  onClick={doArchive}
                  disabled={archiving}
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, textAlign:"left", color:"#de350b", background:"none" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(222,53,11,0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  <span>{action.icon}</span>
                  <span>{archiving ? "Archiving…" : action.label}</span>
                </button>
              );
            }
            const isActive = activeSection === action.id;
            return (
              <button
                key={action.id}
                onClick={() => setActiveSection(isActive ? null : action.id)}
                style={{
                  width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:6,
                  border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, textAlign:"left",
                  background: isActive ? "var(--input-bg)" : "none",
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? "var(--input-bg)" : "none"; e.currentTarget.style.color = isActive ? "var(--text-primary)" : "var(--text-secondary)"; }}
              >
                <span>{action.icon}</span>
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>

        {/* Inline sub-sections */}
        {activeSection === "rename" && <div style={{ padding:"0 12px 12px" }}><RenameSection list={list} boardId={boardId} onUpdated={onUpdated} onClose={() => setActiveSection(null)} /></div>}
        {activeSection === "color"  && <div style={{ padding:"0 12px 12px" }}><ColorSection  list={list} boardId={boardId} onUpdated={onUpdated} onClose={() => setActiveSection(null)} /></div>}

        {/* Automation */}
        {canEdit && (
          <div style={{ borderTop:"1px solid var(--border)", padding:"10px 12px" }}>
            <p style={{ fontSize:10, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:.5, marginBottom:8 }}>Automation</p>
            <AutomationSection list={list} boardId={boardId} onUpdated={onUpdated} />
          </div>
        )}
      </div>
    </div>
  );
}
